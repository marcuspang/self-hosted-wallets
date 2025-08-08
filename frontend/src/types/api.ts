// API Response Types
export interface ApiResponse<T = any> {
  success?: boolean
  error?: string
  message?: string
  data?: T
}

// Database Types
export interface User {
  id: number
  ethereum_address: string
  created_at: string
}

export interface Wallet {
  id: number
  ethereum_address: string
  wallet_address: string
  wallet_name: string
  enclave_instance_id?: string
  created_at: string
  balance?: string
  status: 'active' | 'pending' | 'error'
}

export interface WalletKey {
  id: number
  user_id: number
  wallet_address: string
  share_index: number
  encrypted_share: string
  share_type: 'enclave' | 'user' | 'backup'
  created_at: string
}

export interface Policy {
  id: string
  user_id?: number
  type: 'spending_limit' | 'contract_permission' | 'time_restriction'
  contract_address?: string
  function_signature?: string
  limit_amount?: string
  limit_period?: 'hour' | 'day' | 'week' | 'month'
  expires_at?: string
  is_active: boolean
  created_at: string
}

export interface Transaction {
  id: string
  user_id?: number
  wallet_address: string
  tx_hash: string
  to_address: string
  value_wei: string
  gas_used: number
  gas_sponsored: boolean
  status: 'pending' | 'confirmed' | 'failed'
  block_number?: number
  created_at: string
  type: 'sent' | 'received'
}

// AWS Types
export interface AWSInstance {
  id: string
  status: 'pending' | 'running' | 'stopped' | 'terminated'
  type: string
  region: string
  enclave_status?: 'none' | 'building' | 'running' | 'failed'
}

// Gas Statistics
export interface GasStats {
  total_sponsored: number
  total_saved: string
  sponsored_count: number
}

// Request Types
export interface DatabaseConnectionRequest {
  database_url: string
}

export interface CreateInstanceRequest {
  instance_type: string
  region: string
}

export interface CreateWalletRequest {
  wallet_name: string
  instance_id: string
}

export interface SendTransactionRequest {
  from: string
  to: string
  value: string
  user_share?: string
}

export interface CreatePolicyRequest {
  type: Policy['type']
  contract_address?: string
  function_signature?: string
  limit_amount?: string
  limit_period?: string
  expires_at?: string
}

export interface UpdatePolicyRequest {
  policy_id: string
  is_active: boolean
}

// Response Types
export interface WalletListResponse extends ApiResponse {
  wallets: Wallet[]
}

export interface GenerateWalletResponse extends ApiResponse {
  wallet_address: string
  user_share?: string
}

export interface InstanceListResponse extends ApiResponse {
  instances: AWSInstance[]
}

export interface PolicyListResponse extends ApiResponse {
  policies: Policy[]
}

export interface TransactionHistoryResponse extends ApiResponse {
  transactions: Transaction[]
  gas_stats: GasStats
}

export interface BalanceResponse extends ApiResponse {
  balance: string
  token?: string
}