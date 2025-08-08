# Nitro Enclave Wallet Application

This directory contains the AWS Nitro Enclave application for secure key generation and transaction signing.

## Overview

The enclave provides a trusted execution environment (TEE) for:
- Secure private key generation using hardware-backed randomness
- Shamir Secret Sharing (SSS) key splitting and reconstruction
- Transaction signing with attestation
- Host-to-enclave secure communication

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    EC2 Host Instance                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Nitro Enclave                      │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │           Enclave Application           │    │    │
│  │  │  • Key Generation                       │    │    │
│  │  │  • SSS Split/Reconstruct                │    │    │
│  │  │  • Transaction Signing                  │    │    │
│  │  │  • Attestation                          │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────┘    │
│                         ▲                               │
│                         │ VSOCK                         │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Host Application                   │    │
│  │  • API Server                                  │    │
│  │  • Database Integration                        │    │
│  │  • Client Communication                       │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Files

- `Dockerfile` - Enclave container configuration
- `package.json` - Node.js dependencies
- `build.sh` - Build script for creating EIF files
- `deploy.sh` - Deployment script for running enclaves
- `src/` - TypeScript source code
  - `index.ts` - Main application entry point
  - `keyManager.ts` - Key generation and SSS logic
  - `signer.ts` - Transaction signing with attestation
  - `communication.ts` - Host-enclave communication
  - `attestation.ts` - Attestation verification
  - `types.ts` - TypeScript type definitions

## Prerequisites

1. **EC2 Instance**: Must be running on a Nitro Enclave-enabled instance (e.g., m5.xlarge)
2. **Nitro CLI**: Install AWS Nitro CLI tools
3. **Docker**: For building container images
4. **Node.js**: For local development and testing

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the enclave:**
   ```bash
   ./build.sh
   ```

3. **Deploy the enclave:**
   ```bash
   ./deploy.sh
   ```

## Development

For local development without enclave deployment:

```bash
npm run dev
```

This runs the application in development mode without enclave restrictions.

## Configuration

Environment variables (set in host application):
- `ENCLAVE_CID`: Communication ID for VSOCK (default: 10)
- `ENCLAVE_PORT`: Port for enclave communication (default: 8080)
- `DEBUG_MODE`: Enable debug mode for development (default: false)

## Security Features

1. **Hardware-backed Key Generation**: Uses Nitro's hardware RNG
2. **Attestation**: Provides cryptographic proof of execution environment
3. **Isolated Execution**: No network access, secure memory
4. **SSS Key Management**: Splits keys across multiple shares
5. **Secure Communication**: VSOCK-based host communication

## API Endpoints

The enclave exposes the following internal API endpoints:

- `POST /generate-keys` - Generate new wallet keys with SSS
- `POST /reconstruct-key` - Reconstruct private key from SSS shares
- `POST /sign-transaction` - Sign Ethereum transactions
- `GET /attestation` - Get enclave attestation document
- `GET /health` - Health check endpoint

## Monitoring

Check enclave status:
```bash
nitro-cli describe-enclaves
```

View enclave logs:
```bash
nitro-cli console --enclave-id <ENCLAVE_ID>
```

Stop enclave:
```bash
nitro-cli terminate-enclave --enclave-id <ENCLAVE_ID>
```

## Troubleshooting

Common issues and solutions:

1. **EIF build fails**: Ensure Docker is running and nitro-cli is installed
2. **Memory allocation fails**: Check available hugepages on the host
3. **Communication errors**: Verify VSOCK configuration and CID assignment
4. **Attestation failures**: Ensure running on genuine Nitro hardware

## Production Deployment

For production deployment:

1. Set `DEBUG_MODE=false` in deploy.sh
2. Use production attestation verification
3. Configure proper memory and CPU allocation
4. Implement monitoring and health checks
5. Set up automatic enclave restart on failure