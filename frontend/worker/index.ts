import { env } from 'cloudflare:workers'
import {
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand
} from '@aws-sdk/client-ec2'
import { type Context, Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import * as jwt from 'hono/jwt'
import { Client } from 'pg'
import { Porto, ServerActions } from 'porto'
import { ServerClient } from 'porto/viem'
import { hashMessage } from 'viem'
import { generateSiweNonce, parseSiweMessage } from 'viem/siwe'

const porto = Porto.create()

const app = new Hono<{ Bindings: Env }>().basePath('/api')

// Authentication middleware
const authMiddleware = jwt.jwt({ cookie: 'auth', secret: env.JWT_SECRET })

// Helper function to get database client
const getDatabaseClient = async (databaseUrl: string) => {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  return client
}

// Helper function to get AWS EC2 client
const getEC2Client = (c: Context) => {
  return new EC2Client({
    region: c.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: c.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY
    }
  })
}

app.post('/siwe/nonce', async (c) => {
  // Generate a nonce to be used in the SIWE message.
  // This is used to prevent replay attacks.
  const nonce = generateSiweNonce()

  // Store nonce for this session (10 minutes).
  await c.env.NONCE_STORE.put(nonce, 'valid', { expirationTtl: 600 })

  return c.json({ nonce })
})

app.post('/siwe/verify', async (c) => {
  // Extract properties from the request body and SIWE message.
  const { message, signature } = await c.req.json()
  const { address, chainId, nonce } = parseSiweMessage(message)

  // If there is no nonce, we cannot verify the signature.
  if (!nonce) {
    return c.json({ error: 'Nonce is required' }, 400)
  }

  // Check if the nonce is valid for this session.
  const nonce_session = await c.env.NONCE_STORE.get(nonce)
  if (!nonce_session) {
    return c.json({ error: 'Invalid or expired nonce' }, 401)
  }

  await c.env.NONCE_STORE.delete(nonce)

  // Verify the signature.
  const client = ServerClient.fromPorto(porto, { chainId })
  const valid = ServerActions.verifySignature(client, {
    address: address!,
    digest: hashMessage(message),
    signature
  })

  // If the signature is invalid, we cannot authenticate the user.
  if (!valid) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const maxAge = 60 * 60 * 24 * 7 // 7 days
  const exp = Math.floor(Date.now() / 1000) + maxAge

  // Issue a JWT token for the user in a HTTP-only cookie.
  const token = await jwt.sign({ exp, sub: address }, c.env.JWT_SECRET)
  setCookie(c, 'auth', token, {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax',
    secure: true
  })

  return c.json({ success: true })
})

app.post(
  '/siwe/logout',
  jwt.jwt({ cookie: 'auth', secret: env.JWT_SECRET }),
  async (c) => {
    deleteCookie(c, 'auth')
    return c.json({ success: true })
  }
)

app.get('/me', authMiddleware, async (c) => {
  return c.json(c.get('jwtPayload'))
})

// Database Routes
app.post('/database/test-connection', authMiddleware, async (c) => {
  try {
    const { databaseUrl } = await c.req.json()
    if (!databaseUrl) {
      return c.json({ error: 'Database URL is required' }, 400)
    }

    const client = await getDatabaseClient(databaseUrl)
    await client.query('SELECT 1')
    await client.end()

    return c.json({ success: true, message: 'Connection successful' })
  } catch (error: any) {
    return c.json({ error: error.message || 'Connection failed' }, 500)
  }
})

