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

export interface StoredCredentials {
  encryptedCredentials: EncryptedCredentials
  encryptionKey: string
  timestamp: number
}

export class CredentialManager {
  private static readonly STORAGE_KEY = 'aws-encrypted-credentials'
  private static readonly EXPIRY_HOURS = 24 // Credentials expire after 24 hours

  /**
   * Store encrypted credentials in localStorage
   */
  static storeCredentials(
    encryptedCredentials: EncryptedCredentials,
    encryptionKey: string
  ): void {
    const storedCredentials: StoredCredentials = {
      encryptedCredentials,
      encryptionKey,
      timestamp: Date.now()
    }
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storedCredentials))
  }

  /**
   * Get stored credentials from localStorage
   */
  static getStoredCredentials(): StoredCredentials | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (!stored) return null

      const credentials: StoredCredentials = JSON.parse(stored)
      
      // Check if credentials are expired
      const hoursSinceStored = (Date.now() - credentials.timestamp) / (1000 * 60 * 60)
      if (hoursSinceStored > this.EXPIRY_HOURS) {
        this.clearCredentials()
        return null
      }

      return credentials
    } catch (error) {
      console.error('Error retrieving stored credentials:', error)
      return null
    }
  }

  /**
   * Check if credentials are currently stored and valid
   */
  static hasValidCredentials(): boolean {
    return this.getStoredCredentials() !== null
  }

  /**
   * Clear stored credentials
   */
  static clearCredentials(): void {
    localStorage.removeItem(this.STORAGE_KEY)
  }

  /**
   * Get credentials for API requests
   */
  static getCredentialsForRequest(): { encryptedCredentials: EncryptedCredentials; encryptionKey: string } | null {
    const stored = this.getStoredCredentials()
    if (!stored) return null

    return {
      encryptedCredentials: stored.encryptedCredentials,
      encryptionKey: stored.encryptionKey
    }
  }

  /**
   * Create a request body with credentials included
   */
  static createRequestWithCredentials(additionalData: Record<string, any> = {}) {
    const credentials = this.getCredentialsForRequest()
    if (!credentials) {
      throw new Error('No valid AWS credentials found. Please configure credentials first.')
    }

    return {
      ...credentials,
      ...additionalData
    }
  }

  /**
   * Get credential status for display
   */
  static getCredentialStatus(): {
    configured: boolean
    expiresAt: Date | null
    hoursUntilExpiry: number | null
  } {
    const stored = this.getStoredCredentials()
    
    if (!stored) {
      return {
        configured: false,
        expiresAt: null,
        hoursUntilExpiry: null
      }
    }

    const expiresAt = new Date(stored.timestamp + (this.EXPIRY_HOURS * 60 * 60 * 1000))
    const hoursUntilExpiry = Math.max(0, (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60))

    return {
      configured: true,
      expiresAt,
      hoursUntilExpiry: Math.floor(hoursUntilExpiry)
    }
  }
}

// Legacy support - remove in future version
export const credentialManager = {
  clearAllCache: () => CredentialManager.clearCredentials(),
  getCachedMetadata: () => null,
  getInstancePreferences: () => null,
  getEnclaveConfig: () => ({ cpuCount: 2, memoryMB: 1024, debugMode: true })
}

export const isBrowser = typeof window !== 'undefined'

export function useCredentialStatus() {
  const status = CredentialManager.getCredentialStatus()
  
  return {
    hasCache: status.configured,
    isConfigured: status.configured,
    configured: status.configured,
    expiresAt: status.expiresAt,
    hoursUntilExpiry: status.hoursUntilExpiry,
    preferences: null,
    lastUpdated: null
  }
}