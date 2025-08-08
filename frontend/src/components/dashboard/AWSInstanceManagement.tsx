import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle,
  Cloud,
  Loader2,
  Play,
  Plus,
  Server,
  Shield,
  Square,
  Trash2
} from 'lucide-react'
import { useState } from 'react'
import { getApiUrl } from '../../lib/api'
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

interface Instance {
  id: string
  status: 'pending' | 'running' | 'stopped' | 'terminated'
  type: string
  region: string
  enclaveStatus?: 'none' | 'building' | 'running' | 'failed'
}

export function AWSInstanceManagement() {
  const queryClient = useQueryClient()
  const [selectedInstanceType, setSelectedInstanceType] = useState('m5.xlarge')
  const [selectedRegion, setSelectedRegion] = useState('us-east-1')

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

  const { data: instances = [] } = useQuery<Instance[]>({
    queryKey: ['aws-instances'],
    queryFn: async () => {
      const response = await fetch(getApiUrl('/api/aws/instances'), {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch instances')
      }
      const data = (await response.json()) as { instances: Instance[] }
      return data.instances || []
    },
    // Auto-poll while instances are transitioning (e.g., pending)
    refetchInterval: (query) => {
      const hasTransitioning = (query.state.data || []).some((i) =>
        ['pending', 'stopping', 'shutting-down'].includes(i.status)
      )
      return hasTransitioning ? 3000 : false
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true
  })

  const createInstanceMutation = useMutation({
    mutationFn: async ({
      instanceType,
      region
    }: {
      instanceType: string
      region: string
    }) => {
      const response = await fetch(getApiUrl('/api/aws/instances'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ instanceType, region })
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

      const response = await fetch(getApiUrl(endpoint), {
        method,
        credentials: 'include'
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
      const response = await fetch(getApiUrl('/api/aws/enclaves/build'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ instanceId })
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
    createInstanceMutation.mutate({
      instanceType: selectedInstanceType,
      region: selectedRegion
    })
  }

  const controlInstance = (
    instanceId: string,
    action: 'start' | 'stop' | 'terminate'
  ) => {
    controlInstanceMutation.mutate({ instanceId, action })
  }

  const deployEnclave = (instanceId: string) => {
    deployEnclaveMutation.mutate(instanceId)
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
                        <Button
                          onClick={() => controlInstance(instance.id, 'start')}
                          size="sm"
                          variant="outline"
                        >
                          <Play className="mr-2 h-3 w-3" />
                          Start
                        </Button>
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