app.post('/database/setup-schema', authMiddleware, async (c) => {
  try {
    const { databaseUrl } = await c.req.json()
    if (!databaseUrl) {
      return c.json({ error: 'Database URL is required' }, 400)
    }

    const client = await getDatabaseClient(databaseUrl)

    // Create schema based on PRD requirements
    const schema = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        ethereum_address VARCHAR(42) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS wallets (
        id SERIAL PRIMARY KEY,
        ethereum_address VARCHAR(42) REFERENCES users(ethereum_address),
        wallet_address VARCHAR(42) NOT NULL,
        wallet_name VARCHAR(255),
        enclave_instance_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS wallet_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        wallet_address VARCHAR(42),
        share_index INTEGER,
        encrypted_share TEXT,
        share_type VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS policies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        policy_type VARCHAR(50),
        contract_address VARCHAR(42),
        function_signature VARCHAR(255),
        limit_amount DECIMAL(78,0),
        limit_period VARCHAR(20),
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        wallet_address VARCHAR(42),
        tx_hash VARCHAR(66),
        to_address VARCHAR(42),
        value_wei DECIMAL(78,0),
        gas_used INTEGER,
        gas_sponsored BOOLEAN DEFAULT false,
        status VARCHAR(20),
        block_number INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `

    await client.query(schema)
    await client.end()

    return c.json({ success: true, message: 'Schema created successfully' })
  } catch (error: any) {
    return c.json({ error: error.message || 'Schema setup failed' }, 500)
  }
})

// AWS Instance Management Routes
app.get('/aws/instances', authMiddleware, async (c) => {
  try {
    const ec2 = getEC2Client(c)
    const command = new DescribeInstancesCommand({})
    const response = await ec2.send(command)

    const instances =
      response.Reservations?.flatMap(
        (reservation) =>
          reservation.Instances?.map((instance) => ({
            id: instance.InstanceId,
            status: instance.State?.Name,
            type: instance.InstanceType,
            region: c.env.AWS_REGION || 'us-east-1',
            enclaveStatus: 'none' // This would be determined by checking enclave status
          })) || []
      ) || []

    return c.json({ instances })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch instances' }, 500)
  }
})

app.post('/aws/instances', authMiddleware, async (c) => {
  try {
    const { instanceType } = await c.req.json()

    const ec2 = getEC2Client(c)
    const command = new RunInstancesCommand({
      ImageId: 'ami-0c02fb55956c7d316', // Amazon Linux 2 AMI
      InstanceType: instanceType,
      MinCount: 1,
      MaxCount: 1,
      SecurityGroupIds: ['sg-default'], // This should be configured properly
      UserData: Buffer.from(`#!/bin/bash
yum update -y
`).toString('base64')
    })

    const response = await ec2.send(command)
    const instanceId = response.Instances?.[0]?.InstanceId

    return c.json({ instanceId, status: 'pending' })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to create instance' }, 500)
  }
})

app.post('/aws/instances/:id/start', authMiddleware, async (c) => {
  try {
    const instanceId = c.req.param('id')
    const ec2 = getEC2Client(c)
    const command = new StartInstancesCommand({ InstanceIds: [instanceId] })
    await ec2.send(command)

    return c.json({ success: true, status: 'starting' })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to start instance' }, 500)
  }
})

app.post('/aws/instances/:id/stop', authMiddleware, async (c) => {
  try {
    const instanceId = c.req.param('id')
    const ec2 = getEC2Client(c)
    const command = new StopInstancesCommand({ InstanceIds: [instanceId] })
    await ec2.send(command)

    return c.json({ success: true, status: 'stopping' })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to stop instance' }, 500)
  }
})

app.delete('/aws/instances/:id', authMiddleware, async (c) => {
  try {
    const instanceId = c.req.param('id')
    const ec2 = getEC2Client(c)
    const command = new TerminateInstancesCommand({ InstanceIds: [instanceId] })
    await ec2.send(command)

    return c.json({ success: true })
  } catch (error: any) {
    return c.json(
      { error: error.message || 'Failed to terminate instance' },
      500
    )
  }
})

// Enclave Routes
app.post('/aws/enclaves/build', authMiddleware, async (c) => {
  try {
    const { instanceId } = await c.req.json()

    // This would typically involve:
    // 1. Building the enclave image
    // 2. Deploying to the EC2 instance
    // 3. Starting the enclave
    // For now, we'll return a mock response

    const enclaveId = `enclave-${instanceId}-${Date.now()}`

    return c.json({
      enclaveId,
      status: 'building',
      message: 'Enclave build initiated'
    })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to build enclave' }, 500)
  }
})

// Wallet Operations Routes
app.get('/wallet/list', authMiddleware, async (c) => {
  try {
    // Mock data - in real implementation would query database
    const wallets = [
      {
        address: '0x1234567890123456789012345678901234567890',
        name: 'Main Wallet',
        balance: '1.234',
        status: 'active'
      }
    ]

    return c.json({ wallets })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch wallets' }, 500)
  }
})

app.post('/wallet/generate-keys', authMiddleware, async (c) => {
  try {
    // const { walletName, instanceId } = await c.req.json()

    // This would typically involve:
    // 1. Generate keys in Nitro Enclave using SSS
    // 2. Store encrypted shares in database
    // 3. Return user share

    const mockWalletAddress = `0x${Math.random().toString(16).substring(2, 42)}`
    const mockUserShare = `share_${Math.random().toString(36).substring(2, 15)}`

    return c.json({
      walletAddress: mockWalletAddress,
      userShare: mockUserShare
    })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to generate wallet' }, 500)
  }
})

app.post('/wallet/send-transaction', authMiddleware, async (c) => {
  try {
    // const { from, to, value, userShare } = await c.req.json()

    // This would typically involve:
    // 1. Reconstruct key using SSS shares
    // 2. Sign transaction in enclave
    // 3. Broadcast transaction
    // 4. Store in database

    const mockTxHash = `0x${Math.random().toString(16).substring(2, 66)}`

    return c.json({
      txHash: mockTxHash,
      status: 'pending'
    })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to send transaction' }, 500)
  }
})

app.get('/wallet/:address/balance', authMiddleware, async (c) => {
  try {
    // const address = c.req.param('address')

    // This would query blockchain for actual balance
    const mockBalance = Math.random().toFixed(6)

    return c.json({ balance: mockBalance })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch balance' }, 500)
  }
})

// Policy Management Routes
app.get('/policies/list', authMiddleware, async (c) => {
  try {
    // Mock policies - would query database in real implementation
    const policies = [
      {
        id: '1',
        type: 'spending_limit',
        limitAmount: '0.1',
        limitPeriod: 'day',
        expiresAt: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        isActive: true,
        createdAt: new Date().toISOString()
      }
    ]

    return c.json({ policies })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch policies' }, 500)
  }
})

app.post('/policies/create', authMiddleware, async (c) => {
  try {
    // const policyData = await c.req.json()

    // This would store policy in database and configure with Porto SDK
    const policyId = `policy_${Date.now()}`

    return c.json({
      policyId,
      message: 'Policy created successfully'
    })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to create policy' }, 500)
  }
})

app.put('/policies/update', authMiddleware, async (c) => {
  try {
    // const { policyId, isActive } = await c.req.json()

    // This would update policy in database
    return c.json({
      success: true,
      message: 'Policy updated successfully'
    })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update policy' }, 500)
  }
})

app.delete('/policies/:id', authMiddleware, async (c) => {
  try {
    // const policyId = c.req.param('id')

    // This would delete policy from database
    return c.json({
      success: true,
      message: 'Policy deleted successfully'
    })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to delete policy' }, 500)
  }
})

// Transaction History Routes
app.get('/transactions/history', authMiddleware, async (c) => {
  try {
    // Mock transaction history - would query database in real implementation
    const transactions = [
      {
        id: '1',
        txHash:
          '0x1234567890123456789012345678901234567890123456789012345678901234',
        walletAddress: '0x1234567890123456789012345678901234567890',
        toAddress: '0x0987654321098765432109876543210987654321',
        valueWei: '100000000000000000', // 0.1 ETH in wei
        gasUsed: 21_000,
        gasSponsored: true,
        status: 'confirmed',
        blockNumber: 12_345,
        createdAt: new Date().toISOString(),
        type: 'sent'
      }
    ]

    const gasStats = {
      totalSponsored: 5,
      totalSaved: '0.015',
      sponsoredCount: 5
    }

    return c.json({ transactions, gasStats })
  } catch (error: any) {
    return c.json(
      { error: error.message || 'Failed to fetch transaction history' },
      500
    )
  }
})

export default app satisfies ExportedHandler<Env>
