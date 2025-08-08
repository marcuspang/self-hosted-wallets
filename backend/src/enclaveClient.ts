// Enclave Client - Handles communication with Nitro Enclave

export interface EnclaveConnection {
  instanceId: string
  enclaveId?: string
  host: string
  port: number
  isHealthy: boolean
}

export interface EnclaveRequest {
  method: string
  params: any
  id: string
  timestamp: string
}

export interface EnclaveResponse {
  success: boolean
  data?: any
  error?: string
  timestamp: string
}

export interface WalletGenerationResult {
  walletAddress: string
  shares: Array<{
    index: number
    encryptedShare: string
    shareType: 'enclave' | 'user' | 'backup'
  }>
  publicKey: string
}

export interface TransactionSigningRequest {
  transaction: {
    to: string
    value?: string
    data?: string
    gasLimit?: string
    gasPrice?: string
    maxFeePerGas?: string
    maxPriorityFeePerGas?: string
    nonce?: number
    chainId: number
  }
  walletAddress: string
  shares?: Array<{ index: number; encryptedShare: string }>
}

export interface SignedTransactionResult {
  signedTransaction: string
  txHash: string
  walletAddress: string
}

export class EnclaveClient {
  private connections: Map<string, EnclaveConnection> = new Map()

  /**
   * Add enclave connection
   */
  addConnection(
    instanceId: string,
    enclaveId: string,
    host: string,
    port = 8080
  ): void {
    const connection: EnclaveConnection = {
      instanceId,
      enclaveId,
      host,
      port,
      isHealthy: false
    }

    this.connections.set(instanceId, connection)
    console.log(`📡 Added enclave connection for instance: ${instanceId}`)
  }

  /**
   * Remove enclave connection
   */
  removeConnection(instanceId: string): boolean {
    const removed = this.connections.delete(instanceId)
    if (removed) {
      console.log(`📡 Removed enclave connection for instance: ${instanceId}`)
    }
    return removed
  }

  /**
   * Get connection for instance
   */
  getConnection(instanceId: string): EnclaveConnection | null {
    return this.connections.get(instanceId) || null
  }

  /**
   * Check enclave health
   */
  async checkHealth(instanceId: string): Promise<boolean> {
    const connection = this.getConnection(instanceId)
    if (!connection) {
      return false
    }

    try {
      const response = await this.makeRequest(instanceId, '/health', 'GET')
      const isHealthy = response.success && response.data?.status === 'healthy'

      // Update connection health status
      connection.isHealthy = isHealthy

      return isHealthy
    } catch (error) {
      console.error(`Health check failed for instance ${instanceId}:`, error)
      connection.isHealthy = false
      return false
    }
  }

  /**
   * Generate wallet keys in enclave
   */
  async generateWalletKeys(
    instanceId: string,
    walletName: string,
    userId: string
  ): Promise<WalletGenerationResult> {
    const connection = this.getConnection(instanceId)
    if (!connection) {
      throw new Error(`No enclave connection found for instance: ${instanceId}`)
    }

    if (!connection.isHealthy) {
      const healthy = await this.checkHealth(instanceId)
      if (!healthy) {
        throw new Error(`Enclave is not healthy for instance: ${instanceId}`)
      }
    }

    try {
      console.log(
        `🔑 Generating wallet keys in enclave for instance: ${instanceId}`
      )

      const response = await this.makeRequest(
        instanceId,
        '/generate-keys',
        'POST',
        { walletName, userId }
      )

      if (!(response.success && response.data)) {
        throw new Error(response.error || 'Key generation failed')
      }

      return response.data as WalletGenerationResult
    } catch (error: any) {
      throw new Error(`Failed to generate wallet keys: ${error.message}`)
    }
  }

  /**
   * Sign transaction in enclave
   */
  async signTransaction(
    instanceId: string,
    request: TransactionSigningRequest
  ): Promise<SignedTransactionResult> {
    const connection = this.getConnection(instanceId)
    if (!connection) {
      throw new Error(`No enclave connection found for instance: ${instanceId}`)
    }

    if (!connection.isHealthy) {
      const healthy = await this.checkHealth(instanceId)
      if (!healthy) {
        throw new Error(`Enclave is not healthy for instance: ${instanceId}`)
      }
    }

    try {
      console.log(
        `✍️ Signing transaction in enclave for instance: ${instanceId}`
      )

      const response = await this.makeRequest(
        instanceId,
        '/sign-transaction',
        'POST',
        request
      )

      if (!(response.success && response.data)) {
        throw new Error(response.error || 'Transaction signing failed')
      }

      return response.data as SignedTransactionResult
    } catch (error: any) {
      throw new Error(`Failed to sign transaction: ${error.message}`)
    }
  }

