import * as crypto from 'node:crypto'
import { DescribeRegionsCommand, EC2Client } from '@aws-sdk/client-ec2'

export interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  region: string
  securityGroupId?: string
  subnetId?: string
  ec2KeyName?: string
  ec2PrivateKey?: string
}

export interface EncryptedCredentials {
  encryptedData: string
  iv: string
}

export class CredentialManager {
  private static readonly ALGORITHM = 'aes-256-cbc'
  private static readonly KEY_LENGTH = 32
  private static readonly IV_LENGTH = 16

  /**
   * Generate a random encryption key for the client
   */
  static generateEncryptionKey(): string {
    return crypto.randomBytes(this.KEY_LENGTH).toString('hex')
  }

  /**
   * Encrypt credentials for client-side storage
   */
  static encryptCredentials(credentials: AWSCredentials, key: string): EncryptedCredentials {
    const keyBuffer = Buffer.from(key, 'hex')
    const iv = crypto.randomBytes(this.IV_LENGTH)
    const cipher = crypto.createCipheriv(this.ALGORITHM, keyBuffer, iv)
    
    const credentialsJson = JSON.stringify(credentials)
    let encrypted = cipher.update(credentialsJson, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex')
    }
  }

  /**
   * Decrypt credentials received from client
   */
  static decryptCredentials(encryptedCredentials: EncryptedCredentials, key: string): AWSCredentials {
    const keyBuffer = Buffer.from(key, 'hex')
    const iv = Buffer.from(encryptedCredentials.iv, 'hex')
    const decipher = crypto.createDecipheriv(this.ALGORITHM, keyBuffer, iv)
    
    let decrypted = decipher.update(encryptedCredentials.encryptedData, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return JSON.parse(decrypted)
  }

  /**
   * Validate AWS credentials by making a simple API call
   */
  static async validateCredentials(credentials: AWSCredentials): Promise<boolean> {
    try {
      const ec2Client = new EC2Client({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey
        }
      })

      const command = new DescribeRegionsCommand({})
      await ec2Client.send(command)
      return true
    } catch (error) {
      console.error('Credential validation failed:', error)
      return false
    }
  }

  /**
   * Create EC2 client with provided credentials
   */
  static createEC2Client(credentials: AWSCredentials): EC2Client {
    return new EC2Client({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey
      }
    })
  }
}