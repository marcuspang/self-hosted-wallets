import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { Alert, AlertDescription } from '../ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Switch } from '../ui/switch'
import { 
  Shield, 
  Plus, 
  Edit3, 
  Trash2, 
  DollarSign,
  Clock,
  Settings,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react'

interface Policy {
  id: string
  type: 'spending_limit' | 'contract_permission' | 'time_restriction'
  contractAddress?: string
  functionSignature?: string
  limitAmount?: string
  limitPeriod?: string
  expiresAt?: string
  isActive: boolean
  createdAt: string
}

export function PolicyConfiguration() {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  
  // Form state
  const [policyType, setPolicyType] = useState<'spending_limit' | 'contract_permission' | 'time_restriction'>('spending_limit')
  const [contractAddress, setContractAddress] = useState('')
  const [functionSignature, setFunctionSignature] = useState('')
  const [limitAmount, setLimitAmount] = useState('')
  const [limitPeriod, setLimitPeriod] = useState('day')
  const [expirationDays, setExpirationDays] = useState('30')

  const { data: policies = [] } = useQuery({
    queryKey: ['policies'],
    queryFn: async () => {
      const response = await fetch('/api/policies/list', {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch policies')
      }
      const data = await response.json()
      return data.policies || []
    }
  })

  const createPolicyMutation = useMutation({
    mutationFn: async (policyData: any) => {
      const response = await fetch('/api/policies/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(policyData)
      })
      
      if (!response.ok) {
        throw new Error('Failed to create policy')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] })
      setShowCreateForm(false)
      resetForm()
    }
  })

  const updatePolicyMutation = useMutation({
    mutationFn: async ({ policyId, isActive }: { policyId: string; isActive: boolean }) => {
      const response = await fetch('/api/policies/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ policyId, isActive })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update policy')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] })
    }
  })

  const deletePolicyMutation = useMutation({
    mutationFn: async (policyId: string) => {
      const response = await fetch(`/api/policies/${policyId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete policy')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] })
    }
  })

  const createPolicy = () => {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + parseInt(expirationDays))
    
    const policyData: any = {
      type: policyType,
      expiresAt: expiresAt.toISOString()
    }

    if (policyType === 'spending_limit') {
      policyData.limitAmount = limitAmount
      policyData.limitPeriod = limitPeriod
    } else if (policyType === 'contract_permission') {
      policyData.contractAddress = contractAddress
      if (functionSignature) policyData.functionSignature = functionSignature
    }

    createPolicyMutation.mutate(policyData)
  }

  const togglePolicy = (policyId: string, isActive: boolean) => {
    updatePolicyMutation.mutate({ policyId, isActive })
  }

  const deletePolicy = (policyId: string) => {
    deletePolicyMutation.mutate(policyId)
  }

  const resetForm = () => {
    setPolicyType('spending_limit')
    setContractAddress('')
    setFunctionSignature('')
    setLimitAmount('')
    setLimitPeriod('day')
    setExpirationDays('30')
  }

  const getPolicyIcon = (type: string) => {
    switch (type) {
      case 'spending_limit': return <DollarSign className="h-4 w-4" />
      case 'contract_permission': return <Settings className="h-4 w-4" />
      case 'time_restriction': return <Clock className="h-4 w-4" />
      default: return <Shield className="h-4 w-4" />
    }
  }

  const getPolicyDescription = (policy: Policy) => {
    switch (policy.type) {
      case 'spending_limit':
        return `Max ${policy.limitAmount} ETH per ${policy.limitPeriod}`
      case 'contract_permission':
        return `Allow ${policy.contractAddress?.slice(0, 6)}...${policy.contractAddress?.slice(-4)}${
          policy.functionSignature ? ` • ${policy.functionSignature}` : ''
        }`
      case 'time_restriction':
        return `Time-based restrictions`
      default:
        return 'Unknown policy type'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Policy Configuration</h3>
          <p className="text-sm text-muted-foreground">
            Set up transaction policies and spending limits using Porto SDK
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Policy
        </Button>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Policy</CardTitle>
            <CardDescription>
              Configure transaction policies for your wallets
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="policy-type">Policy Type</Label>
              <Select value={policyType} onValueChange={(value: any) => setPolicyType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spending_limit">Spending Limit</SelectItem>
                  <SelectItem value="contract_permission">Contract Permission</SelectItem>
                  <SelectItem value="time_restriction">Time Restriction</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {policyType === 'spending_limit' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="limit-amount">Limit Amount (ETH)</Label>
                    <Input
                      id="limit-amount"
                      type="number"
                      step="0.001"
                      placeholder="1.0"
                      value={limitAmount}
                      onChange={(e) => setLimitAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="limit-period">Period</Label>
                    <Select value={limitPeriod} onValueChange={setLimitPeriod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hour">Per Hour</SelectItem>
                        <SelectItem value="day">Per Day</SelectItem>
                        <SelectItem value="week">Per Week</SelectItem>
                        <SelectItem value="month">Per Month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {policyType === 'contract_permission' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="contract-address">Contract Address</Label>
                  <Input
                    id="contract-address"
                    placeholder="0x..."
                    value={contractAddress}
                    onChange={(e) => setContractAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="function-signature">Function Signature (Optional)</Label>
                  <Input
                    id="function-signature"
                    placeholder="e.g., transfer(address,uint256)"
                    value={functionSignature}
                    onChange={(e) => setFunctionSignature(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="expiration">Expires in (days)</Label>
              <Input
                id="expiration"
                type="number"
                placeholder="30"
                value={expirationDays}
                onChange={(e) => setExpirationDays(e.target.value)}
              />
            </div>

            <div className="flex space-x-2">
              <Button onClick={createPolicy} disabled={createPolicyMutation.isPending}>
                {createPolicyMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Create Policy
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Active Policies</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {policies.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No policies configured. Create your first policy to secure your wallets.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {policies.map((policy) => (
                <div key={policy.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        {getPolicyIcon(policy.type)}
                        <span className="font-medium capitalize">
                          {policy.type.replace('_', ' ')}
                        </span>
                        <Badge variant={policy.isActive ? 'default' : 'secondary'}>
                          {policy.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        {new Date(policy.expiresAt!) < new Date() && (
                          <Badge variant="destructive">Expired</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getPolicyDescription(policy)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created: {new Date(policy.createdAt).toLocaleDateString()} • 
                        Expires: {new Date(policy.expiresAt!).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={policy.isActive}
                        onCheckedChange={(checked) => togglePolicy(policy.id, checked)}
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deletePolicy(policy.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy Templates</CardTitle>
          <CardDescription>
            Quick setup for common policy configurations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              onClick={() => {
                setPolicyType('spending_limit')
                setLimitAmount('0.1')
                setLimitPeriod('day')
                setShowCreateForm(true)
              }}
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Daily Limit (0.1 ETH)
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPolicyType('spending_limit')
                setLimitAmount('1.0')
                setLimitPeriod('week')
                setShowCreateForm(true)
              }}
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Weekly Limit (1.0 ETH)
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPolicyType('contract_permission')
                setContractAddress('')
                setShowCreateForm(true)
              }}
            >
              <Settings className="mr-2 h-4 w-4" />
              Contract Whitelist
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}