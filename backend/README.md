# Embedded Wallet Backend

This is the backend API server for the self-hosted embedded wallet application, built with Cloudflare Workers and Hono framework.

## Features

- **Authentication**: SIWE (Sign-in with Ethereum) authentication using Porto SDK
- **Database Management**: PostgreSQL schema setup and management
- **AWS Integration**: EC2 instance management and Nitro Enclaves deployment
- **Wallet Operations**: Secure wallet generation using Shamir Secret Sharing
- **Policy Management**: Transaction policies and spending limits
- **Gas Sponsorship**: EIP-7702 gas sponsorship support

## Development

### Prerequisites

- Node.js 18+
- pnpm
- Cloudflare Workers CLI (wrangler)

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Copy environment variables:
```bash
cp .dev.vars.example .dev.vars
```

3. Configure your environment variables in `.dev.vars`:
- `JWT_SECRET`: Secret for JWT token signing
- `AWS_ACCESS_KEY_ID`: AWS access key for EC2 management
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `AWS_REGION`: AWS region (default: us-east-1)

### Development Server

```bash
pnpm dev
```

The API will be available at `http://localhost:8787`

### Deployment

```bash
pnpm deploy
```

## API Endpoints

### Authentication
- `POST /api/siwe/nonce` - Generate SIWE nonce
- `POST /api/siwe/verify` - Verify SIWE signature and authenticate
- `POST /api/siwe/logout` - Logout user
- `GET /api/me` - Get current user info

### Database
- `POST /api/database/test-connection` - Test PostgreSQL connection
- `POST /api/database/setup-schema` - Setup database schema

### AWS Management
- `GET /api/aws/instances` - List EC2 instances
- `POST /api/aws/instances` - Create new EC2 instance
- `POST /api/aws/instances/:id/start` - Start EC2 instance
- `POST /api/aws/instances/:id/stop` - Stop EC2 instance
- `DELETE /api/aws/instances/:id` - Terminate EC2 instance
- `POST /api/aws/enclaves/build` - Build and deploy Nitro Enclave

### Wallet Operations
- `GET /api/wallet/list` - List user wallets
- `POST /api/wallet/generate-keys` - Generate new wallet with SSS
- `POST /api/wallet/send-transaction` - Send transaction
- `GET /api/wallet/:address/balance` - Get wallet balance

### Policy Management
- `GET /api/policies/list` - List transaction policies
- `POST /api/policies/create` - Create new policy
- `PUT /api/policies/update` - Update existing policy
- `DELETE /api/policies/:id` - Delete policy

### Transaction History
- `GET /api/transactions/history` - Get transaction history with gas stats

## Configuration

### KV Namespace Setup

You'll need to create a KV namespace in Cloudflare for nonce storage:

```bash
wrangler kv:namespace create "NONCE_STORE"
```

Update your `wrangler.jsonc` with the returned namespace ID.

### CORS Configuration

The backend is configured to accept requests from:
- `http://localhost:5173` (Vite dev server)
- `http://localhost:3000` (Alternative dev port)

Update the CORS configuration in `src/index.ts` for production deployment.