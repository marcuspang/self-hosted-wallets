import { AlertCircle, CheckCircle, Database, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
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

export function DatabaseSetup() {
  const [databaseUrl, setDatabaseUrl] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle')

  const testConnectionMutation = useMutation({
    mutationFn: async (databaseUrl: string) => {
      const response = await fetch('/api/database/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ databaseUrl })
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Connection failed')
      }
      return result
    },
    onMutate: () => {
      setConnectionStatus('testing')
    },
    onSuccess: () => {
      setConnectionStatus('success')
    },
    onError: () => {
      setConnectionStatus('error')
    }
  })

  const setupSchemaMutation = useMutation({
    mutationFn: async (databaseUrl: string) => {
      const response = await fetch('/api/database/setup-schema', {
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

  const testConnection = () => {
    if (!databaseUrl.trim()) return
    testConnectionMutation.mutate(databaseUrl)
  }

  const setupSchema = () => {
    setupSchemaMutation.mutate(databaseUrl)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-lg">Database Connection Setup</h3>
        <p className="text-muted-foreground text-sm">
          Connect your PostgreSQL database to store wallet and transaction data
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>PostgreSQL Connection</span>
            {setupSchemaMutation.isSuccess && (
              <Badge className="ml-2">
                <CheckCircle className="mr-1 h-3 w-3" />
                Complete
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Provide your PostgreSQL connection string. The schema will be
            automatically created.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="database-url">Database Connection String</Label>
            <Input
              id="database-url"
              onChange={(e) => setDatabaseUrl(e.target.value)}
              placeholder="postgresql://username:password@hostname:5432/database"
              type="password"
              value={databaseUrl}
            />
          </div>

          <div className="flex space-x-2">
            <Button
              disabled={!databaseUrl.trim() || connectionStatus === 'testing'}
              onClick={testConnection}
              variant="outline"
            >
              {connectionStatus === 'testing' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              Test Connection
            </Button>

            {connectionStatus === 'success' && (
              <Button 
                disabled={setupSchemaMutation.isPending || setupSchemaMutation.isSuccess} 
                onClick={setupSchema}
              >
                {setupSchemaMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Setup Schema
              </Button>
            )}
          </div>

          {connectionStatus === 'success' && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Database connection successful! You can now set up the schema.
              </AlertDescription>
            </Alert>
          )}

          {(connectionStatus === 'error' || testConnectionMutation.isError) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Connection failed: {testConnectionMutation.error?.message || 'Unknown error'}
              </AlertDescription>
            </Alert>
          )}

          {setupSchemaMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Schema setup failed: {setupSchemaMutation.error?.message || 'Unknown error'}
              </AlertDescription>
            </Alert>
          )}

          {setupSchemaMutation.isSuccess && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Database schema has been successfully created. You can now
                proceed with AWS setup.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Database Schema</CardTitle>
          <CardDescription>
            The following tables will be created in your database:
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
    </div>
  )
}
