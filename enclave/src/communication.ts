import { EventEmitter } from 'events';
import { 
  CommunicationMessage, 
  EnclaveRequest, 
  EnclaveResponse, 
  CommunicationError 
} from './types';

export class CommunicationManager extends EventEmitter {
  private messageQueue: Map<string, CommunicationMessage> = new Map();
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    try {
      console.log('🔗 Initializing CommunicationManager...');

      // Set up message handling
      this.setupMessageHandlers();

      // Initialize VSOCK communication if in real enclave
      if (this.isRealEnclave()) {
        await this.initializeVSOCK();
      } else {
        await this.initializeMockCommunication();
      }

      this.isInitialized = true;
      console.log('✅ CommunicationManager initialized successfully');
    } catch (error) {
      throw new CommunicationError(`Failed to initialize communication: ${error.message}`);
    }
  }

  private setupMessageHandlers(): void {
    // Handle process signals for graceful shutdown
    process.on('SIGTERM', () => {
      console.log('📡 Received SIGTERM, closing communication channels...');
      this.cleanup();
    });

    process.on('SIGINT', () => {
      console.log('📡 Received SIGINT, closing communication channels...');
      this.cleanup();
    });
  }

  private async initializeVSOCK(): Promise<void> {
    try {
      // In a real Nitro Enclave, this would set up VSOCK communication
      // VSOCK allows communication between enclave and host
      console.log('🔌 Setting up VSOCK communication...');
      
      // This would be implemented using Node.js native bindings or
      // a VSOCK library for the actual Nitro Enclave environment
      
      console.log('✅ VSOCK communication initialized');
    } catch (error) {
      throw new CommunicationError(`Failed to initialize VSOCK: ${error.message}`);
    }
  }

  private async initializeMockCommunication(): Promise<void> {
    try {
      console.log('🔌 Setting up mock communication for development...');
      
      // For development, we'll use standard HTTP/TCP communication
      // This simulates the enclave-host communication
      
      console.log('✅ Mock communication initialized');
    } catch (error) {
      throw new CommunicationError(`Failed to initialize mock communication: ${error.message}`);
    }
  }

  /**
   * Send message to host
   */
  async sendToHost(message: CommunicationMessage): Promise<void> {
    if (!this.isInitialized) {
      throw new CommunicationError('Communication manager not initialized');
    }

    try {
      console.log(`📤 Sending message to host: ${message.type} - ${message.id}`);

      if (this.isRealEnclave()) {
        await this.sendViaVSOCK(message);
      } else {
        await this.sendViaMock(message);
      }

      // Store message in queue for tracking
      this.messageQueue.set(message.id, message);

      // Emit event for listeners
      this.emit('messageSent', message);
    } catch (error) {
      throw new CommunicationError(`Failed to send message to host: ${error.message}`);
    }
  }

  private async sendViaVSOCK(message: CommunicationMessage): Promise<void> {
    // In a real implementation, this would use VSOCK to send data
    // to the host application running outside the enclave
    console.log('📡 Sending via VSOCK (mock implementation)');
    
    // Mock VSOCK send
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  private async sendViaMock(message: CommunicationMessage): Promise<void> {
    // Mock implementation for development
    console.log('📡 Sending via mock channel:', JSON.stringify(message, null, 2));
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  /**
   * Receive message from host
   */
  async receiveFromHost(): Promise<CommunicationMessage | null> {
    if (!this.isInitialized) {
      throw new CommunicationError('Communication manager not initialized');
    }

    try {
      let message: CommunicationMessage | null;

      if (this.isRealEnclave()) {
        message = await this.receiveViaVSOCK();
      } else {
        message = await this.receiveViaMock();
      }

      if (message) {
        console.log(`📥 Received message from host: ${message.type} - ${message.id}`);
        this.emit('messageReceived', message);
      }

      return message;
    } catch (error) {
      throw new CommunicationError(`Failed to receive message from host: ${error.message}`);
    }
  }

  private async receiveViaVSOCK(): Promise<CommunicationMessage | null> {
    // In a real implementation, this would listen on VSOCK for incoming messages
    console.log('📡 Listening on VSOCK (mock implementation)');
    
    // Mock VSOCK receive - return null as no messages in queue
    return null;
  }

  private async receiveViaMock(): Promise<CommunicationMessage | null> {
    // Mock implementation for development
    // In reality, this would be handled by the HTTP server we set up
    return null;
  }

  /**
   * Create request message
   */
  createRequest(method: string, params: any): CommunicationMessage {
    const id = this.generateMessageId();
    
    return {
      type: 'request',
      id,
      method,
      params,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create response message
   */
  createResponse(requestId: string, result?: any, error?: string): CommunicationMessage {
    return {
      type: 'response',
      id: requestId,
      result,
      error,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Handle incoming request
   */
  async handleRequest(request: CommunicationMessage): Promise<CommunicationMessage> {
    try {
      console.log(`🔄 Handling request: ${request.method}`);

      let result: any;
      let error: string | undefined;

      switch (request.method) {
        case 'ping':
          result = { pong: true, timestamp: new Date().toISOString() };
          break;

        case 'getStatus':
          result = {
            status: 'healthy',
            initialized: this.isInitialized,
            messageQueue: this.messageQueue.size
          };
          break;

        default:
          error = `Unknown method: ${request.method}`;
      }

      return this.createResponse(request.id, result, error);
    } catch (err) {
      return this.createResponse(
        request.id,
        undefined,
        `Request handling failed: ${err.message}`
      );
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `${timestamp}-${random}`;
  }

  /**
   * Check if running in real enclave
   */
  private isRealEnclave(): boolean {
    return process.env.ENCLAVE_MODE === 'true' && 
           process.platform === 'linux' &&
           process.env.NODE_ENV === 'production';
  }

  /**
   * Get message from queue
   */
  getMessage(messageId: string): CommunicationMessage | undefined {
    return this.messageQueue.get(messageId);
  }

  /**
   * Remove message from queue
   */
  removeMessage(messageId: string): boolean {
    return this.messageQueue.delete(messageId);
  }

  /**
   * Clear message queue
   */
  clearMessageQueue(): void {
    const count = this.messageQueue.size;
    this.messageQueue.clear();
    console.log(`🗑️ Cleared ${count} messages from queue`);
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    totalMessages: number;
    oldestMessage?: string;
    newestMessage?: string;
  } {
    const messages = Array.from(this.messageQueue.values());
    
    return {
      totalMessages: messages.length,
      oldestMessage: messages[0]?.timestamp,
      newestMessage: messages[messages.length - 1]?.timestamp
    };
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    console.log('🧹 Cleaning up communication resources...');
    
    this.clearMessageQueue();
    this.removeAllListeners();
    
    console.log('✅ Communication cleanup complete');
  }

  /**
   * Get communication statistics
   */
  getStats(): {
    initialized: boolean;
    isRealEnclave: boolean;
    messageQueue: number;
    listeners: number;
  } {
    return {
      initialized: this.isInitialized,
      isRealEnclave: this.isRealEnclave(),
      messageQueue: this.messageQueue.size,
      listeners: this.listenerCount('messageReceived') + this.listenerCount('messageSent')
    };
  }

  /**
   * Test communication channel
   */
  async testCommunication(): Promise<boolean> {
    try {
      const testMessage = this.createRequest('ping', { test: true });
      await this.sendToHost(testMessage);
      
      // In a real implementation, we'd wait for a response
      // For now, just return true if send succeeded
      return true;
    } catch (error) {
      console.error('Communication test failed:', error);
      return false;
    }
  }
}