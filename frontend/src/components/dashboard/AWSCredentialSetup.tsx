import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  ExternalLink,
  Key,
  Loader2,
  Shield,
  Trash2
} from 'lucide-react'
import { useState } from 'react'
import { getApiUrl } from '../../lib/api'
import {
  type AWSCredentials,
  CredentialManager
} from '../../lib/credentialManager'
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

interface SetupResponse {
  success: boolean
  message: string
  encryptionKey: string
  encryptedCredentials: {
    encryptedData: string
    iv: string
  }
}

interface ValidationResponse {
  valid: boolean
  configured: boolean
  region: string
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

  // Check if we have stored credentials
  const credentialStatus = CredentialManager.getCredentialStatus()

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
      enabled: credentialStatus.configured,
      retry: false
    })

  const setupCredentialsMutation = useMutation({
    mutationFn: async (credentials: AWSCredentials): Promise<SetupResponse> => {
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
    onSuccess: (data) => {
      // Store encrypted credentials in localStorage
      CredentialManager.storeCredentials(
        data.encryptedCredentials,
        data.encryptionKey
      )

      queryClient.invalidateQueries({
        queryKey: ['aws-credentials-validation']
      })

      // Clear form
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
      // Just clear from localStorage - no server call needed for stateless system
      CredentialManager.clearCredentials()
      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['aws-credentials-validation']
      })
      queryClient.invalidateQueries({ queryKey: ['aws-instances'] })
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

  // If we have credentials and they're valid
  if (credentialStatus.configured && validationResult?.valid) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="font-medium text-lg">AWS Credential Management</h3>
          <p className="text-muted-foreground text-sm">
            Securely manage your AWS credentials with client-side encryption
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>AWS Credentials Configured</span>
            </CardTitle>
            <CardDescription>
              Your AWS credentials are encrypted and stored securely in your
              browser
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <Label>Region</Label>
                <div className="rounded-md bg-muted px-3 py-2">
                  {validationResult.region || 'Not specified'}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Security Group</Label>
                <div className="flex items-center space-x-2">
                  {validationResult.hasSecurityGroup ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                  )}
                  <span>
                    {validationResult.hasSecurityGroup
                      ? 'Configured'
                      : 'Not configured'}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>EC2 SSH Key</Label>
                <div className="flex items-center space-x-2">
                  {validationResult.hasEC2Key ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                  )}
                  <span>
                    {validationResult.hasEC2Key
                      ? 'Configured'
                      : 'Not configured'}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Expires</Label>
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span>{credentialStatus.hoursUntilExpiry}h remaining</span>
                </div>
              </div>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Credentials are encrypted with AES-256-CBC and stored locally in
                your browser. They are never stored on the server and expire
                automatically after 24 hours.
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
      </div>
    )
  }

  // If we have credentials but validation is pending/failed
  if (
    credentialStatus.configured &&
    (isValidating || !validationResult?.valid)
  ) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="font-medium text-lg">AWS Credential Management</h3>
          <p className="text-muted-foreground text-sm">
            Validating stored credentials...
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {isValidating ? (
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              <span>
                {isValidating
                  ? 'Validating Credentials...'
                  : 'Credential Validation Failed'}
              </span>
            </CardTitle>
            <CardDescription>
              {isValidating
                ? 'Checking your stored credentials with AWS...'
                : 'Your stored credentials appear to be invalid or expired.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isValidating && (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Please reconfigure your AWS credentials below.
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={handleClearCredentials}
                  size="sm"
                  variant="outline"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear and Reconfigure
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show setup form
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-lg">AWS Credential Management</h3>
        <p className="text-muted-foreground text-sm">
          Configure your AWS credentials with secure client-side encryption
        </p>
      </div>

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
          
          {/* SSH Setup Help */}
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                <Shield className="h-5 w-5 text-amber-600" />
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-amber-800">SSH Access Requirements</h4>
                <p className="text-amber-700 text-sm">
                  To SSH into your EC2 instances, you need <strong>both</strong> components configured:
                </p>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="font-medium text-amber-800 text-sm">Network Access</span>
                    </div>
                    <p className="text-amber-700 text-xs ml-4">
                      Security group with SSH port 22 open<br/>
                      <em>(Automatically configured)</em>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span className="font-medium text-amber-800 text-sm">SSH Authentication</span>
                    </div>
                    <p className="text-amber-700 text-xs ml-4">
                      EC2 Key Pair name + Private key<br/>
                      <em>(Required: Fill EC2 fields below)</em>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                <Label htmlFor="secretAccessKey">AWS Secret Access Key *</Label>
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
                  onChange={(e) => handleInputChange('region', e.target.value)}
                  required
                  value={formData.region}
                >
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-west-1">Europe (Ireland)</option>
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="securityGroupId">Security Group ID</Label>
                  <a
                    href={`https://console.aws.amazon.com/ec2/v2/home?region=${formData.region}#SecurityGroups:`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>View Security Groups</span>
                  </a>
                </div>
                <Input
                  id="securityGroupId"
                  onChange={(e) =>
                    handleInputChange('securityGroupId', e.target.value)
                  }
                  placeholder="sg-0123456789abcdef0"
                  type="text"
                  value={formData.securityGroupId}
                />
                <p className="text-muted-foreground text-xs">
                  Optional. If not provided, a security group with SSH access will be created automatically.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ec2KeyName">EC2 Key Pair Name</Label>
                  <a
                    href={`https://console.aws.amazon.com/ec2/v2/home?region=${formData.region}#KeyPairs:`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>Create/View Key Pairs</span>
                  </a>
                </div>
                <Input
                  id="ec2KeyName"
                  onChange={(e) =>
                    handleInputChange('ec2KeyName', e.target.value)
                  }
                  placeholder="my-key-pair"
                  type="text"
                  value={formData.ec2KeyName}
                />
                <p className="text-muted-foreground text-xs">
                  The name of your EC2 key pair (without .pem extension). Required for SSH access to instances.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="subnetId">Subnet ID</Label>
                <a
                  href={`https://console.aws.amazon.com/vpc/home?region=${formData.region}#subnets:`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>View Subnets</span>
                </a>
              </div>
              <Input
                id="subnetId"
                onChange={(e) => handleInputChange('subnetId', e.target.value)}
                placeholder="subnet-0123456789abcdef0"
                type="text"
                value={formData.subnetId}
              />
              <p className="text-muted-foreground text-xs">
                Optional. If not provided, the default subnet in your VPC will be used.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="ec2PrivateKey">
                  EC2 Private Key (PEM format)
                </Label>
                <a
                  href="https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Key Pair Guide</span>
                </a>
              </div>
              <Textarea
                className="min-h-32 font-mono text-xs"
                id="ec2PrivateKey"
                onChange={(e) =>
                  handleInputChange('ec2PrivateKey', e.target.value)
                }
                placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;MIIEpAIBAAKCAQEA...&#10;-----END RSA PRIVATE KEY-----"
                value={formData.ec2PrivateKey}
              />
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">
                  Contents of your .pem private key file. Required for SSH access to EC2 instances.
                </p>
                <div className="flex items-start space-x-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <Key className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="text-xs text-blue-800">
                    <p className="font-medium mb-1">How to get your private key:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
                      <li>Download your .pem file when creating a key pair in AWS</li>
                      <li>Open the .pem file in a text editor</li>
                      <li>Copy the entire contents (including BEGIN/END lines)</li>
                      <li>Paste here</li>
                    </ol>
                  </div>
                </div>
              </div>
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
                Credentials are encrypted with AES-256-CBC before being stored
                in your browser. They are never sent to our servers in plaintext
                and expire after 24 hours.
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
    </div>
  )
}
