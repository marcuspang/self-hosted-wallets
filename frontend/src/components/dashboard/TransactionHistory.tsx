import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { Alert, AlertDescription } from '../ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { 
  History, 
  ExternalLink, 
  Filter,
  RefreshCw,
  Download,
  Fuel,
  Send,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react'

interface Transaction {
  id: string
  txHash: string
  walletAddress: string
  toAddress: string
  valueWei: string
  gasUsed: number
  gasSponsored: boolean
  status: 'pending' | 'confirmed' | 'failed'
  blockNumber?: number
  createdAt: string
  type: 'sent' | 'received'
}

export function TransactionHistory() {
  const [filter, setFilter] = useState<'all' | 'sent' | 'received' | 'sponsored'>('all')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions-history'],
    queryFn: async () => {
      const response = await fetch('/api/transactions/history', {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch transaction history')
      }
      return response.json()
    }
  })

  const transactions = data?.transactions || []
  const gasStats = data?.gasStats || {
    totalSponsored: 0,
    totalSaved: '0',
    sponsoredCount: 0
  }

  const filteredTransactions = transactions.filter(tx => {
    switch (filter) {
      case 'sent': return tx.type === 'sent'
      case 'received': return tx.type === 'received'
      case 'sponsored': return tx.gasSponsored
      default: return true
    }
  })

  const formatValue = (valueWei: string) => {
    const eth = parseFloat(valueWei) / 1e18
    return eth.toFixed(6)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-600" />
      default: return <AlertCircle className="h-4 w-4 text-gray-600" />
    }
  }

  const getTypeIcon = (type: string) => {
    return type === 'sent' ? 
      <ArrowUpRight className="h-4 w-4 text-red-600" /> : 
      <ArrowDownLeft className="h-4 w-4 text-green-600" />
  }

  const openInExplorer = (txHash: string) => {
    // This would open in the appropriate block explorer for the chain
    window.open(`https://sepolia.basescan.org/tx/${txHash}`, '_blank')
  }

  const exportTransactions = () => {
    const csv = [
      'Date,Hash,From,To,Amount,Gas,Sponsored,Status',
      ...filteredTransactions.map(tx => [
        new Date(tx.createdAt).toLocaleDateString(),
        tx.txHash,
        tx.walletAddress,
        tx.toAddress,
        formatValue(tx.valueWei),
        tx.gasUsed,
        tx.gasSponsored,
        tx.status
      ].join(','))
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transactions.csv'
    a.click()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Transaction History</h3>
          <p className="text-sm text-muted-foreground">
            View all transactions and gas sponsorship details
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={exportTransactions}>
            <Download className="mr-2 h-3 w-3" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Gas Sponsorship Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gas Sponsored</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{gasStats.sponsoredCount}</div>
            <p className="text-xs text-muted-foreground">
              transactions
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Saved</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{gasStats.totalSaved} ETH</div>
            <p className="text-xs text-muted-foreground">
              in gas fees
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">EIP-7702</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Active</div>
            <p className="text-xs text-muted-foreground">
              delegation enabled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Transaction Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <History className="h-5 w-5" />
              <span>Recent Transactions</span>
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4" />
              <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="sponsored">Sponsored</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No transactions found. Send your first transaction to see it here.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>From/To</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Gas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getTypeIcon(tx.type)}
                        <span className="capitalize">{tx.type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">
                        {tx.txHash.slice(0, 8)}...{tx.txHash.slice(-6)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {tx.type === 'sent' ? (
                          <>
                            <div className="text-muted-foreground">To:</div>
                            <code className="text-xs">
                              {tx.toAddress.slice(0, 6)}...{tx.toAddress.slice(-4)}
                            </code>
                          </>
                        ) : (
                          <>
                            <div className="text-muted-foreground">From:</div>
                            <code className="text-xs">
                              {tx.walletAddress.slice(0, 6)}...{tx.walletAddress.slice(-4)}
                            </code>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={tx.type === 'sent' ? 'text-red-600' : 'text-green-600'}>
                        {tx.type === 'sent' ? '-' : '+'}{formatValue(tx.valueWei)} ETH
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <span className="text-xs">{tx.gasUsed.toLocaleString()}</span>
                        {tx.gasSponsored && (
                          <Badge variant="secondary" className="text-xs">
                            <Fuel className="mr-1 h-2 w-2" />
                            Sponsored
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(tx.status)}
                        <span className="capitalize text-sm">{tx.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openInExplorer(tx.txHash)}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}