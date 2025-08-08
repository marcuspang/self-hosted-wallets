import { useAccount, useDisconnect } from 'wagmi'
import { useQueryState } from 'nuqs'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { 
  Settings, 
  Database, 
  Cloud, 
  Wallet, 
  Shield, 
  History, 
  LogOut,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react'
import { DatabaseSetup } from './dashboard/DatabaseSetup'
import { AWSInstanceManagement } from './dashboard/AWSInstanceManagement'
import { WalletOperations } from './dashboard/WalletOperations'
import { PolicyConfiguration } from './dashboard/PolicyConfiguration'
import { TransactionHistory } from './dashboard/TransactionHistory'

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
    { label: 'Policies', status: 'pending', icon: Clock },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="flex h-16 items-center px-4">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold">Self-Hosted Embedded Wallet</h2>
          </div>
          <div className="ml-auto flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="text-sm text-muted-foreground">
                {account.address?.slice(0, 6)}...{account.address?.slice(-4)}
              </div>
              <Badge variant="secondary">Chain {account.chainId}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 border-r bg-muted/20 min-h-[calc(100vh-4rem)]">
          <div className="space-y-4 py-4">
            <div className="px-3 py-2">
              <div className="space-y-1">
                <Button
                  variant={activeTab === 'overview' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setActiveTab('overview')}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
                <Button
                  variant={activeTab === 'database' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setActiveTab('database')}
                >
                  <Database className="mr-2 h-4 w-4" />
                  Database Setup
                </Button>
                <Button
                  variant={activeTab === 'aws' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setActiveTab('aws')}
                >
                  <Cloud className="mr-2 h-4 w-4" />
                  AWS Instances
                </Button>
                <Button
                  variant={activeTab === 'wallet' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setActiveTab('wallet')}
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Wallet Operations
                </Button>
                <Button
                  variant={activeTab === 'policies' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setActiveTab('policies')}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Policies
                </Button>
                <Button
                  variant={activeTab === 'transactions' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setActiveTab('transactions')}
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
                <h3 className="text-lg font-medium">Dashboard Overview</h3>
                <p className="text-sm text-muted-foreground">
                  Monitor your embedded wallet infrastructure status
                </p>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {statusItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Card key={item.label}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          {item.label}
                        </CardTitle>
                        <Icon className={`h-4 w-4 ${
                          item.status === 'completed' ? 'text-green-600' : 'text-yellow-600'
                        }`} />
                      </CardHeader>
                      <CardContent>
                        <Badge 
                          variant={item.status === 'completed' ? 'default' : 'secondary'}
                          className="text-xs"
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
                    Follow these steps to set up your embedded wallet infrastructure
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Authentication with Porto SIWE ✓</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Database connection configured ✓</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm">Connect your PostgreSQL database</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm">Launch AWS EC2 instance for Nitro Enclaves</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm">Generate wallet using Shamir Secret Sharing</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm">Configure transaction policies</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'database' && <DatabaseSetup />}
          {activeTab === 'aws' && <AWSInstanceManagement />}
          {activeTab === 'wallet' && <WalletOperations />}
          {activeTab === 'policies' && <PolicyConfiguration />}
          {activeTab === 'transactions' && <TransactionHistory />}
        </div>
      </div>
    </div>
  )
}