import { ethers } from 'ethers';
import { 
  TransactionRequest, 
  SignedTransaction, 
  SigningError 
} from './types';
import { KeyManager } from './keyManager';

export class TransactionSigner {
  private keyManager: KeyManager;

  constructor(keyManager: KeyManager) {
    this.keyManager = keyManager;
  }

  /**
   * Sign an Ethereum transaction
   */
  async signTransaction(
    transaction: TransactionRequest,
    privateKey: string
  ): Promise<SignedTransaction> {
    try {
      console.log(`📝 Signing transaction for address: ${transaction.to}`);

      // Create wallet instance
      const wallet = new ethers.Wallet(privateKey);
      
      // Prepare transaction object
      const tx: ethers.providers.TransactionRequest = {
        to: transaction.to,
        value: transaction.value ? ethers.utils.parseEther(transaction.value) : '0',
        data: transaction.data || '0x',
        gasLimit: transaction.gasLimit || '21000',
        chainId: transaction.chainId,
        nonce: transaction.nonce
      };

      // Handle gas pricing (legacy vs EIP-1559)
      if (transaction.maxFeePerGas && transaction.maxPriorityFeePerGas) {
        // EIP-1559 transaction
        tx.maxFeePerGas = ethers.utils.parseUnits(transaction.maxFeePerGas, 'gwei');
        tx.maxPriorityFeePerGas = ethers.utils.parseUnits(transaction.maxPriorityFeePerGas, 'gwei');
      } else if (transaction.gasPrice) {
        // Legacy transaction
        tx.gasPrice = ethers.utils.parseUnits(transaction.gasPrice, 'gwei');
      }

      // Sign the transaction
      const signedTx = await wallet.signTransaction(tx);
      
      // Parse the signed transaction to extract components
      const parsedTx = ethers.utils.parseTransaction(signedTx);
      
      const signedTransaction: SignedTransaction = {
        rawTransaction: signedTx,
        hash: parsedTx.hash!,
        from: parsedTx.from!,
        to: parsedTx.to!,
        value: parsedTx.value?.toString() || '0',
        gasLimit: parsedTx.gasLimit?.toString() || '0',
        gasPrice: parsedTx.gasPrice?.toString(),
        maxFeePerGas: parsedTx.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: parsedTx.maxPriorityFeePerGas?.toString(),
        nonce: parsedTx.nonce || 0,
        chainId: parsedTx.chainId || 0,
        v: parsedTx.v?.toString() || '0',
        r: parsedTx.r || '0x',
        s: parsedTx.s || '0x'
      };

      console.log(`✅ Transaction signed successfully. Hash: ${signedTransaction.hash}`);
      
      return signedTransaction;
    } catch (error) {
      throw new SigningError(`Failed to sign transaction: ${error.message}`);
    }
  }

  /**
   * Sign a message
   */
  async signMessage(message: string, privateKey: string): Promise<string> {
    try {
      console.log(`📝 Signing message: ${message.substring(0, 50)}...`);

      const wallet = new ethers.Wallet(privateKey);
      const signature = await wallet.signMessage(message);

      console.log(`✅ Message signed successfully`);
      
      return signature;
    } catch (error) {
      throw new SigningError(`Failed to sign message: ${error.message}`);
    }
  }

  /**
   * Sign typed data (EIP-712)
   */
  async signTypedData(
    domain: any,
    types: any,
    value: any,
    privateKey: string
  ): Promise<string> {
    try {
      console.log(`📝 Signing typed data for domain: ${domain.name}`);

      const wallet = new ethers.Wallet(privateKey);
      const signature = await wallet._signTypedData(domain, types, value);

      console.log(`✅ Typed data signed successfully`);
      
      return signature;
    } catch (error) {
      throw new SigningError(`Failed to sign typed data: ${error.message}`);
    }
  }

