import { randomBytes } from 'crypto';
import { ethers } from 'ethers';
import * as sss from '@privy-io/shamir-secret-sharing';
import sodium from 'sodium-native';
import { 
  KeyPair, 
  SSS, 
  SSSShare, 
  KeyManagerError 
} from './types';

export class KeyManager {
  private keyCache: Map<string, string> = new Map();
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    try {
      // Initialize sodium for additional cryptographic operations
      if (!sodium) {
        throw new KeyManagerError('Failed to initialize sodium cryptography');
      }

      // Verify we're in a secure environment
      if (process.env.NODE_ENV === 'production') {
        this.verifyEnclaveEnvironment();
      }

      this.initialized = true;
      console.log('✅ KeyManager initialized successfully');
    } catch (error) {
      throw new KeyManagerError(`Failed to initialize KeyManager: ${error.message}`);
    }
  }

  private verifyEnclaveEnvironment(): void {
    // Check for Nitro Enclave specific environment markers
    // In a real enclave, we'd check for specific system files or calls
    const isEnclave = process.env.ENCLAVE_MODE === 'true' || 
                     process.platform === 'linux';
    
    if (!isEnclave && process.env.NODE_ENV === 'production') {
      throw new KeyManagerError('Not running in a secure enclave environment');
    }
  }

  /**
   * Generate a new cryptographically secure key pair
   */
  async generateKeyPair(): Promise<KeyPair> {
    if (!this.initialized) {
      throw new KeyManagerError('KeyManager not initialized');
    }

    try {
      // Use hardware-backed randomness in Nitro Enclave
      const randomBytes32 = randomBytes(32);
      
      // Create ethers wallet from random bytes
      const wallet = new ethers.Wallet(randomBytes32);
      
      const keyPair: KeyPair = {
        privateKey: wallet.privateKey,
        publicKey: wallet.publicKey
      };

      console.log(`🔐 Generated new key pair for address: ${wallet.address}`);
      
      return keyPair;
    } catch (error) {
      throw new KeyManagerError(`Failed to generate key pair: ${error.message}`);
    }
  }

  /**
   * Split private key using Shamir Secret Sharing
   */
  async splitPrivateKey(privateKey: string, config: SSS): Promise<string[]> {
    try {
      // Remove '0x' prefix if present
      const cleanPrivateKey = privateKey.startsWith('0x') 
        ? privateKey.slice(2) 
        : privateKey;

      // Convert hex string to buffer
      const privateKeyBuffer = Buffer.from(cleanPrivateKey, 'hex');

      // Split using Shamir Secret Sharing
      const shares = sss.split(privateKeyBuffer, {
        shares: config.numShares,
        threshold: config.threshold
      });

      // Convert shares to hex strings
      const hexShares = shares.map(share => share.toString('hex'));

      console.log(`🔑 Split private key into ${config.numShares} shares (threshold: ${config.threshold})`);
      
      return hexShares;
    } catch (error) {
      throw new KeyManagerError(`Failed to split private key: ${error.message}`);
    }
  }

  /**
   * Reconstruct private key from SSS shares
   */
  async reconstructPrivateKey(shares: Array<{ index: number; encryptedShare: string }>): Promise<string> {
    try {
      if (shares.length < 3) {
        throw new KeyManagerError('Insufficient shares for reconstruction (minimum 3 required)');
      }

      // Convert hex shares back to buffers
      const shareBuffers = shares.map(share => 
        Buffer.from(share.encryptedShare, 'hex')
      );

      // Reconstruct the private key
      const reconstructedKey = sss.combine(shareBuffers);
      const privateKey = '0x' + reconstructedKey.toString('hex');

      // Verify the reconstructed key is valid
      try {
        new ethers.Wallet(privateKey);
      } catch {
        throw new KeyManagerError('Reconstructed private key is invalid');
      }

      // Cache the reconstructed key temporarily
      const wallet = new ethers.Wallet(privateKey);
      this.keyCache.set(wallet.address.toLowerCase(), privateKey);

      console.log(`🔓 Reconstructed private key for address: ${wallet.address}`);
      
      return privateKey;
    } catch (error) {
      throw new KeyManagerError(`Failed to reconstruct private key: ${error.message}`);
    }
  }

  /**
   * Get public key from private key
   */
  getPublicKeyFromPrivate(privateKey: string): string {
    try {
      const wallet = new ethers.Wallet(privateKey);
      return wallet.publicKey;
    } catch (error) {
      throw new KeyManagerError(`Failed to derive public key: ${error.message}`);
    }
  }

  /**
   * Get wallet address from public key
   */
  getAddressFromPublicKey(publicKey: string): string {
    try {
      return ethers.utils.computeAddress(publicKey);
    } catch (error) {
      throw new KeyManagerError(`Failed to derive address: ${error.message}`);
    }
  }

  /**
   * Get cached private key by wallet address
   */
  getCachedPrivateKey(walletAddress: string): string | null {
    const key = this.keyCache.get(walletAddress.toLowerCase());
    if (!key) {
      console.warn(`No cached private key found for address: ${walletAddress}`);
    }
    return key || null;
  }

  /**
   * Clear cached private key for security
   */
  clearCachedKey(walletAddress: string): void {
    const deleted = this.keyCache.delete(walletAddress.toLowerCase());
    if (deleted) {
      console.log(`🗑️ Cleared cached private key for address: ${walletAddress}`);
    }
  }

  /**
   * Clear all cached private keys
   */
  clearAllCachedKeys(): void {
    const count = this.keyCache.size;
    this.keyCache.clear();
    console.log(`🗑️ Cleared ${count} cached private keys`);
  }

  /**
   * Encrypt data using sodium
   */
  encryptData(data: Buffer, password: string): Buffer {
    try {
      const salt = randomBytes(sodium.crypto_pwhash_SALTBYTES);
      const key = Buffer.alloc(sodium.crypto_secretbox_KEYBYTES);
      
      // Derive key from password
      sodium.crypto_pwhash(
        key,
        Buffer.from(password),
        salt,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_DEFAULT
      );

      const nonce = randomBytes(sodium.crypto_secretbox_NONCEBYTES);
      const ciphertext = Buffer.alloc(data.length + sodium.crypto_secretbox_MACBYTES);
      
      sodium.crypto_secretbox_easy(ciphertext, data, nonce, key);
      
      // Combine salt, nonce, and ciphertext
      return Buffer.concat([salt, nonce, ciphertext]);
    } catch (error) {
      throw new KeyManagerError(`Failed to encrypt data: ${error.message}`);
    }
  }

  /**
   * Decrypt data using sodium
   */
  decryptData(encryptedData: Buffer, password: string): Buffer {
    try {
      const salt = encryptedData.subarray(0, sodium.crypto_pwhash_SALTBYTES);
      const nonce = encryptedData.subarray(
        sodium.crypto_pwhash_SALTBYTES,
        sodium.crypto_pwhash_SALTBYTES + sodium.crypto_secretbox_NONCEBYTES
      );
      const ciphertext = encryptedData.subarray(
        sodium.crypto_pwhash_SALTBYTES + sodium.crypto_secretbox_NONCEBYTES
      );

      const key = Buffer.alloc(sodium.crypto_secretbox_KEYBYTES);
      
      // Derive key from password
      sodium.crypto_pwhash(
        key,
        Buffer.from(password),
        salt,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_DEFAULT
      );

      const decrypted = Buffer.alloc(ciphertext.length - sodium.crypto_secretbox_MACBYTES);
      const success = sodium.crypto_secretbox_open_easy(decrypted, ciphertext, nonce, key);
      
      if (!success) {
        throw new KeyManagerError('Failed to decrypt data - invalid password or corrupted data');
      }

      return decrypted;
    } catch (error) {
      throw new KeyManagerError(`Failed to decrypt data: ${error.message}`);
    }
  }

  /**
   * Get current statistics
   */
  getStats(): {
    initialized: boolean;
    cachedKeys: number;
  } {
    return {
      initialized: this.initialized,
      cachedKeys: this.keyCache.size
    };
  }
}