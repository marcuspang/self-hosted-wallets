import {
  CheckCircle,
  Clock,
  Cloud,
  Database,
  History,
  LogOut,
  Settings,
  Shield,
  Wallet
} from 'lucide-react'
import { useQueryState } from 'nuqs'
import { useAccount, useDisconnect } from 'wagmi'
import { SecureAWSIntegration } from './dashboard/SecureAWSIntegration'
import { DatabaseSetup } from './dashboard/DatabaseSetup'
import { PolicyConfiguration } from './dashboard/PolicyConfiguration'
import { TransactionHistory } from './dashboard/TransactionHistory'
import { WalletOperations } from './dashboard/WalletOperations'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from './ui/card'

export function Dashboard() {
  const account = useAccount()
  const disconnect = useDisconnect()
  const [activeTab, setActiveTab] = useQueryState('tab', {
    defaultValue: 'overview',
    parse: (value) => value || 'overview',
    serialize: (value) => value
  })

  const handleLogout = () => {
    disconnect.disconnect()
  }

  const statusItems = [
    { label: 'Authentication', status: 'completed', icon: CheckCircle },
    { label: 'Database Connection', status: 'completed', icon: CheckCircle },
    { label: 'AWS Instance', status: 'pending', icon: Clock },
    { label: 'Wallet Setup', status: 'pending', icon: Clock },
    { label: 'Policies', status: 'pending', icon: Clock }
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="flex h-16 items-center px-4">
          <div className="flex items-center space-x-4">
            <h2 className="font-semibold text-lg">
              Self-Hosted Embedded Wallet
            </h2>
          </div>
          <div className="ml-auto flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="text-muted-foreground text-sm">
                {account.address?.slice(0, 6)}...{account.address?.slice(-4)}
              </div>
              <Badge variant="secondary">Chain {account.chainId}</Badge>
            </div>
            <Button onClick={handleLogout} size="sm" variant="outline">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="min-h-[calc(100vh-4rem)] w-64 border-r bg-muted/20">
          <div className="space-y-4 py-4">
            <div className="px-3 py-2">
              <div className="space-y-1">
                <Button
                  className="w-full justify-start"
                  onClick={() => setActiveTab('overview')}
                  variant={activeTab === 'overview' ? 'secondary' : 'ghost'}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
                <Button
                  className="w-full justify-start"
                  onClick={() => setActiveTab('database')}
                  variant={activeTab === 'database' ? 'secondary' : 'ghost'}
                >
                  <Database className="mr-2 h-4 w-4" />
                  Database Setup
                </Button>
                <Button
                  className="w-full justify-start"
                  onClick={() => setActiveTab('aws')}
                  variant={activeTab === 'aws' ? 'secondary' : 'ghost'}
                >
                  <Cloud className="mr-2 h-4 w-4" />
                  AWS Operations
                </Button>
                <Button
                  className="w-full justify-start"
                  onClick={() => setActiveTab('wallet')}
                  variant={activeTab === 'wallet' ? 'secondary' : 'ghost'}
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Wallet Operations
                </Button>
                <Button
                  className="w-full justify-start"
                  onClick={() => setActiveTab('policies')}
                  variant={activeTab === 'policies' ? 'secondary' : 'ghost'}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Policies
                </Button>
                <Button
                  className="w-full justify-start"
                  onClick={() => setActiveTab('transactions')}
                  variant={activeTab === 'transactions' ? 'secondary' : 'ghost'}
                >
                  <History className="mr-2 h-4 w-4" />
                  Transactions
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-4 p-4 pt-6">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-lg">Dashboard Overview</h3>
                <p className="text-muted-foreground text-sm">
                  Monitor your embedded wallet infrastructure status
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {statusItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Card key={item.label}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="font-medium text-sm">
                          {item.label}
                        </CardTitle>
                        <Icon
                          className={`h-4 w-4 ${
                            item.status === 'completed'
                              ? 'text-green-600'
                              : 'text-yellow-600'
                          }`}
                        />
                      </CardHeader>
                      <CardContent>
                        <Badge
                          className="text-xs"
                          variant={
                            item.status === 'completed'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {item.status === 'completed' ? 'Ready' : 'Pending'}
                        </Badge>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Getting Started</CardTitle>
                  <CardDescription>
                    Follow these steps to set up your embedded wallet
                    infrastructure
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">
                        Authentication with Porto SIWE ✓
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">
                        Database connection configured ✓
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm">
                        Connect your PostgreSQL database
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm">
                        Configure secure AWS credentials with KMS encryption
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm">
                        Launch AWS EC2 instance for Nitro Enclaves
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm">
                        Generate wallet using Shamir Secret Sharing
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm">
                        Configure transaction policies
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'database' && <DatabaseSetup />}
          {activeTab === 'aws' && <SecureAWSIntegration />}
          {activeTab === 'wallet' && <WalletOperations />}
          {activeTab === 'policies' && <PolicyConfiguration />}
          {activeTab === 'transactions' && <TransactionHistory />}
        </div>
      </div>
    </div>
  )
}
