import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Clock,
  Cloud,
  Database,
  Key,
  Loader2,
  Server,
  Settings,
  Shield
} from 'lucide-react'
import { useState } from 'react'
import { getApiUrl } from '../../lib/api'
import { CredentialManager } from '../../lib/credentialManager'
import { Alert, AlertDescription } from '../ui/alert'
import { Button } from '../ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { AWSCredentialSetup } from './AWSCredentialSetup'
import { AWSInstanceManagement } from './AWSInstanceManagement'

interface ValidationResponse {
  valid: boolean
  configured: boolean
  region: string
  hasSecurityGroup: boolean
  hasEC2Key: boolean
}

interface SecurityGroupStatus {
  success: boolean
  securityGroupId: string
  groupName: string
  description: string
  hasSSHAccess: boolean
  vpcId: string
  status: 'configured' | 'needs_ssh_rule'
}

interface OperationStats {
  totalInstances: number
  runningInstances: number
  activeEnclaves: number
  totalWallets: number
}

interface Instance {
  id: string
  status: 'pending' | 'running' | 'stopped' | 'terminated'
  type: string
  region: string
  enclaveStatus?: 'none' | 'building' | 'running' | 'failed'
}

interface Wallet {
  id: string
  name: string
  address: string
  createdAt: string
}