  /**
   * Reconstruct private key from SSS shares
   */
  async reconstructKey(
    instanceId: string,
    shares: Array<{ index: number; encryptedShare: string }>
  ): Promise<{
    walletAddress: string
    publicKey: string
    keyReconstructed: boolean
  }> {
    const connection = this.getConnection(instanceId)
    if (!connection) {
      throw new Error(`No enclave connection found for instance: ${instanceId}`)
    }

    try {
      console.log(
        `🔓 Reconstructing key in enclave for instance: ${instanceId}`
      )

      const response = await this.makeRequest(
        instanceId,
        '/reconstruct-key',
        'POST',
        { shares }
      )

      if (!(response.success && response.data)) {
        throw new Error(response.error || 'Key reconstruction failed')
      }

      return response.data
    } catch (error: any) {
      throw new Error(`Failed to reconstruct key: ${error.message}`)
    }
  }

  /**
   * Get enclave attestation
   */
  async getAttestation(instanceId: string): Promise<any> {
    const connection = this.getConnection(instanceId)
    if (!connection) {
      throw new Error(`No enclave connection found for instance: ${instanceId}`)
    }

    try {
      console.log(
        `📋 Getting attestation from enclave for instance: ${instanceId}`
      )

      const response = await this.makeRequest(instanceId, '/attestation', 'GET')

      if (!(response.success && response.data)) {
        throw new Error(response.error || 'Attestation generation failed')
      }

      return response.data
    } catch (error: any) {
      throw new Error(`Failed to get attestation: ${error.message}`)
    }
  }

  /**
   * Make HTTP request to enclave
   */
  private async makeRequest(
    instanceId: string,
    endpoint: string,
    method = 'GET',
    body?: any
  ): Promise<EnclaveResponse> {
    const connection = this.getConnection(instanceId)
    if (!connection) {
      throw new Error(`No enclave connection found for instance: ${instanceId}`)
    }

    const url = `http://${connection.host}:${connection.port}${endpoint}`
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body)
    }

    try {
      const response = await fetch(url, options)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data as EnclaveResponse
    } catch (error: any) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error(
          'Failed to connect to enclave - check if enclave is running'
        )
      }
      throw error
    }
  }

  /**
   * Get all connections
   */
  getAllConnections(): EnclaveConnection[] {
    return Array.from(this.connections.values())
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number
    healthyConnections: number
    unhealthyConnections: number
  } {
    const connections = this.getAllConnections()
    const healthy = connections.filter((conn) => conn.isHealthy)

    return {
      totalConnections: connections.length,
      healthyConnections: healthy.length,
      unhealthyConnections: connections.length - healthy.length
    }
  }

  /**
   * Mock enclave operations for development/testing
   */
  async mockGenerateWalletKeys(
    walletName: string,
    userId: string
  ): Promise<WalletGenerationResult> {
    console.log('🎭 Using mock key generation for development')

    // Simulate enclave processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const mockWalletAddress = `0x${Math.random().toString(16).substring(2, 42).padStart(40, '0')}`

    return {
      walletAddress: mockWalletAddress,
      shares: [
        {
          index: 0,
          encryptedShare: `enclave_${Math.random().toString(36).substring(2, 15)}`,
          shareType: 'enclave'
        },
        {
          index: 1,
          encryptedShare: `user_${Math.random().toString(36).substring(2, 15)}`,
          shareType: 'user'
        },
        {
          index: 2,
          encryptedShare: `backup_${Math.random().toString(36).substring(2, 15)}`,
          shareType: 'backup'
        }
      ],
      publicKey: `0x04${Math.random().toString(16).substring(2, 130).padStart(128, '0')}`
    }
  }

  /**
   * Mock transaction signing for development/testing
   */
  async mockSignTransaction(
    request: TransactionSigningRequest
  ): Promise<SignedTransactionResult> {
    console.log('🎭 Using mock transaction signing for development')

    // Simulate enclave processing delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    const mockTxHash = `0x${Math.random().toString(16).substring(2, 66).padStart(64, '0')}`
    const mockSignedTx = `0x${Math.random().toString(16).substring(2, 200)}`

    return {
      signedTransaction: mockSignedTx,
      txHash: mockTxHash,
      walletAddress: request.walletAddress
    }
  }
}

// Export singleton instance
export const enclaveClient = new EnclaveClient()
