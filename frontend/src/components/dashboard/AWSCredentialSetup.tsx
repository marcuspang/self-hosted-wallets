import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle,
  Key,
  Loader2,
  Shield,
  Trash2
} from 'lucide-react'
import { useState } from 'react'
import { getApiUrl } from '../../lib/api'
import { Alert, AlertDescription } from '../ui/alert'
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
import { Textarea } from '../ui/textarea'

interface CredentialStatus {
  configured: boolean
  region: string | null
  hasSecurityGroup: boolean
  hasEC2Key: boolean
}

export function AWSCredentialSetup() {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1',
    securityGroupId: '',
    subnetId: '',
    ec2KeyName: '',
    ec2PrivateKey: ''
  })

  const { data: credentialStatus } = useQuery<CredentialStatus>({
    queryKey: ['aws-credentials-status'],
    queryFn: async () => {
      const response = await fetch(getApiUrl('/api/aws/credentials/status'), {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch credential status')
      }
      return response.json()
    }
  })

  const setupCredentialsMutation = useMutation({
    mutationFn: async (credentials: typeof formData) => {
      const response = await fetch(getApiUrl('/api/aws/credentials/setup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(credentials)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to setup credentials')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aws-credentials-status'] })
      setFormData({
        accessKeyId: '',
        secretAccessKey: '',
        region: 'us-east-1',
        securityGroupId: '',
        subnetId: '',
        ec2KeyName: '',
        ec2PrivateKey: ''
      })
    }
  })

  const clearCredentialsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(getApiUrl('/api/aws/credentials'), {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to clear credentials')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aws-credentials-status'] })
    }
  })

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setupCredentialsMutation.mutate(formData)
  }

  const handleClearCredentials = () => {
    clearCredentialsMutation.mutate()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-lg">AWS Credential Management</h3>
        <p className="text-muted-foreground text-sm">
          Securely manage your AWS credentials using AWS KMS encryption
        </p>
      </div>

      {credentialStatus?.configured ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>AWS Credentials Configured</span>
            </CardTitle>
            <CardDescription>
              Your AWS credentials are securely stored and encrypted with KMS
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <Label>Region</Label>
                <div className="rounded-md bg-muted px-3 py-2">
                  {credentialStatus.region || 'Not specified'}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Security Group</Label>
                <div className="flex items-center space-x-2">
                  {credentialStatus.hasSecurityGroup ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                  )}
                  <span>
                    {credentialStatus.hasSecurityGroup
                      ? 'Configured'
                      : 'Not configured'}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>EC2 SSH Key</Label>
                <div className="flex items-center space-x-2">
                  {credentialStatus.hasEC2Key ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                  )}
                  <span>
                    {credentialStatus.hasEC2Key
                      ? 'Configured'
                      : 'Not configured'}
                  </span>
                </div>
              </div>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Credentials are encrypted with AWS KMS and stored securely. Only
                decrypted when needed for AWS operations.
              </AlertDescription>
            </Alert>

            <div className="flex space-x-2">
              <Button
                disabled={clearCredentialsMutation.isPending}
                onClick={handleClearCredentials}
                size="sm"
                variant="destructive"
              >
                {clearCredentialsMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Clear Credentials
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Key className="h-5 w-5" />
              <span>Setup AWS Credentials</span>
            </CardTitle>
            <CardDescription>
              Configure your AWS credentials for secure EC2 and Nitro Enclave
              management
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="accessKeyId">AWS Access Key ID *</Label>
                  <Input
                    id="accessKeyId"
                    onChange={(e) =>
                      handleInputChange('accessKeyId', e.target.value)
                    }
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    required
                    type="text"
                    value={formData.accessKeyId}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secretAccessKey">
                    AWS Secret Access Key *
                  </Label>
                  <Input
                    id="secretAccessKey"
                    onChange={(e) =>
                      handleInputChange('secretAccessKey', e.target.value)
                    }
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYzEXAMPLEKEY"
                    required
                    type="password"
                    value={formData.secretAccessKey}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="region">AWS Region *</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    id="region"
                    onChange={(e) =>
                      handleInputChange('region', e.target.value)
                    }
                    required
                    value={formData.region}
                  >
                    <option value="us-east-1">US East (N. Virginia)</option>
                    <option value="us-west-2">US West (Oregon)</option>
                    <option value="eu-west-1">Europe (Ireland)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="securityGroupId">Security Group ID</Label>
                  <Input
                    id="securityGroupId"
                    onChange={(e) =>
                      handleInputChange('securityGroupId', e.target.value)
                    }
                    placeholder="sg-0123456789abcdef0"
                    type="text"
                    value={formData.securityGroupId}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ec2KeyName">EC2 Key Pair Name</Label>
                  <Input
                    id="ec2KeyName"
                    onChange={(e) =>
                      handleInputChange('ec2KeyName', e.target.value)
                    }
                    placeholder="my-key-pair"
                    type="text"
                    value={formData.ec2KeyName}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subnetId">Subnet ID</Label>
                <Input
                  id="subnetId"
                  onChange={(e) =>
                    handleInputChange('subnetId', e.target.value)
                  }
                  placeholder="subnet-0123456789abcdef0"
                  type="text"
                  value={formData.subnetId}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ec2PrivateKey">
                  EC2 Private Key (PEM format)
                </Label>
                <Textarea
                  className="min-h-32 font-mono text-xs"
                  id="ec2PrivateKey"
                  onChange={(e) =>
                    handleInputChange('ec2PrivateKey', e.target.value)
                  }
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;MIIEpAIBAAKCAQEA...&#10;-----END RSA PRIVATE KEY-----"
                  value={formData.ec2PrivateKey}
                />
                <p className="text-muted-foreground text-xs">
                  Private key for SSH access to EC2 instances (optional but
                  recommended for enclave deployment)
                </p>
              </div>

              {setupCredentialsMutation.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {setupCredentialsMutation.error.message}
                  </AlertDescription>
                </Alert>
              )}

              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  All credentials will be encrypted using AWS KMS and stored
                  securely. They are never stored in plaintext.
                </AlertDescription>
              </Alert>

              <Button
                className="w-full"
                disabled={setupCredentialsMutation.isPending}
                type="submit"
              >
                {setupCredentialsMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="mr-2 h-4 w-4" />
                )}
                Setup Secure Credentials
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
