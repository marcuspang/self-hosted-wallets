import fastify from 'fastify';
import { KeyManager } from './keyManager';
import { TransactionSigner } from './signer';
import { AttestationProvider } from './attestation';
import { CommunicationManager } from './communication';
import { EnclaveRequest, EnclaveResponse } from './types';

// Initialize the Fastify server
const server = fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: false,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
});

// Initialize core services
const keyManager = new KeyManager();
const transactionSigner = new TransactionSigner(keyManager);
const attestationProvider = new AttestationProvider();
const communicationManager = new CommunicationManager();

// Health check endpoint
server.get('/health', async (request, reply) => {
  return { 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    enclave: true,
    services: {
      keyManager: true,
      signer: true,
      attestation: true
    }
  };
});

// Generate new wallet keys with SSS
server.post<{ Body: { walletName: string; userId: string } }>(
  '/generate-keys',
  async (request, reply) => {
    try {
      const { walletName, userId } = request.body;
      
      server.log.info(`Generating keys for wallet: ${walletName}, user: ${userId}`);
      
      // Generate private key in secure enclave environment
      const keyPair = await keyManager.generateKeyPair();
      
      // Split the private key using Shamir Secret Sharing
      const shares = await keyManager.splitPrivateKey(keyPair.privateKey, {
        threshold: 3,
        numShares: 5
      });
      
      // Get wallet address from public key
      const walletAddress = keyManager.getAddressFromPublicKey(keyPair.publicKey);
      
      const response: EnclaveResponse = {
        success: true,
        data: {
          walletAddress,
          shares: shares.map((share, index) => ({
            index,
            encryptedShare: share,
            shareType: index === 0 ? 'enclave' : index === 1 ? 'user' : 'backup'
          })),
          publicKey: keyPair.publicKey
        },
        timestamp: new Date().toISOString()
      };
      
      return response;
    } catch (error) {
      server.log.error('Failed to generate keys:', error);
      return {
        success: false,
        error: 'Key generation failed',
        timestamp: new Date().toISOString()
      };
    }
  }
);

// Reconstruct private key from SSS shares
server.post<{ Body: { shares: Array<{ index: number; encryptedShare: string }> } }>(
  '/reconstruct-key',
  async (request, reply) => {
    try {
      const { shares } = request.body;
      
      server.log.info(`Reconstructing key from ${shares.length} shares`);
      
      if (shares.length < 3) {
        throw new Error('Insufficient shares for key reconstruction');
      }
      
      const privateKey = await keyManager.reconstructPrivateKey(shares);
      const publicKey = keyManager.getPublicKeyFromPrivate(privateKey);
      const walletAddress = keyManager.getAddressFromPublicKey(publicKey);
      
      return {
        success: true,
        data: {
          walletAddress,
          publicKey,
          // Note: Private key is kept in memory, not returned
          keyReconstructed: true
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      server.log.error('Failed to reconstruct key:', error);
      return {
        success: false,
        error: 'Key reconstruction failed',
        timestamp: new Date().toISOString()
      };
    }
  }
);

// Sign transaction
server.post<{ 
  Body: { 
    transaction: any; 
    walletAddress: string; 
    shares?: Array<{ index: number; encryptedShare: string }>;
  } 
}>('/sign-transaction', async (request, reply) => {
  try {
    const { transaction, walletAddress, shares } = request.body;
    
    server.log.info(`Signing transaction for wallet: ${walletAddress}`);
    
    let privateKey: string;
    
    // If shares are provided, reconstruct the key
    if (shares && shares.length >= 3) {
      privateKey = await keyManager.reconstructPrivateKey(shares);
    } else {
      // Try to get the key from memory (if previously reconstructed)
      privateKey = keyManager.getCachedPrivateKey(walletAddress);
      if (!privateKey) {
        throw new Error('Private key not available - provide SSS shares');
      }
    }
    
    // Sign the transaction
    const signedTransaction = await transactionSigner.signTransaction(
      transaction,
      privateKey
    );
    
    // Get transaction hash
    const txHash = transactionSigner.getTransactionHash(signedTransaction);
    
    return {
      success: true,
      data: {
        signedTransaction,
        txHash,
        walletAddress
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    server.log.error('Failed to sign transaction:', error);
    return {
      success: false,
      error: 'Transaction signing failed',
      timestamp: new Date().toISOString()
    };
  }
});

// Get enclave attestation document
server.get('/attestation', async (request, reply) => {
  try {
    server.log.info('Generating attestation document');
    
    const attestationDoc = await attestationProvider.generateAttestation();
    
    return {
      success: true,
      data: {
        attestation: attestationDoc,
        measurements: attestationProvider.getMeasurements()
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    server.log.error('Failed to generate attestation:', error);
    return {
      success: false,
      error: 'Attestation generation failed',
      timestamp: new Date().toISOString()
    };
  }
});

// Start the server
const start = async () => {
  try {
    const port = process.env.ENCLAVE_PORT ? parseInt(process.env.ENCLAVE_PORT) : 8080;
    const host = '0.0.0.0';
    
    server.log.info('🔐 Starting Nitro Enclave Wallet Application');
    server.log.info(`🔧 Initializing core services...`);
    
    // Initialize services
    await keyManager.initialize();
    await attestationProvider.initialize();
    await communicationManager.initialize();
    
    server.log.info('✅ Core services initialized');
    
    // Start listening
    await server.listen({ port, host });
    
    server.log.info(`🚀 Enclave server listening on ${host}:${port}`);
    server.log.info('🔒 Running in trusted execution environment');
    
    // Register cleanup handlers
    process.on('SIGTERM', async () => {
      server.log.info('🛑 Received SIGTERM, shutting down gracefully...');
      await server.close();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      server.log.info('🛑 Received SIGINT, shutting down gracefully...');
      await server.close();
      process.exit(0);
    });
    
  } catch (error) {
    server.log.error('Failed to start enclave application:', error);
    process.exit(1);
  }
};

start();