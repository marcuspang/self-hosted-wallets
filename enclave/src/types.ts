// Type definitions for Nitro Enclave Wallet Application

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface SSS {
  threshold: number;
  numShares: number;
}

export interface SSSShare {
  index: number;
  encryptedShare: string;
  shareType: 'enclave' | 'user' | 'backup';
}

export interface EnclaveRequest {
  method: string;
  params: any;
  id: string;
  timestamp: string;
}

export interface EnclaveResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
}

export interface WalletGenerationResult {
  walletAddress: string;
  shares: SSSShare[];
  publicKey: string;
}

export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
  chainId: number;
}

export interface SignedTransaction {
  rawTransaction: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  gasLimit: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce: number;
  chainId: number;
  v: string;
  r: string;
  s: string;
}

export interface AttestationDocument {
  moduleId: string;
  timestamp: number;
  digest: string;
  pcrs: Record<number, string>;
  certificate: string;
  cabundle: string[];
  publicKey?: string;
  userData?: string;
  nonce?: string;
}

export interface EnclaveMeasurements {
  pcr0: string; // Enclave image
  pcr1: string; // Linux kernel
  pcr2: string; // Application
  pcr8: string; // Linux kernel boot ramfs
}

export interface CommunicationMessage {
  type: 'request' | 'response';
  id: string;
  method?: string;
  params?: any;
  result?: any;
  error?: string;
  timestamp: string;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  enclave: boolean;
  services: {
    keyManager: boolean;
    signer: boolean;
    attestation: boolean;
  };
}

// Error types
export class EnclaveError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'EnclaveError';
  }
}

export class KeyManagerError extends EnclaveError {
  constructor(message: string, details?: any) {
    super(message, 'KEY_MANAGER_ERROR', details);
  }
}

export class SigningError extends EnclaveError {
  constructor(message: string, details?: any) {
    super(message, 'SIGNING_ERROR', details);
  }
}

export class AttestationError extends EnclaveError {
  constructor(message: string, details?: any) {
    super(message, 'ATTESTATION_ERROR', details);
  }
}

export class CommunicationError extends EnclaveError {
  constructor(message: string, details?: any) {
    super(message, 'COMMUNICATION_ERROR', details);
  }
}