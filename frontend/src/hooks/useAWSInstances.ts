import { useQuery } from '@tanstack/react-query'
import { getApiUrl } from '../lib/api'
import { CredentialManager } from '../lib/credentialManager'

export interface Instance {
  id: string
  status: 'pending' | 'running' | 'stopped' | 'terminated'
  type: string
  region: string
  enclaveStatus?: 'none' | 'building' | 'running' | 'failed'
}

export function useAWSInstances() {
  // Check if credentials are available
  const hasCredentials = CredentialManager.hasValidCredentials()

  const query = useQuery<Instance[]>({
    queryKey: ['aws-instances'],
    queryFn: async () => {
      if (!hasCredentials) {
        throw new Error('No AWS credentials configured')
      }

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
      return data.instances || []
    },
    enabled: hasCredentials,
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

  return {
    ...query,
    hasCredentials,
    // Helper to get running enclave instances for wallet generation
    runningEnclaveInstances: query.data?.filter(
      (instance) =>
        instance.status === 'running' && instance.enclaveStatus === 'running'
    ) || []
  }
}