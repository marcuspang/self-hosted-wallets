export interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  region: string
  securityGroupId?: string
  subnetId?: string
  ec2KeyName?: string
  ec2PrivateKey?: string
}

export interface CredentialCache {
  region?: string
  hasSecurityGroup?: boolean
  hasEC2Key?: boolean
  lastUpdated?: number
}

class ClientCredentialManager {
  private readonly CACHE_KEY = 'aws_credential_cache'
  private readonly CACHE_EXPIRY = 5 * 60 * 1000 // 5 minutes

  // Store non-sensitive metadata in local storage for quick access
  setCachedMetadata(metadata: CredentialCache): void {
    try {
      const cacheData = {
        ...metadata,
        lastUpdated: Date.now()
      }
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData))
    } catch (error) {
      console.warn('Failed to cache credential metadata:', error)
    }
  }

  getCachedMetadata(): CredentialCache | null {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY)
      if (!cached) return null

      const cacheData = JSON.parse(cached)
      const now = Date.now()
      
      // Check if cache is expired
      if (cacheData.lastUpdated && (now - cacheData.lastUpdated) > this.CACHE_EXPIRY) {
        this.clearCachedMetadata()
        return null
      }

      return cacheData
    } catch (error) {
      console.warn('Failed to get cached credential metadata:', error)
      return null
    }
  }

  clearCachedMetadata(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY)
    } catch (error) {
      console.warn('Failed to clear credential cache:', error)
    }
  }

  // Store temporary credential data for form persistence (session storage)
  setTemporaryCredentials(credentials: Partial<AWSCredentials>): void {
    try {
      sessionStorage.setItem('temp_aws_credentials', JSON.stringify(credentials))
    } catch (error) {
      console.warn('Failed to store temporary credentials:', error)
    }
  }

  getTemporaryCredentials(): Partial<AWSCredentials> | null {
    try {
      const temp = sessionStorage.getItem('temp_aws_credentials')
      return temp ? JSON.parse(temp) : null
    } catch (error) {
      console.warn('Failed to get temporary credentials:', error)
      return null
    }
  }

  clearTemporaryCredentials(): void {
    try {
      sessionStorage.removeItem('temp_aws_credentials')
    } catch (error) {
      console.warn('Failed to clear temporary credentials:', error)
    }
  }

  // Generate a simple hash for credential verification (client-side only)
  generateCredentialHash(credentials: AWSCredentials): string {
    const data = `${credentials.accessKeyId}:${credentials.region}:${credentials.ec2KeyName || ''}`
    return btoa(data).slice(0, 12)
  }

  // Store instance connection preferences
  setInstancePreferences(preferences: { 
    defaultRegion?: string
    preferredInstanceType?: string
    defaultSecurityGroup?: string 
  }): void {
    try {
      localStorage.setItem('aws_instance_preferences', JSON.stringify(preferences))
    } catch (error) {
      console.warn('Failed to store instance preferences:', error)
    }
  }

  getInstancePreferences(): { 
    defaultRegion?: string
    preferredInstanceType?: string
    defaultSecurityGroup?: string 
  } | null {
    try {
      const prefs = localStorage.getItem('aws_instance_preferences')
      return prefs ? JSON.parse(prefs) : null
    } catch (error) {
      console.warn('Failed to get instance preferences:', error)
      return null
    }
  }

  // Store enclave configuration
  setEnclaveConfig(config: {
    cpuCount?: number
    memoryMB?: number
    debugMode?: boolean
  }): void {
    try {
      localStorage.setItem('enclave_config', JSON.stringify(config))
    } catch (error) {
      console.warn('Failed to store enclave config:', error)
    }
  }

  getEnclaveConfig(): {
    cpuCount?: number
    memoryMB?: number
    debugMode?: boolean
  } | null {
    try {
      const config = localStorage.getItem('enclave_config')
      return config ? JSON.parse(config) : { cpuCount: 2, memoryMB: 1024, debugMode: true }
    } catch (error) {
      console.warn('Failed to get enclave config:', error)
      return { cpuCount: 2, memoryMB: 1024, debugMode: true }
    }
  }

  // Clear all locally stored data
  clearAllCache(): void {
    this.clearCachedMetadata()
    this.clearTemporaryCredentials()
    try {
      localStorage.removeItem('aws_instance_preferences')
      localStorage.removeItem('enclave_config')
    } catch (error) {
      console.warn('Failed to clear all cache:', error)
    }
  }
}

// Export singleton instance
export const credentialManager = new ClientCredentialManager()

// Utility function to check if we're in browser environment
export const isBrowser = typeof window !== 'undefined'

// React hook for credential status
export function useCredentialStatus() {
  const cachedMetadata = credentialManager.getCachedMetadata()
  const instancePrefs = credentialManager.getInstancePreferences()
  
  return {
    hasCache: !!cachedMetadata,
    isConfigured: cachedMetadata?.region != null,
    region: cachedMetadata?.region,
    hasSecurityGroup: cachedMetadata?.hasSecurityGroup,
    hasEC2Key: cachedMetadata?.hasEC2Key,
    preferences: instancePrefs,
    lastUpdated: cachedMetadata?.lastUpdated
  }
}