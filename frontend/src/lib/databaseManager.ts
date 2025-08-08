export interface DatabaseConnection {
  url: string
  name: string
  type: 'postgresql' | 'mysql' | 'sqlite'
  host?: string
  port?: number
  database?: string
  username?: string
  isConnected?: boolean
  lastTested?: number
}

export interface DatabaseConnectionCache {
  connections: DatabaseConnection[]
  activeConnection?: string // URL of the active connection
  lastUpdated: number
}

class ClientDatabaseManager {
  private readonly CACHE_KEY = 'database_connections'
  private readonly CACHE_EXPIRY = 24 * 60 * 60 * 1000 // 24 hours

  // Store database connections in local storage
  setConnections(connections: DatabaseConnection[]): void {
    try {
      const cacheData: DatabaseConnectionCache = {
        connections,
        lastUpdated: Date.now()
      }
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData))
    } catch (error) {
      console.warn('Failed to cache database connections:', error)
    }
  }

  getConnections(): DatabaseConnection[] {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY)
      if (!cached) {
        return []
      }

      const cacheData: DatabaseConnectionCache = JSON.parse(cached)
      const now = Date.now()

      // Check if cache is expired
      if (
        cacheData.lastUpdated &&
        now - cacheData.lastUpdated > this.CACHE_EXPIRY
      ) {
        this.clearConnections()
        return []
      }

      return cacheData.connections || []
    } catch (error) {
      console.warn('Failed to get cached database connections:', error)
      return []
    }
  }

  // Add a new database connection
  addConnection(connection: DatabaseConnection): void {
    const connections = this.getConnections()
    const existingIndex = connections.findIndex(
      (conn) => conn.url === connection.url
    )

    if (existingIndex >= 0) {
      connections[existingIndex] = {
        ...connections[existingIndex],
        ...connection
      }
    } else {
      connections.push(connection)
    }

    this.setConnections(connections)
  }

  // Remove a database connection
  removeConnection(url: string): void {
    const connections = this.getConnections().filter((conn) => conn.url !== url)
    this.setConnections(connections)
  }

  // Set the active database connection
  setActiveConnection(url: string): void {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY)
      if (!cached) {
        return
      }

      const cacheData: DatabaseConnectionCache = JSON.parse(cached)
      cacheData.activeConnection = url
      cacheData.lastUpdated = Date.now()

      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData))
    } catch (error) {
      console.warn('Failed to set active database connection:', error)
    }
  }

  // Get the active database connection
  getActiveConnection(): DatabaseConnection | null {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY)
      if (!cached) {
        return null
      }

      const cacheData: DatabaseConnectionCache = JSON.parse(cached)
      if (!cacheData.activeConnection) {
        return null
      }

      const connections = cacheData.connections || []
      return (
        connections.find((conn) => conn.url === cacheData.activeConnection) ||
        null
      )
    } catch (error) {
      console.warn('Failed to get active database connection:', error)
      return null
    }
  }

  // Update connection status after testing
  updateConnectionStatus(url: string, isConnected: boolean): void {
    const connections = this.getConnections()
    const connectionIndex = connections.findIndex((conn) => conn.url === url)

    if (connectionIndex >= 0) {
      connections[connectionIndex].isConnected = isConnected
      connections[connectionIndex].lastTested = Date.now()
      this.setConnections(connections)
    }
  }

  // Parse database URL into components
  parseConnectionUrl(url: string): Partial<DatabaseConnection> {
    try {
      const urlObj = new URL(url)
      const type = urlObj.protocol.replace(
        ':',
        ''
      ) as DatabaseConnection['type']

      return {
        url,
        type:
          type === 'postgresql'
            ? 'postgresql'
            : (type as DatabaseConnection['type']),
        host: urlObj.hostname,
        port: urlObj.port ? Number.parseInt(urlObj.port, 10) : undefined,
        database: urlObj.pathname.slice(1), // Remove leading slash
        username: urlObj.username || undefined
      }
    } catch (error) {
      console.warn('Failed to parse database URL:', error)
      return { url }
    }
  }

  // Generate a display name for the connection
  generateConnectionName(connection: DatabaseConnection): string {
    if (connection.name) {
      return connection.name
    }

    const parsed = this.parseConnectionUrl(connection.url)
    if (parsed.host && parsed.database) {
      return `${parsed.database} @ ${parsed.host}`
    }

    return (
      connection.url.substring(0, 30) +
      (connection.url.length > 30 ? '...' : '')
    )
  }

  // Store database preferences
  setDatabasePreferences(preferences: {
    autoConnect?: boolean
    maxConnections?: number
    connectionTimeout?: number
  }): void {
    try {
      localStorage.setItem('database_preferences', JSON.stringify(preferences))
    } catch (error) {
      console.warn('Failed to store database preferences:', error)
    }
  }

  getDatabasePreferences(): {
    autoConnect?: boolean
    maxConnections?: number
    connectionTimeout?: number
  } {
    try {
      const prefs = localStorage.getItem('database_preferences')
      return prefs
        ? JSON.parse(prefs)
        : { autoConnect: true, maxConnections: 5, connectionTimeout: 30_000 }
    } catch (error) {
      console.warn('Failed to get database preferences:', error)
      return { autoConnect: true, maxConnections: 5, connectionTimeout: 30_000 }
    }
  }

  // Clear all database data
  clearConnections(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY)
    } catch (error) {
      console.warn('Failed to clear database connections:', error)
    }
  }

  clearAllDatabase(): void {
    this.clearConnections()
    try {
      localStorage.removeItem('database_preferences')
    } catch (error) {
      console.warn('Failed to clear database preferences:', error)
    }
  }

  // Validate database URL format
  validateDatabaseUrl(url: string): { valid: boolean; error?: string } {
    try {
      const urlObj = new URL(url)
      const supportedProtocols = [
        'postgresql:',
        'postgres:',
        'mysql:',
        'sqlite:'
      ]

      if (!supportedProtocols.includes(urlObj.protocol)) {
        return {
          valid: false,
          error: `Unsupported database type: ${urlObj.protocol}. Supported types: PostgreSQL, MySQL, SQLite`
        }
      }

      if (urlObj.protocol !== 'sqlite:' && !urlObj.hostname) {
        return {
          valid: false,
          error: 'Database URL must include hostname'
        }
      }

      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error:
          'Invalid URL format. Example: postgresql://user:password@host:5432/database'
      }
    }
  }

  // Get connection statistics
  getConnectionStats() {
    const connections = this.getConnections()
    const activeConnection = this.getActiveConnection()

    return {
      totalConnections: connections.length,
      connectedCount: connections.filter((conn) => conn.isConnected).length,
      hasActiveConnection: !!activeConnection,
      activeConnectionName: activeConnection
        ? this.generateConnectionName(activeConnection)
        : null,
      lastTested: Math.max(...connections.map((conn) => conn.lastTested || 0))
    }
  }
}

// Export singleton instance
export const databaseManager = new ClientDatabaseManager()

// React hook for database connections
export function useDatabaseConnections() {
  const connections = databaseManager.getConnections()
  const activeConnection = databaseManager.getActiveConnection()
  const preferences = databaseManager.getDatabasePreferences()
  const stats = databaseManager.getConnectionStats()

  return {
    connections,
    activeConnection,
    preferences,
    stats,
    hasConnections: connections.length > 0,
    isConnected: !!activeConnection?.isConnected
  }
}
