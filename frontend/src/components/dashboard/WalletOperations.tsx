import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Plus,
  Send,
  Shield,
  Wallet
} from 'lucide-react'
import { useState } from 'react'
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

interface WalletInfo {
  address: string
  name: string
  balance: string
  enclaveInstanceId?: string
  status: 'active' | 'pending' | 'error'
}

export function WalletOperations() {
  const queryClient = useQueryClient()
  const [newWalletName, setNewWalletName] = useState('')
  const [selectedWallet, setSelectedWallet] = useState<string>('')
  const [sendAmount, setSendAmount] = useState('')
  const [sendToAddress, setSendToAddress] = useState('')
  const [userShare, setUserShare] = useState('')
  const [showUserShare, setShowUserShare] = useState(false)

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const response = await fetch('/api/wallet/list', {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch wallets')
      }
      const data = (await response.json()) as { wallets: WalletInfo[] }
      return data.wallets || []
    }
  })

  const generateWalletMutation = useMutation({
    mutationFn: async ({
      walletName,
      instanceId
    }: {
      walletName: string
      instanceId: string
    }) => {
      const response = await fetch('/api/wallet/generate-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ walletName, instanceId })
      })

      if (!response.ok) {
        throw new Error('Failed to generate wallet')
      }
      return response.json()
    },
    onSuccess: (data) => {
      if (data.userShare) {
        setUserShare(data.userShare)
      }
      queryClient.invalidateQueries({ queryKey: ['wallets'] })
      setNewWalletName('')
    }
  })

  const sendTransactionMutation = useMutation({
    mutationFn: async ({
      from,
      to,
      value,
      userShare
    }: {
      from: string
      to: string
      value: string
      userShare?: string
    }) => {
      const response = await fetch('/api/wallet/send-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ from, to, value, userShare })
      })

      if (!response.ok) {
        throw new Error('Failed to send transaction')
      }
      return response.json()
    },
    onSuccess: () => {
      setSendAmount('')
      setSendToAddress('')
      queryClient.invalidateQueries({ queryKey: ['wallets'] })
    }
  })

  const refreshBalanceMutation = useMutation({
    mutationFn: async (walletAddress: string) => {
      const response = await fetch(`/api/wallet/${walletAddress}/balance`, {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error('Failed to refresh balance')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] })
    }
  })

  const generateWallet = () => {
    if (!newWalletName.trim()) {
      return
    }
    generateWalletMutation.mutate({
      walletName: newWalletName,
      instanceId: 'instance-123' // This would come from selected instance
    })
  }

  const sendTransaction = () => {
    if (!(selectedWallet && sendToAddress && sendAmount)) {
      return
    }
    sendTransactionMutation.mutate({
      from: selectedWallet,
      to: sendToAddress,
      value: sendAmount,
      userShare: userShare || undefined
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const refreshBalance = (walletAddress: string) => {
    refreshBalanceMutation.mutate(walletAddress)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-lg">Wallet Operations</h3>
        <p className="text-muted-foreground text-sm">
          Generate wallets using Shamir Secret Sharing and manage transactions
        </p>
      </div>

      {/* Generate New Wallet */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Plus className="h-5 w-5" />
            <span>Generate New Wallet</span>
          </CardTitle>
          <CardDescription>
            Create a new wallet using Shamir Secret Sharing in Nitro Enclave
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wallet-name">Wallet Name</Label>
            <Input
              id="wallet-name"
              onChange={(e) => setNewWalletName(e.target.value)}
              placeholder="My Wallet"
              value={newWalletName}
            />
          </div>
          <Button
            disabled={generateWalletMutation.isPending || !newWalletName.trim()}
            onClick={generateWallet}
          >
            {generateWalletMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Key className="mr-2 h-4 w-4" />
            )}
            Generate Wallet
          </Button>

          {userShare && (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p>Your secret share (keep this safe!):</p>
                  <div className="flex items-center space-x-2">
                    <code
                      className={`flex-1 rounded bg-muted p-2 text-xs ${
                        showUserShare ? '' : 'blur-sm filter'
                      }`}
                    >
                      {userShare}
                    </code>
                    <Button
                      onClick={() => setShowUserShare(!showUserShare)}
                      size="sm"
                      variant="outline"
                    >
                      {showUserShare ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      onClick={() => copyToClipboard(userShare)}
                      size="sm"
                      variant="outline"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Wallet List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Wallet className="h-5 w-5" />
            <span>Your Wallets</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {wallets.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No wallets found. Generate your first wallet to get started.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {wallets.map((wallet) => (
                <div className="rounded-lg border p-4" key={wallet.address}>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{wallet.name}</span>
                        <Badge
                          variant={
                            wallet.status === 'active' ? 'default' : 'secondary'
                          }
                        >
                          {wallet.status}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground text-sm">
                        <span>
                          {wallet.address.slice(0, 6)}...
                          {wallet.address.slice(-4)}
                        </span>
                        <Button
                          onClick={() => copyToClipboard(wallet.address)}
                          size="sm"
                          variant="ghost"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="text-sm">
                        Balance:{' '}
                        <span className="font-medium">
                          {wallet.balance} ETH
                        </span>
                        <Button
                          className="ml-2 h-6 px-2"
                          onClick={() => refreshBalance(wallet.address)}
                          size="sm"
                          variant="ghost"
                        >
                          Refresh
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Transaction */}
      {wallets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Send className="h-5 w-5" />
              <span>Send Transaction</span>
            </CardTitle>
            <CardDescription>
              Send ETH from your generated wallets
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="from-wallet">From Wallet</Label>
              <select
                className="w-full rounded-md border p-2"
                onChange={(e) => setSelectedWallet(e.target.value)}
                value={selectedWallet}
              >
                <option value="">Select wallet...</option>
                {wallets
                  .filter((w) => w.status === 'active')
                  .map((wallet) => (
                    <option key={wallet.address} value={wallet.address}>
                      {wallet.name} ({wallet.balance} ETH)
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-address">To Address</Label>
              <Input
                id="to-address"
                onChange={(e) => setSendToAddress(e.target.value)}
                placeholder="0x..."
                value={sendToAddress}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (ETH)</Label>
              <Input
                id="amount"
                onChange={(e) => setSendAmount(e.target.value)}
                placeholder="0.1"
                step="0.001"
                type="number"
                value={sendAmount}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-share">
                Your Secret Share (if required)
              </Label>
              <Input
                id="user-share"
                onChange={(e) => setUserShare(e.target.value)}
                placeholder="Enter your secret share if needed"
                type="password"
                value={userShare}
              />
            </div>

            <Button
              className="w-full"
              disabled={
                sendTransactionMutation.isPending ||
                !selectedWallet ||
                !sendToAddress ||
                !sendAmount
              }
              onClick={sendTransaction}
            >
              {sendTransactionMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send Transaction
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
