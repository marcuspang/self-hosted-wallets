import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DescribeRegionsCommand, EC2Client } from '@aws-sdk/client-ec2'
import {
  CreateKeyCommand,
  DecryptCommand,
  EncryptCommand,
  KMSClient
} from '@aws-sdk/client-kms'

export interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  region: string
  securityGroupId?: string
  subnetId?: string
  ec2KeyName?: string
  ec2PrivateKey?: string
}

export interface CredentialStore {
  [key: string]: string // encrypted values
}

export class KMSCredentialManager {
  private kmsClient: KMSClient
  private keyId: string
  private credentialStore: CredentialStore

  constructor(region = 'us-east-1', keyId?: string) {
    this.kmsClient = new KMSClient({ region })
    this.keyId = keyId || process.env['KMS_KEY_ID'] || ''
    this.credentialStore = {}
  }

  async createKMSKey(
    description = 'Embedded Wallet Credentials'
  ): Promise<string> {
    try {
      const command = new CreateKeyCommand({
        Description: description,
        KeyUsage: 'ENCRYPT_DECRYPT',
        KeySpec: 'SYMMETRIC_DEFAULT'
      })

      const response = await this.kmsClient.send(command)
      const keyId = response.KeyMetadata?.KeyId

      if (!keyId) {
        throw new Error('Failed to create KMS key')
      }

      this.keyId = keyId
      console.log(`✅ Created KMS key: ${keyId}`)
      return keyId
    } catch (error: any) {
      console.error('Error creating KMS key:', error)
      if (error.name === 'AccessDeniedException') {
        throw new Error(
          'AWS credentials do not have permission to create KMS keys. Please provide a KMS key ID in the KMS_KEY_ID environment variable, or grant kms:CreateKey permission to your AWS user.'
        )
      }
      throw new Error(`Failed to create KMS key: ${error.message}`)
    }
  }

  async encryptCredential(plaintext: string): Promise<string> {
    try {
      // Create KMS key if not already set
      if (!this.keyId) {
        console.log('No KMS key ID provided, creating new KMS key...')
        this.keyId = await this.createKMSKey()
      }

      const command = new EncryptCommand({
        KeyId: this.keyId,
        Plaintext: Buffer.from(plaintext, 'utf-8')
      })

      const response = await this.kmsClient.send(command)

      if (!response.CiphertextBlob) {
        throw new Error('Encryption failed - no ciphertext returned')
      }

      return Buffer.from(response.CiphertextBlob).toString('base64')
    } catch (error: any) {
      console.error('Error encrypting credential:', error)
      if (error.name === 'AccessDeniedException') {
        throw new Error(
          'AWS credentials do not have permission to encrypt with KMS. Please grant kms:Encrypt permission to your AWS user.'
        )
      }
      throw new Error(`Failed to encrypt credential: ${error.message}`)
    }
  }

  async decryptCredential(ciphertext: string): Promise<string> {
    try {
      const command = new DecryptCommand({
        CiphertextBlob: Buffer.from(ciphertext, 'base64')
      })

      const response = await this.kmsClient.send(command)

      if (!response.Plaintext) {
        throw new Error('Decryption failed')
      }

      return Buffer.from(response.Plaintext).toString('utf-8')
    } catch (error) {
      console.error('Error decrypting credential:', error)
      throw error
    }
  }

  async storeCredentials(credentials: AWSCredentials): Promise<void> {
    try {
      // Ensure we have a KMS key before encrypting
      if (!this.keyId) {
        console.log('Creating KMS key for credential encryption...')
        this.keyId = await this.createKMSKey()
      }

      const encryptedCredentials: CredentialStore = {}

      for (const [key, value] of Object.entries(credentials)) {
        if (value) {
          encryptedCredentials[key] = await this.encryptCredential(value)
        }
      }

      this.credentialStore = encryptedCredentials

      // Store credentials and KMS key ID
      const dataToStore = {
        kmsKeyId: this.keyId,
        credentials: encryptedCredentials
      }

      const credentialsPath = join(
        process.cwd(),
        '.aws-credentials-encrypted.json'
      )
      writeFileSync(credentialsPath, JSON.stringify(dataToStore, null, 2))
    } catch (error) {
      console.error('Error storing credentials:', error)
      throw error
    }
  }

  async getCredentials(): Promise<AWSCredentials | null> {
    try {
      let storedData:
        | { kmsKeyId?: string; credentials?: CredentialStore }
        | CredentialStore = {}

      try {
        const credentialsPath = join(
          process.cwd(),
          '.aws-credentials-encrypted.json'
        )
        const fileContent = readFileSync(credentialsPath, 'utf-8')
        storedData = JSON.parse(fileContent)
      } catch {
        // File doesn't exist, return null
        return null
      }

      // Handle both old format (direct credentials) and new format (with kmsKeyId)
      let encryptedCredentials: CredentialStore | string
      if ('kmsKeyId' in storedData && 'credentials' in storedData) {
        // New format with KMS key ID
        this.keyId = storedData.kmsKeyId || this.keyId
        encryptedCredentials = storedData.credentials || {}
      } else {
        // Old format (direct credentials)
        encryptedCredentials = storedData as CredentialStore
      }

      if (Object.keys(encryptedCredentials).length === 0) {
        return null
      }

      const decryptedCredentials: Partial<AWSCredentials> = {}

      for (const [key, encryptedValue] of Object.entries(
        encryptedCredentials
      )) {
        decryptedCredentials[key as keyof AWSCredentials] =
          await this.decryptCredential(encryptedValue)
      }

      return decryptedCredentials as AWSCredentials
    } catch (error) {
      console.error('Error getting credentials:', error)
      throw error
    }
  }

  async clearCredentials(): Promise<void> {
    try {
      this.credentialStore = {}

      try {
        const credentialsPath = join(
          process.cwd(),
          '.aws-credentials-encrypted.json'
        )
        unlinkSync(credentialsPath)
      } catch {
        // File doesn't exist, ignore
      }
    } catch (error) {
      console.error('Error clearing credentials:', error)
      throw error
    }
  }

  setKeyId(keyId: string): void {
    this.keyId = keyId
  }

  getKeyId(): string {
    return this.keyId
  }

  async validateCredentials(credentials: AWSCredentials): Promise<boolean> {
    try {
      // Test the credentials by making a simple AWS API call
      const testEc2Client = new EC2Client({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey
        }
      })

      const command = new DescribeRegionsCommand({})
      await testEc2Client.send(command)

      return true
    } catch (error) {
      console.error('Credential validation failed:', error)
      return false
    }
  }
}

// Singleton instance for server-side use
let kmsManager: KMSCredentialManager | null = null

export function getKMSCredentialManager(
  region?: string,
  keyId?: string
): KMSCredentialManager {
  if (!kmsManager) {
    kmsManager = new KMSCredentialManager(region, keyId)
  }
  return kmsManager
}
