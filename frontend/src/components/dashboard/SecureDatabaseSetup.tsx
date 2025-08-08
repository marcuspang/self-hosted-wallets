import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Settings,
  Trash2
} from 'lucide-react'
import { useState } from 'react'
import { getApiUrl } from '../../lib/api'
import {
  type DatabaseConnection,
  databaseManager,
  useDatabaseConnections
} from '../../lib/databaseManager'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'

export function SecureDatabaseSetup() {
  const queryClient = useQueryClient()
  const { connections, activeConnection, stats } = useDatabaseConnections()
  const [newConnectionUrl, setNewConnectionUrl] = useState('')
  const [newConnectionName, setNewConnectionName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState<string>('')

  const testConnectionMutation = useMutation({
    mutationFn: async ({ url, name }: { url: string; name?: string }) => {
      const response = await fetch(getApiUrl('/api/database/test-connection'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ databaseUrl: url })
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Connection failed')
      }
      return { result, url, name }
    },
    onSuccess: ({ url, name }) => {
      // Parse connection details and save to local storage
      const connectionDetails = databaseManager.parseConnectionUrl(url)
      const connection: DatabaseConnection = {
        url,
        name:
          name ||
          databaseManager.generateConnectionName({ ...connectionDetails, url }),
        type: connectionDetails.type || 'postgresql',
        host: connectionDetails.host,
        port: connectionDetails.port,
        database: connectionDetails.database,
        username: connectionDetails.username,
        isConnected: true,
        lastTested: Date.now()
      }

      databaseManager.addConnection(connection)
      databaseManager.setActiveConnection(url)

      // Clear form
      setNewConnectionUrl('')
      setNewConnectionName('')
    },
    onError: (error, { url }) => {
      // Update connection status to failed
      databaseManager.updateConnectionStatus(url, false)
    }
  })

  const setupSchemaMutation = useMutation({
    mutationFn: async (databaseUrl: string) => {
      const response = await fetch(getApiUrl('/api/database/setup-schema'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ databaseUrl })
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Schema setup failed')
      }
      return result
    }
  })

  const handleTestConnection = () => {
    if (!newConnectionUrl.trim()) {
      return
    }

    const validation = databaseManager.validateDatabaseUrl(newConnectionUrl)
    if (!validation.valid) {
      // Handle validation error
      return
    }

    testConnectionMutation.mutate({
      url: newConnectionUrl,
      name: newConnectionName
    })
  }

  const handleSetupSchema = () => {
    const activeUrl = activeConnection?.url || selectedConnection
    if (!activeUrl) {
      return
    }

    setupSchemaMutation.mutate(activeUrl)
  }

  const handleRemoveConnection = (url: string) => {
    databaseManager.removeConnection(url)
    if (activeConnection?.url === url) {
      // Set another connection as active if available
      const remainingConnections = databaseManager.getConnections()
      if (remainingConnections.length > 0) {
        databaseManager.setActiveConnection(remainingConnections[0].url)
      }
    }
    queryClient.invalidateQueries({ queryKey: ['database-connections'] })
  }

  const handleSetActiveConnection = (url: string) => {
    databaseManager.setActiveConnection(url)
    setSelectedConnection(url)
    queryClient.invalidateQueries({ queryKey: ['database-connections'] })
  }

  const getConnectionTypeColor = (type: string) => {
    switch (type) {
      case 'postgresql':
        return 'bg-blue-100 text-blue-800'
      case 'mysql':
        return 'bg-orange-100 text-orange-800'
      case 'sqlite':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const maskDatabaseUrl = (url: string) => {
    try {
      const urlObj = new URL(url)
      if (urlObj.password) {
        urlObj.password = '****'
      }
      return urlObj.toString()
    } catch {
      return url
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-lg">Secure Database Management</h3>
        <p className="text-muted-foreground text-sm">
          Manage database connections with local storage caching
        </p>
      </div>

      {/* Connection Stats */}
      {stats.totalConnections > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                Total Connections
              </CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">{stats.totalConnections}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">Connected</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl text-green-600">
                {stats.connectedCount}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                Active Connection
              </CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-medium text-blue-600 text-sm">
                {stats.activeConnectionName || 'None'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs className="space-y-4" defaultValue="connections">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="schema">Schema Setup</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="connections">
          {/* Add New Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Plus className="h-5 w-5" />
                <span>Add Database Connection</span>
              </CardTitle>
              <CardDescription>
                Connect to PostgreSQL, MySQL, or SQLite databases
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="connection-name">
                    Connection Name (Optional)
                  </Label>
                  <Input
                    id="connection-name"
                    onChange={(e) => setNewConnectionName(e.target.value)}
                    placeholder="Production DB"
                    value={newConnectionName}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="connection-url">Database Connection URL</Label>
                <div className="relative">
                  <Input
                    id="connection-url"
                    onChange={(e) => setNewConnectionUrl(e.target.value)}
                    placeholder="postgresql://user:password@host:5432/database"
                    type={showPassword ? 'text' : 'password'}
                    value={newConnectionUrl}
                  />
                  <Button
                    className="-translate-y-1/2 absolute top-1/2 right-2 h-6 w-6 p-0"
                    onClick={() => setShowPassword(!showPassword)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Supported: PostgreSQL, MySQL, SQLite. Connection URLs are
                  stored securely in local storage.
                </p>
              </div>

              {testConnectionMutation.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {testConnectionMutation.error.message}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                disabled={
                  !newConnectionUrl.trim() || testConnectionMutation.isPending
                }
                onClick={handleTestConnection}
              >
                {testConnectionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Database className="mr-2 h-4 w-4" />
                )}
                Test & Save Connection
              </Button>
            </CardContent>
          </Card>

          {/* Existing Connections */}
          {connections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Saved Connections</CardTitle>
                <CardDescription>
                  Manage your database connections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {connections.map((connection) => (
                    <div
                      className="flex items-center justify-between rounded-lg border p-3"
                      key={connection.url}
                    >
                      <div className="flex items-center space-x-3">
                        <Database className="h-4 w-4" />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-sm">
                              {databaseManager.generateConnectionName(
                                connection
                              )}
                            </span>
                            <Badge
                              className={getConnectionTypeColor(
                                connection.type
                              )}
                            >
                              {connection.type}
                            </Badge>
                            {activeConnection?.url === connection.url && (
                              <Badge variant="outline">Active</Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {maskDatabaseUrl(connection.url)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1">
                          {connection.isConnected ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="text-xs">
                            {connection.isConnected
                              ? 'Connected'
                              : 'Disconnected'}
                          </span>
                        </div>
                        {activeConnection?.url !== connection.url && (
                          <Button
                            onClick={() =>
                              handleSetActiveConnection(connection.url)
                            }
                            size="sm"
                            variant="outline"
                          >
                            Set Active
                          </Button>
                        )}
                        <Button
                          onClick={() => handleRemoveConnection(connection.url)}
                          size="sm"
                          variant="destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent className="space-y-4" value="schema">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5" />
                <span>Database Schema Setup</span>
              </CardTitle>
              <CardDescription>
                Create the required tables for embedded wallet functionality
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeConnection ? (
                <>
                  <div className="space-y-2">
                    <Label>Active Database</Label>
                    <div className="flex items-center space-x-2 rounded-md bg-muted p-2">
                      <Database className="h-4 w-4" />
                      <span className="font-medium text-sm">
                        {databaseManager.generateConnectionName(
                          activeConnection
                        )}
                      </span>
                      <Badge
                        className={getConnectionTypeColor(
                          activeConnection.type
                        )}
                      >
                        {activeConnection.type}
                      </Badge>
                    </div>
                  </div>

                  <Button
                    disabled={
                      setupSchemaMutation.isPending ||
                      setupSchemaMutation.isSuccess
                    }
                    onClick={handleSetupSchema}
                  >
                    {setupSchemaMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    Setup Database Schema
                  </Button>

                  {setupSchemaMutation.isError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Schema setup failed:{' '}
                        {setupSchemaMutation.error?.message}
                      </AlertDescription>
                    </Alert>
                  )}

                  {setupSchemaMutation.isSuccess && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Database schema has been successfully created!
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Please add and connect to a database first.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Schema Information */}
          <Card>
            <CardHeader>
              <CardTitle>Database Schema</CardTitle>
              <CardDescription>
                Tables that will be created in your database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">users</Badge>
                  <span>Ethereum address mapping</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">wallets</Badge>
                  <span>Wallet addresses and enclave instances</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">wallet_keys</Badge>
                  <span>Shamir Secret Sharing key metadata</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">policies</Badge>
                  <span>Transaction policies and limits</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">transactions</Badge>
                  <span>Transaction history and gas sponsorship</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
