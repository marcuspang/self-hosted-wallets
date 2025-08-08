import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle,
  Cloud,
  Key,
  Loader2,
  Play,
  Plus,
  Search,
  Server,
  Shield,
  Square,
  Trash2
} from 'lucide-react'
import { useState } from 'react'
import { getApiUrl } from '../../lib/api'
import { CredentialManager } from '../../lib/credentialManager'
import { useAWSInstances } from '../../hooks/useAWSInstances'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select'


export function AWSInstanceManagement() {
  const queryClient = useQueryClient()
  const [selectedInstanceType, setSelectedInstanceType] = useState('m5.xlarge')
  const [selectedRegion, setSelectedRegion] = useState('us-east-1')
  const [verificationResult, setVerificationResult] = useState<{
    instanceId: string
    result: any
  } | null>(null)

  const instanceTypes = [
    { value: 'm5.xlarge', label: 'M5 Extra Large (4 vCPU, 16GB RAM)' },
    { value: 'm5.2xlarge', label: 'M5 2XL (8 vCPU, 32GB RAM)' },
    { value: 'm5.4xlarge', label: 'M5 4XL (16 vCPU, 64GB RAM)' }
  ]

  const regions = [
    { value: 'us-east-1', label: 'US East (N. Virginia)' },
    { value: 'us-west-2', label: 'US West (Oregon)' },
    { value: 'eu-west-1', label: 'Europe (Ireland)' }
  ]

  // Use shared AWS instances hook
  const { data: instances = [], error: instancesError, hasCredentials } = useAWSInstances()

  const verifyEnclaveSetupMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const requestBody = CredentialManager.createRequestWithCredentials()

      const response = await fetch(
        getApiUrl(`/api/aws/instances/${instanceId}/verify-enclave-setup`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(requestBody)
        }
      )

      if (!response.ok) {
        throw new Error('Failed to verify enclave setup')
      }
      return { instanceId, result: await response.json() }
    },
    onSuccess: (data) => {
      setVerificationResult(data)
    }
  })


  const createInstanceMutation = useMutation({
    mutationFn: async ({
      instanceType,
      region
    }: {
      instanceType: string
      region: string
    }) => {
      const requestBody = CredentialManager.createRequestWithCredentials({
        instanceType,
        region
      })

      const response = await fetch(getApiUrl('/api/aws/instances'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        throw new Error('Failed to create instance')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aws-instances'] })
    }
  })

  const controlInstanceMutation = useMutation({
    mutationFn: async ({
      instanceId,
      action
    }: {
      instanceId: string
      action: 'start' | 'stop' | 'terminate'
    }) => {
      const endpoint =
        action === 'terminate'
          ? `/api/aws/instances/${instanceId}`
          : `/api/aws/instances/${instanceId}/${action}`
      const method = action === 'terminate' ? 'DELETE' : 'POST'

      const requestBody = CredentialManager.createRequestWithCredentials()

      const response = await fetch(getApiUrl(endpoint), {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        throw new Error(`Failed to ${action} instance`)
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aws-instances'] })
    }
  })

  const deployEnclaveMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const requestBody = CredentialManager.createRequestWithCredentials({
        instanceId
      })

      const response = await fetch(getApiUrl('/api/aws/enclaves/build'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        throw new Error('Failed to deploy enclave')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aws-instances'] })
    }
  })

  const createInstance = () => {
    if (!hasCredentials) {
      return
    }
    createInstanceMutation.mutate({
      instanceType: selectedInstanceType,
      region: selectedRegion
    })
  }

  const controlInstance = (
    instanceId: string,
    action: 'start' | 'stop' | 'terminate'
  ) => {
    if (!hasCredentials) {
      return
    }
    controlInstanceMutation.mutate({ instanceId, action })
  }

  const deployEnclave = (instanceId: string) => {
    if (!hasCredentials) {
      return
    }
    deployEnclaveMutation.mutate(instanceId)
  }

  const verifyEnclaveSetup = (instanceId: string) => {
    if (!hasCredentials) {
      return
    }
    verifyEnclaveSetupMutation.mutate(instanceId)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-500'
      case 'pending':
        return 'bg-yellow-500'
      case 'stopped':
        return 'bg-gray-500'
      case 'terminated':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getEnclaveStatusIcon = (status: string | undefined) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'building':
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <Shield className="h-4 w-4 text-gray-400" />
    }
  }

  // Show credential requirement message if no credentials
  if (!hasCredentials) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-medium text-lg">AWS Instance Management</h3>
          <p className="text-muted-foreground text-sm">
            Launch and manage EC2 instances for Nitro Enclaves
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Key className="h-5 w-5 text-yellow-600" />
              <span>AWS Credentials Required</span>
            </CardTitle>
            <CardDescription>
              You need to configure AWS credentials before managing instances
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please configure your AWS credentials in the AWS Credential
                Setup section above.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show error if instances failed to load
  if (instancesError) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-medium text-lg">AWS Instance Management</h3>
          <p className="text-muted-foreground text-sm">
            Launch and manage EC2 instances for Nitro Enclaves
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span>Failed to Load Instances</span>
            </CardTitle>
            <CardDescription>
              There was an error loading your AWS instances
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{instancesError.message}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-lg">AWS Instance Management</h3>
        <p className="text-muted-foreground text-sm">
          Launch and manage EC2 instances for Nitro Enclaves
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Plus className="h-5 w-5" />
            <span>Create New Instance</span>
          </CardTitle>
          <CardDescription>
            Launch a new EC2 instance optimized for Nitro Enclaves
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor="instanceType">
                Instance Type
              </label>
              <Select
                onValueChange={setSelectedInstanceType}
                value={selectedInstanceType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select instance type" />
                </SelectTrigger>
                <SelectContent>
                  {instanceTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor="region">
                Region
              </label>
              <Select onValueChange={setSelectedRegion} value={selectedRegion}>
                <SelectTrigger>
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.value} value={region.value}>
                      {region.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            disabled={createInstanceMutation.isPending}
            onClick={createInstance}
          >
            {createInstanceMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Cloud className="mr-2 h-4 w-4" />
            )}
            Launch Instance
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Server className="h-5 w-5" />
            <span>Running Instances</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Verification Result Display */}
          {verificationResult && (
            <div className="mb-4">
              <Alert className={verificationResult.result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                <Search className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">
                      Enclave Setup Verification for {verificationResult.instanceId}
                    </p>
                    <p className={verificationResult.result.success ? 'text-green-700' : 'text-red-700'}>
                      {verificationResult.result.message}
                    </p>
                    {verificationResult.result.output && (
                      <details className="mt-2">
                        <summary className="cursor-pointer font-medium text-sm">View Detailed Report</summary>
                        <pre className="mt-2 max-h-64 overflow-y-auto bg-gray-100 p-2 rounded text-xs whitespace-pre-wrap">
                          {verificationResult.result.output}
                        </pre>
                      </details>
                    )}
                    <Button
                      onClick={() => setVerificationResult(null)}
                      size="sm"
                      variant="outline"
                    >
                      Dismiss
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          )}
          {instances.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No instances found. Create your first instance to get started.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {instances.map((instance) => (
                <div className="rounded-lg border p-4" key={instance.id}>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline">{instance.id}</Badge>
                        <Badge
                          className={`text-white ${getStatusColor(instance.status)}`}
                        >
                          {instance.status}
                        </Badge>
                        <span className="text-muted-foreground text-sm">
                          {instance.type} • {instance.region}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getEnclaveStatusIcon(instance.enclaveStatus)}
                        <span className="text-sm">
                          Enclave: {instance.enclaveStatus || 'none'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {instance.status === 'running' && (
                        <>
                          {!instance.enclaveStatus ||
                          instance.enclaveStatus === 'none' ? (
                            <Button
                              onClick={() => deployEnclave(instance.id)}
                              size="sm"
                            >
                              <Shield className="mr-2 h-3 w-3" />
                              Deploy Enclave
                            </Button>
                          ) : null}
                          <Button
                            onClick={() => verifyEnclaveSetup(instance.id)}
                            size="sm"
                            variant="secondary"
                            disabled={verifyEnclaveSetupMutation.isPending}
                          >
                            {verifyEnclaveSetupMutation.isPending ? (
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            ) : (
                              <Search className="mr-2 h-3 w-3" />
                            )}
                            Verify Setup
                          </Button>
                          <Button
                            onClick={() => controlInstance(instance.id, 'stop')}
                            size="sm"
                            variant="outline"
                          >
                            <Square className="mr-2 h-3 w-3" />
                            Stop
                          </Button>
                        </>
                      )}
                      {instance.status === 'stopped' && (
                        <>
                          <Button
                            onClick={() => controlInstance(instance.id, 'start')}
                            size="sm"
                            variant="outline"
                          >
                            <Play className="mr-2 h-3 w-3" />
                            Start
                          </Button>
                          <Button
                            onClick={() => verifyEnclaveSetup(instance.id)}
                            size="sm"
                            variant="secondary"
                            disabled={verifyEnclaveSetupMutation.isPending}
                          >
                            {verifyEnclaveSetupMutation.isPending ? (
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            ) : (
                              <Search className="mr-2 h-3 w-3" />
                            )}
                            Verify Setup
                          </Button>
                        </>
                      )}
                      {instance.status === 'running' && (
                        <Button
                          onClick={() =>
                            controlInstance(instance.id, 'terminate')
                          }
                          size="sm"
                          variant="destructive"
                        >
                          <Trash2 className="mr-2 h-3 w-3" />
                          Terminate
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