  /**
   * Batch sign multiple transactions
   */
  async batchSignTransactions(
    transactions: TransactionRequest[],
    privateKey: string
  ): Promise<SignedTransaction[]> {
    try {
      console.log(`📝 Batch signing ${transactions.length} transactions`);

      const signedTransactions: SignedTransaction[] = [];
      
      for (const transaction of transactions) {
        const signed = await this.signTransaction(transaction, privateKey);
        signedTransactions.push(signed);
      }

      console.log(`✅ Batch signed ${signedTransactions.length} transactions`);
      
      return signedTransactions;
    } catch (error) {
      throw new SigningError(`Failed to batch sign transactions: ${error.message}`);
    }
  }

  /**
   * Get transaction hash from signed transaction
   */
  getTransactionHash(signedTx: SignedTransaction | string): string {
    try {
      if (typeof signedTx === 'string') {
        // If it's a raw transaction string
        const parsedTx = ethers.utils.parseTransaction(signedTx);
        return parsedTx.hash!;
      } else {
        // If it's a SignedTransaction object
        return signedTx.hash;
      }
    } catch (error) {
      throw new SigningError(`Failed to get transaction hash: ${error.message}`);
    }
  }

  /**
   * Verify transaction signature
   */
  verifyTransactionSignature(signedTx: string): {
    isValid: boolean;
    signer: string;
    hash: string;
  } {
    try {
      const parsedTx = ethers.utils.parseTransaction(signedTx);
      
      const result = {
        isValid: !!parsedTx.from,
        signer: parsedTx.from || '0x',
        hash: parsedTx.hash || '0x'
      };

      console.log(`🔍 Transaction signature verification: ${result.isValid ? 'VALID' : 'INVALID'}`);
      
      return result;
    } catch (error) {
      return {
        isValid: false,
        signer: '0x',
        hash: '0x'
      };
    }
  }

  /**
   * Verify message signature
   */
  verifyMessageSignature(
    message: string,
    signature: string,
    expectedSigner: string
  ): boolean {
    try {
      const recoveredSigner = ethers.utils.verifyMessage(message, signature);
      const isValid = recoveredSigner.toLowerCase() === expectedSigner.toLowerCase();

      console.log(`🔍 Message signature verification: ${isValid ? 'VALID' : 'INVALID'}`);
      
      return isValid;
    } catch (error) {
      console.error('Message signature verification failed:', error);
      return false;
    }
  }

  /**
   * Estimate gas for transaction
   */
  async estimateGas(transaction: TransactionRequest): Promise<string> {
    try {
      // This would typically require a provider connection
      // For enclave purposes, we'll provide conservative estimates
      
      let gasEstimate = '21000'; // Standard ETH transfer
      
      if (transaction.data && transaction.data !== '0x' && transaction.data.length > 2) {
        // Contract interaction - higher gas estimate
        const dataLength = (transaction.data.length - 2) / 2; // bytes
        const dataGas = dataLength * 16; // 16 gas per byte
        gasEstimate = (21000 + dataGas + 50000).toString(); // Base + data + execution
      }

      console.log(`⛽ Estimated gas for transaction: ${gasEstimate}`);
      
      return gasEstimate;
    } catch (error) {
      throw new SigningError(`Failed to estimate gas: ${error.message}`);
    }
  }

  /**
   * Calculate transaction fee
   */
  calculateTransactionFee(
    gasLimit: string,
    gasPrice?: string,
    maxFeePerGas?: string
  ): string {
    try {
      const gas = ethers.BigNumber.from(gasLimit);
      
      let feeWei: ethers.BigNumber;
      
      if (maxFeePerGas) {
        // EIP-1559 transaction
        const maxFee = ethers.utils.parseUnits(maxFeePerGas, 'gwei');
        feeWei = gas.mul(maxFee);
      } else if (gasPrice) {
        // Legacy transaction
        const price = ethers.utils.parseUnits(gasPrice, 'gwei');
        feeWei = gas.mul(price);
      } else {
        throw new SigningError('Either gasPrice or maxFeePerGas must be provided');
      }

      return ethers.utils.formatEther(feeWei);
    } catch (error) {
      throw new SigningError(`Failed to calculate transaction fee: ${error.message}`);
    }
  }

  /**
   * Get signing statistics
   */
  getStats(): {
    signingEnabled: boolean;
    keyManagerConnected: boolean;
  } {
    return {
      signingEnabled: true,
      keyManagerConnected: !!this.keyManager
    };
  }
}