export function AWSOperationCenter() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('overview')

  // Check if credentials are available
  const credentialStatus = CredentialManager.getCredentialStatus()
  const hasCredentials = credentialStatus.configured

  // Validate stored credentials with server
  const { data: validationResult, isLoading: isValidating } =
    useQuery<ValidationResponse>({
      queryKey: ['aws-credentials-validation'],
      queryFn: async () => {
        const credentialsForRequest =
          CredentialManager.getCredentialsForRequest()
        if (!credentialsForRequest) {
          throw new Error('No credentials available')
        }

        const response = await fetch(
          getApiUrl('/api/aws/credentials/validate'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(credentialsForRequest)
          }
        )

        if (!response.ok) {
          throw new Error('Failed to validate credentials')
        }
        return response.json()
      },
      enabled: hasCredentials,
      retry: false,
      refetchInterval: 5 * 60 * 1000 // Revalidate every 5 minutes
    })

  // Check security group status if credentials are valid
  const { data: securityGroupStatus, isLoading: isCheckingSecurityGroup } =
    useQuery<SecurityGroupStatus>({
      queryKey: ['aws-security-groups-status'],
      queryFn: async () => {
        const credentialsForRequest =
          CredentialManager.getCredentialsForRequest()
        if (!credentialsForRequest) {
          throw new Error('No credentials available')
        }

        const response = await fetch(
          getApiUrl('/api/aws/security-groups/status'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(credentialsForRequest)
          }
        )

        if (!response.ok) {
          throw new Error('Failed to check security group status')
        }
        return response.json()
      },
      enabled: hasCredentials && validationResult?.valid,
      retry: false,
      refetchInterval: 5 * 60 * 1000 // Check every 5 minutes
    })

  // Fetch instances if credentials are valid
  const { data: instances = [] } = useQuery({
    queryKey: ['aws-instances'],
    queryFn: async () => {
      try {
        const requestBody = CredentialManager.createRequestWithCredentials()

        const response = await fetch(getApiUrl('/api/aws/instances/list'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
          throw new Error('Failed to fetch instances')
        }
        const data = (await response.json()) as { instances: Instance[] }
        return data.instances
      } catch (error) {
        console.error('Failed to fetch instances:', error)
        return []
      }
    },
    enabled: hasCredentials && validationResult?.valid,
    refetchInterval: 10_000 // Refetch every 10 seconds when credentials are valid
  })

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallet-list'],
    queryFn: async () => {
      const response = await fetch(getApiUrl('/api/wallet/list'), {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch wallets')
      }
      const data = (await response.json()) as { wallets: Wallet[] }
      return data.wallets
    }
  })

  const validateConnectionMutation = useMutation({
    mutationFn: async () => {
      const credentialsForRequest = CredentialManager.getCredentialsForRequest()
      if (!credentialsForRequest) {
        throw new Error('No credentials available')
      }

      const response = await fetch(getApiUrl('/api/aws/credentials/validate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(credentialsForRequest)
      })

      if (!response.ok) {
        throw new Error('Connection validation failed')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['aws-credentials-validation']
      })
      queryClient.invalidateQueries({ queryKey: ['aws-instances'] })
    }
  })

  const operationStats: OperationStats = {
    totalInstances: instances.length,
    runningInstances: instances.filter((i) => i.status === 'running').length,
    activeEnclaves: instances.filter((i) => i.enclaveStatus === 'running')
      .length,
    totalWallets: wallets.length
  }

  const handleValidateConnection = () => {
    validateConnectionMutation.mutate()
  }

  // Show credential setup if no credentials or invalid
  if (
    !hasCredentials ||
    (hasCredentials && validationResult && !validationResult.valid)
  ) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-medium text-2xl">AWS Operations Center</h2>
          <p className="text-muted-foreground">
            Manage AWS credentials, EC2 instances, and Nitro Enclaves
          </p>
        </div>

        <Alert>
          <Key className="h-4 w-4" />
          <AlertDescription>
            {hasCredentials
              ? 'Your stored AWS credentials appear to be invalid or expired. Please reconfigure your credentials.'
              : 'AWS credentials are not configured. Please set up your credentials to begin managing EC2 instances and Nitro Enclaves.'}
          </AlertDescription>
        </Alert>

        <AWSCredentialSetup />
      </div>
    )
  }

  // Show loading state while validating
  if (hasCredentials && isValidating) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-medium text-2xl">AWS Operations Center</h2>
          <p className="text-muted-foreground">Validating AWS credentials...</p>
        </div>

        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <div className="flex items-center space-x-3">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="text-lg">Validating credentials...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show main operations center if credentials are valid
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-2xl">AWS Operations Center</h2>
          <p className="text-muted-foreground">
            Manage AWS infrastructure with encrypted credentials
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-muted-foreground text-sm">
            <Clock className="h-4 w-4 text-blue-600" />
            <span>{credentialStatus.hoursUntilExpiry}h remaining</span>
          </div>
          <div className="flex items-center space-x-2 text-muted-foreground text-sm">
            <Shield className="h-4 w-4 text-green-600" />
            <span>Region: {validationResult?.region}</span>
          </div>
          {isCheckingSecurityGroup ? (
            <div className="flex items-center space-x-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              <span>Checking SSH access...</span>
            </div>
          ) : securityGroupStatus?.success ? (
            <div className="flex items-center space-x-2 text-muted-foreground text-sm">
              {securityGroupStatus.hasSSHAccess ? (
                <>
                  <Shield className="h-4 w-4 text-green-600" />
                  <span>SSH: Ready</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <span>SSH: Configuring...</span>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-muted-foreground text-sm">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span>SSH: Error</span>
            </div>
          )}
          <Button
            disabled={validateConnectionMutation.isPending}
            onClick={handleValidateConnection}
            size="sm"
            variant="outline"
          >
            {validateConnectionMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Shield className="mr-2 h-4 w-4" />
            )}
            Test Connection
          </Button>
        </div>
      </div>

      {/* Operation Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Total Instances
            </CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {operationStats.totalInstances}
            </div>
            <p className="text-muted-foreground text-xs">Across all regions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Running Instances
            </CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-green-600">
              {operationStats.runningInstances}
            </div>
            <p className="text-muted-foreground text-xs">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Active Enclaves
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-blue-600">
              {operationStats.activeEnclaves}
            </div>
            <p className="text-muted-foreground text-xs">
              Nitro Enclaves running
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Wallets</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-purple-600">
              {operationStats.totalWallets}
            </div>
            <p className="text-muted-foreground text-xs">Generated wallets</p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        className="space-y-4"
        onValueChange={setActiveTab}
        value={activeTab}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="instances">EC2 Instances</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="overview">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="h-5 w-5" />
                  <span>Security Status</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">AES-256 Encryption</span>
                  <div className="flex items-center space-x-1 text-green-600">
                    <Shield className="h-4 w-4" />
                    <span className="text-sm">Active</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Security Group</span>
                  <div className="flex items-center space-x-1">
                    {validationResult?.hasSecurityGroup ? (
                      <>
                        <Shield className="h-4 w-4 text-green-600" />
                        <span className="text-green-600 text-sm">
                          Configured
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm text-yellow-600">Not set</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">SSH Key</span>
                  <div className="flex items-center space-x-1">
                    {validationResult?.hasEC2Key ? (
                      <>
                        <Key className="h-4 w-4 text-green-600" />
                        <span className="text-green-600 text-sm">
                          Available
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm text-yellow-600">
                          Not configured
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">SSH Access</span>
                  <div className="flex items-center space-x-1">
                    {isCheckingSecurityGroup ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                        <span className="text-orange-500 text-sm">Checking...</span>
                      </>
                    ) : securityGroupStatus?.success && securityGroupStatus.hasSSHAccess ? (
                      <>
                        <Shield className="h-4 w-4 text-green-600" />
                        <span className="text-green-600 text-sm">Ready</span>
                      </>
                    ) : securityGroupStatus?.success ? (
                      <>
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <span className="text-orange-500 text-sm">Configuring...</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-red-500 text-sm">Error</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Credential Expiry</span>
                  <div className="flex items-center space-x-1">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="text-blue-600 text-sm">
                      {credentialStatus.hoursUntilExpiry}h remaining
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Quick Actions</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full justify-start"
                  onClick={() => setActiveTab('instances')}
                  size="sm"
                >
                  <Cloud className="mr-2 h-4 w-4" />
                  Create New Instance
                </Button>
                <Button
                  className="w-full justify-start"
                  onClick={() => setActiveTab('credentials')}
                  size="sm"
                  variant="outline"
                >
                  <Key className="mr-2 h-4 w-4" />
                  Manage Credentials
                </Button>
                <Button
                  className="w-full justify-start"
                  disabled={operationStats.runningInstances === 0}
                  size="sm"
                  variant="outline"
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Deploy Enclave
                </Button>
              </CardContent>
            </Card>
          </div>

          {instances.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Instances</CardTitle>
                <CardDescription>
                  Your most recently created EC2 instances
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {instances.slice(0, 3).map((instance) => (
                    <div
                      className="flex items-center justify-between rounded border p-2"
                      key={instance.id}
                    >
                      <div className="flex items-center space-x-3">
                        <Server className="h-4 w-4" />
                        <div>
                          <div className="font-medium text-sm">
                            {instance.id}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {instance.type}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div
                          className={`rounded-full px-2 py-1 text-xs ${
                            instance.status === 'running'
                              ? 'bg-green-100 text-green-800'
                              : instance.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {instance.status}
                        </div>
                        {instance.enclaveStatus &&
                          instance.enclaveStatus !== 'none' && (
                            <div className="flex items-center space-x-1">
                              <Shield className="h-3 w-3" />
                              <span className="text-xs">
                                {instance.enclaveStatus}
                              </span>
                            </div>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent className="space-y-4" value="instances">
          <AWSInstanceManagement />
        </TabsContent>

        <TabsContent className="space-y-4" value="credentials">
          <AWSCredentialSetup />
        </TabsContent>
      </Tabs>
    </div>
  )
}
