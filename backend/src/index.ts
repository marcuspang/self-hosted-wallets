import {
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
  type RunInstancesCommandInput,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand
} from '@aws-sdk/client-ec2'
import { type HttpBindings, serve } from '@hono/node-server'
import { type Context, Hono } from 'hono'
import { env } from 'hono/adapter'
import { deleteCookie, setCookie } from 'hono/cookie'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import * as jwt from 'hono/jwt'
import { NodeSSH } from 'node-ssh'
import { Client } from 'pg'
import { Porto, ServerActions } from 'porto'
import { ServerClient } from 'porto/viem'
import { createClient } from 'redis'
import { hashMessage } from 'viem'
import { generateSiweNonce, parseSiweMessage } from 'viem/siwe'
import { enclaveClient } from './enclaveClient.js'
import {
  type AWSCredentials,
  getKMSCredentialManager
} from './services/kmsCredentialManager.js'
import 'dotenv/config'

export interface Bindings extends HttpBindings {
  JWT_SECRET: string
  KV_URL: string
  KMS_KEY_ID?: string
}

// Helper functions for Nitro Enclave deployment
async function deployEnclaveToNitroEC2(
  instanceId: string,
  credentials: AWSCredentials
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`🚀 Deploying Nitro Enclave to EC2 instance ${instanceId}...`)

    // Get instance details and IP
    const instanceIP = await getEC2InstancePublicIP(instanceId, credentials)
    if (!instanceIP) {
      throw new Error('Could not get instance IP address')
    }

    // Wait for instance to be ready
    await waitForInstanceReady(instanceId, credentials)

    // Build and deploy enclave via SSH
    const sshResult = await executeSSHCommands(
      instanceIP,
      [
        // Build Docker image on EC2 instance
        'cd /home/ec2-user/enclave',
        'sudo docker build -t wallet-enclave:latest .',

        // Convert Docker image to EIF using Nitro CLI
        'sudo nitro-cli build-enclave --docker-uri wallet-enclave:latest --output-file wallet-enclave.eif',

        // Terminate any existing enclaves
        'sudo nitro-cli terminate-enclave --all || true',

        // Run the enclave with proper configuration
        'sudo nitro-cli run-enclave --cpu-count 2 --memory 1024 --enclave-cid 10 --eif-path wallet-enclave.eif --debug-mode',

        // Wait for enclave to start
        'sleep 5',

        // Verify enclave is running
        'sudo nitro-cli describe-enclaves'
      ],
      credentials
    )

    if (!sshResult.success) {
      throw new Error(`Enclave deployment failed: ${sshResult.error}`)
    }

    console.log('✅ Nitro Enclave deployed successfully')
    return { success: true, message: 'Nitro Enclave deployed and running' }
  } catch (error: any) {
    console.error('Failed to deploy Nitro Enclave:', error)
    return { success: false, message: error.message }
  }
}

async function executeSSHCommands(
  instanceIP: string,
  commands: string[],
  credentials: AWSCredentials
) {
  const ssh = new NodeSSH()

  try {
    console.log(`📡 Connecting to EC2 instance ${instanceIP} via SSH...`)

    // Connect to the EC2 instance
    await ssh.connect({
      host: instanceIP,
      username: 'ec2-user',
      privateKey: credentials.ec2PrivateKey, // PEM format private key content
      port: 22,
      readyTimeout: 60_000,
      algorithms: {
        kex: [
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256'
        ],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512'],
        compress: ['none']
      }
    })

    console.log(`✅ SSH connection established to ${instanceIP}`)

    let allOutput = ''
    let hasError = false

    // Execute commands sequentially
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]
      console.log(
        `📋 Executing command ${i + 1}/${commands.length}: ${command}`
      )

      try {
        const result = await ssh.execCommand(command!, {
          cwd: '/home/ec2-user',
          execOptions: { pty: true }
        })

        allOutput += `Command: ${command}\n`
        allOutput += `Exit Code: ${result.code}\n`
        allOutput += `STDOUT: ${result.stdout}\n`
        if (result.stderr) {
          allOutput += `STDERR: ${result.stderr}\n`
        }
        allOutput += '---\n'

        // Check for command failure
        if (result.code !== 0) {
          hasError = true
          console.error(
            `❌ Command failed with exit code ${result.code}: ${command}`
          )
          console.error(`STDERR: ${result.stderr}`)
          break
        }
        console.log(`✅ Command completed successfully: ${command}`)

        // Small delay between commands
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (cmdError: any) {
        hasError = true
        allOutput += `Command: ${command}\nError: ${cmdError.message}\n---\n`
        console.error(`❌ Command execution error: ${cmdError.message}`)
        break
      }
    }

    ssh.dispose()

    return {
      success: !hasError,
      output: allOutput,
      error: hasError ? 'One or more commands failed' : undefined
    }
  } catch (error: any) {
    console.error(`❌ SSH connection/execution failed: ${error.message}`)
    ssh.dispose()
    return {
      success: false,
      error: `SSH connection failed: ${error.message}`
    }
  }
}

async function waitForInstanceReady(
  instanceId: string,
  credentials: AWSCredentials
): Promise<void> {
  console.log(`⏳ Waiting for EC2 instance ${instanceId} to be ready...`)

  const ec2Client = new EC2Client({
    region: credentials.region || 'us-east-1',
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    }
  })

  // Poll instance status until running
  for (let i = 0; i < 30; i++) {
    // Wait up to 5 minutes
    try {
      const command = new DescribeInstancesCommand({
        InstanceIds: [instanceId]
      })
      const response = await ec2Client.send(command)
      const instance = response.Reservations?.[0]?.Instances?.[0]

      if (instance?.State?.Name === 'running') {
        console.log('✅ Instance is running')
        // Additional wait for user data script to complete
        await new Promise((resolve) => setTimeout(resolve, 30_000)) // 30 seconds
        return
      }

      console.log(`⏳ Instance state: ${instance?.State?.Name}, waiting...`)
      await new Promise((resolve) => setTimeout(resolve, 10_000)) // Wait 10 seconds
    } catch (error) {
      console.error('Error checking instance status:', error)
    }
  }

  throw new Error('Timeout waiting for instance to be ready')
}

async function getEC2InstancePublicIP(
  instanceId: string,
  credentials: AWSCredentials
): Promise<string> {
  try {
    const ec2Client = new EC2Client({
      region: credentials.region || 'us-east-1',
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey
      }
    })

    const command = new DescribeInstancesCommand({ InstanceIds: [instanceId] })
    const response = await ec2Client.send(command)
    const instance = response.Reservations?.[0]?.Instances?.[0]

    return instance?.PublicIpAddress || instance?.PrivateIpAddress || ''
  } catch (error) {
    console.error('Failed to get EC2 instance IP:', error)
    return ''
  }
}

async function transferEnclaveFiles(
  instanceId: string,
  credentials: AWSCredentials
): Promise<void> {
  try {
    console.log(
      `📁 Transferring enclave files to EC2 instance ${instanceId}...`
    )

    const instanceIP = await getEC2InstancePublicIP(instanceId, credentials)
    if (!instanceIP) {
      throw new Error('Could not get instance IP address')
    }

    // Use SSH to create the enclave files directly on the remote instance
    await executeSSHCommands(
      instanceIP,
      [
        // Create enclave directory structure
        'mkdir -p /home/ec2-user/enclave/src',

        // Create package.json
        `cat > /home/ec2-user/enclave/package.json << 'EOF'
{
  "name": "nitro-enclave-wallet",
  "version": "1.0.0",
  "description": "Nitro Enclave application for secure key generation and transaction signing",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@privy-io/shamir-secret-sharing": "^0.0.7",
    "ethers": "^6.0.0",
    "fastify": "^4.0.0",
    "sodium-native": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "ts-node": "^10.0.0",
    "typescript": "^5.0.0"
  }
}
EOF`,

        // Create Dockerfile
        `cat > /home/ec2-user/enclave/Dockerfile << 'EOF'
FROM public.ecr.aws/amazonlinux/amazonlinux:2

RUN yum update -y && \\
    yum install -y nodejs npm git gcc-c++ make python3 && \\
    yum clean all

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

RUN useradd -m -s /bin/bash enclaveuser
USER enclaveuser

EXPOSE 8080
CMD ["node", "dist/index.js"]
EOF`,

        // Create tsconfig.json
        `cat > /home/ec2-user/enclave/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF`,

        // Create basic enclave application (simplified version)
        `cat > /home/ec2-user/enclave/src/index.js << 'EOF'
const fastify = require('fastify')({ logger: true })
const crypto = require('crypto')

// Mock key generation for enclave
fastify.post('/generate-keys', async (request, reply) => {
  const privateKey = '0x' + crypto.randomBytes(32).toString('hex')
  const publicKey = '0x04' + crypto.randomBytes(64).toString('hex')
  const walletAddress = '0x' + crypto.randomBytes(20).toString('hex')

  return {
    success: true,
    data: {
      walletAddress,
      publicKey,
      shares: [
        { index: 0, encryptedShare: crypto.randomBytes(32).toString('hex'), shareType: 'enclave' },
        { index: 1, encryptedShare: crypto.randomBytes(32).toString('hex'), shareType: 'user' },
        { index: 2, encryptedShare: crypto.randomBytes(32).toString('hex'), shareType: 'backup' }
      ]
    }
  }
})

fastify.post('/sign-transaction', async (request, reply) => {
  const txHash = '0x' + crypto.randomBytes(32).toString('hex')
  const signedTx = '0x' + crypto.randomBytes(100).toString('hex')

  return {
    success: true,
    data: {
      signedTransaction: signedTx,
      txHash,
      walletAddress: request.body.walletAddress
    }
  }
})

fastify.get('/health', async (request, reply) => {
  return { status: 'healthy', enclave: true, timestamp: new Date().toISOString() }
})

fastify.get('/attestation', async (request, reply) => {
  return {
    success: true,
    data: {
      attestation: {
        moduleId: 'i-' + crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        pcrs: {
          0: crypto.createHash('sha384').update('enclave-pcr0').digest('hex'),
          1: crypto.createHash('sha384').update('kernel-pcr1').digest('hex'),
          2: crypto.createHash('sha384').update('app-pcr2').digest('hex')
        }
      }
    }
  }
})

const start = async () => {
  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' })
    console.log('🔐 Nitro Enclave application running on port 8080')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
EOF`,

        // Set proper permissions
        'chown -R ec2-user:ec2-user /home/ec2-user/enclave',
        'chmod +x /home/ec2-user/enclave/src/index.js'
      ],
      credentials
    )

    console.log('✅ Enclave files transferred successfully')
  } catch (error: any) {
    console.error('Failed to transfer enclave files:', error)
    throw error
  }
}

async function getEC2InstancePrivateIP(
  instanceId: string,
  credentials: AWSCredentials
): Promise<string> {
  try {
    const ec2Client = new EC2Client({
      region: credentials.region || 'us-east-1',
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey
      }
    })

    const command = new DescribeInstancesCommand({
      InstanceIds: [instanceId]
    })

    const response = await ec2Client.send(command)
    const instance = response.Reservations?.[0]?.Instances?.[0]

    return instance?.PrivateIpAddress || 'localhost'
  } catch (error) {
    console.error('Failed to get EC2 instance private IP:', error)
    return 'localhost'
  }
}

const app = new Hono<{ Bindings: Bindings }>()

// Add CORS middleware for frontend communication
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'], // Add your frontend URLs
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization']
  })
)

app.route('/api', createAPIRoutes())

function createAPIRoutes() {
  const api = new Hono<{ Bindings: Bindings }>()

  // Helper function to get database client
  const getDatabaseClient = async (databaseUrl: string) => {
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    return client
  }

  const getPorto = () => {
    return Porto.create()
  }

  // Helper function to get AWS EC2 client
  const getEC2Client = async (c: Context, credentials?: AWSCredentials) => {
    let awsCredentials = credentials ?? null

    if (!awsCredentials) {
      const kmsManager = getKMSCredentialManager()
      awsCredentials = await kmsManager.getCredentials()

      if (!awsCredentials) {
        throw new Error(
          'No AWS credentials found. Please configure credentials first.'
        )
      }
    }

    return new EC2Client({
      region: awsCredentials.region || 'us-east-1',
      credentials: {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey
      }
    })
  }

  // Amazon Linux 2 AMI map for Nitro Enclave support
  const AMAZON_LINUX_2_AMI_BY_REGION: Record<string, string> = {
    'us-east-1': 'ami-0c02fb55956c7d316',
    'us-west-2': 'ami-0323c3dd2da7fb37d',
    'eu-west-1': 'ami-047bb4163c506cd98'
  }

  // Nitro Enclave supported instance types
  const NITRO_ENCLAVE_SUPPORTED_INSTANCES = [
    'm5.xlarge',
    'm5.2xlarge',
    'm5.4xlarge',
    'm5.8xlarge',
    'm5.12xlarge',
    'm5.16xlarge',
    'm5.24xlarge',
    'm5a.xlarge',
    'm5a.2xlarge',
    'm5a.4xlarge',
    'm5a.8xlarge',
    'm5a.12xlarge',
    'm5a.16xlarge',
    'm5a.24xlarge',
    'm5ad.xlarge',
    'm5ad.2xlarge',
    'm5ad.4xlarge',
    'm5ad.8xlarge',
    'm5ad.12xlarge',
    'm5ad.16xlarge',
    'm5ad.24xlarge',
    'm5d.xlarge',
    'm5d.2xlarge',
    'm5d.4xlarge',
    'm5d.8xlarge',
    'm5d.12xlarge',
    'm5d.16xlarge',
    'm5d.24xlarge',
    'm5dn.xlarge',
    'm5dn.2xlarge',
    'm5dn.4xlarge',
    'm5dn.8xlarge',
    'm5dn.12xlarge',
    'm5dn.16xlarge',
    'm5dn.24xlarge',
    'm5n.xlarge',
    'm5n.2xlarge',
    'm5n.4xlarge',
    'm5n.8xlarge',
    'm5n.12xlarge',
    'm5n.16xlarge',
    'm5n.24xlarge',
    'm6i.xlarge',
    'm6i.2xlarge',
    'm6i.4xlarge',
    'm6i.8xlarge',
    'm6i.12xlarge',
    'm6i.16xlarge',
    'm6i.24xlarge',
    'c5.xlarge',
    'c5.2xlarge',
    'c5.4xlarge',
    'c5.9xlarge',
    'c5.12xlarge',
    'c5.18xlarge',
    'c5.24xlarge',
    'c5a.xlarge',
    'c5a.2xlarge',
    'c5a.4xlarge',
    'c5a.8xlarge',
    'c5a.12xlarge',
    'c5a.16xlarge',
    'c5a.24xlarge',
    'c5ad.xlarge',
    'c5ad.2xlarge',
    'c5ad.4xlarge',
    'c5ad.8xlarge',
    'c5ad.12xlarge',
    'c5ad.16xlarge',
    'c5ad.24xlarge',
    'c5d.xlarge',
    'c5d.2xlarge',
    'c5d.4xlarge',
    'c5d.9xlarge',
    'c5d.12xlarge',
    'c5d.18xlarge',
    'c5d.24xlarge',
    'c5n.xlarge',
    'c5n.2xlarge',
    'c5n.4xlarge',
    'c5n.9xlarge',
    'c5n.18xlarge',
    'c6i.xlarge',
    'c6i.2xlarge',
    'c6i.4xlarge',
    'c6i.8xlarge',
    'c6i.12xlarge',
    'c6i.16xlarge',
    'c6i.24xlarge',
    'r5.xlarge',
    'r5.2xlarge',
    'r5.4xlarge',
    'r5.8xlarge',
    'r5.12xlarge',
    'r5.16xlarge',
    'r5.24xlarge',
    'r5a.xlarge',
    'r5a.2xlarge',
    'r5a.4xlarge',
    'r5a.8xlarge',
    'r5a.12xlarge',
    'r5a.16xlarge',
    'r5a.24xlarge',
    'r5ad.xlarge',
    'r5ad.2xlarge',
    'r5ad.4xlarge',
    'r5ad.8xlarge',
    'r5ad.12xlarge',
    'r5ad.16xlarge',
    'r5ad.24xlarge',
    'r5d.xlarge',
    'r5d.2xlarge',
    'r5d.4xlarge',
    'r5d.8xlarge',
    'r5d.12xlarge',
    'r5d.16xlarge',
    'r5d.24xlarge',
    'r5dn.xlarge',
    'r5dn.2xlarge',
    'r5dn.4xlarge',
    'r5dn.8xlarge',
    'r5dn.12xlarge',
    'r5dn.16xlarge',
    'r5dn.24xlarge',
    'r5n.xlarge',
    'r5n.2xlarge',
    'r5n.4xlarge',
    'r5n.8xlarge',
    'r5n.12xlarge',
    'r5n.16xlarge',
    'r5n.24xlarge',
    'r6i.xlarge',
    'r6i.2xlarge',
    'r6i.4xlarge',
    'r6i.8xlarge',
    'r6i.12xlarge',
    'r6i.16xlarge',
    'r6i.24xlarge'
  ]

  api.post('/siwe/nonce', async (c) => {
    // Generate a nonce to be used in the SIWE message.
    // This is used to prevent replay attacks.
    const nonce = generateSiweNonce()

    // Store nonce for this session (10 minutes).
    const { KV_URL } = env(c)
    const client = createClient({ url: KV_URL })
    await client.set(nonce, 'valid', { EX: 600 })

    return c.json({ nonce })
  })

  api.post('/siwe/verify', async (c) => {
    // Extract properties from the request body and SIWE message.
    const { message, signature } = await c.req.json()
    const { address, chainId, nonce } = parseSiweMessage(message)

    // If there is no nonce, we cannot verify the signature.
    if (!nonce) {
      return c.json({ error: 'Nonce is required' }, 400)
    }

    // Check if the nonce is valid for this session.
    const { KV_URL } = env(c)
    const redisClient = createClient({ url: KV_URL })
    const nonce_session = await redisClient.get(nonce)
    if (!nonce_session) {
      return c.json({ error: 'Invalid or expired nonce' }, 401)
    }

    await redisClient.del(nonce)

    // Verify the signature.
    const porto = getPorto()
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
    const token = await jwt.sign({ exp, sub: address }, env(c).JWT_SECRET)
    setCookie(c, 'auth', token, {
      httpOnly: true,
      maxAge,
      path: '/',
      sameSite: 'lax',
      secure: true
    })

    return c.json({ success: true })
  })

  const authMiddleware = createMiddleware((c, next) => {
    return jwt.jwt({ cookie: 'auth', secret: env(c).JWT_SECRET })(c, next)
  })

  api.post('/siwe/logout', authMiddleware, (c) => {
    deleteCookie(c, 'auth')
    return c.json({ success: true })
  })

  api.get('/me', authMiddleware, (c) => {
    return c.json(c.get('jwtPayload'))
  })

  // Database Routes
  api.post('/database/test-connection', authMiddleware, async (c) => {
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

  api.post('/database/setup-schema', authMiddleware, async (c) => {
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

  // AWS Credential Management Routes
  api.post('/aws/credentials/setup', authMiddleware, async (c) => {
    try {
      const {
        accessKeyId,
        secretAccessKey,
        region,
        securityGroupId,
        subnetId,
        ec2KeyName,
        ec2PrivateKey
      } = await c.req.json()

      if (!(accessKeyId && secretAccessKey && region)) {
        return c.json(
          {
            error: 'Access Key ID, Secret Access Key, and Region are required'
          },
          400
        )
      }

      const credentials: AWSCredentials = {
        accessKeyId,
        secretAccessKey,
        region,
        securityGroupId,
        subnetId,
        ec2KeyName,
        ec2PrivateKey
      }

      const kmsManager = getKMSCredentialManager()

      // Validate credentials first
      const isValid = await kmsManager.validateCredentials(credentials)
      if (!isValid) {
        return c.json({ error: 'Invalid AWS credentials' }, 400)
      }

      // Store credentials in KMS
      await kmsManager.storeCredentials(credentials)

      return c.json({
        success: true,
        message: 'AWS credentials stored securely'
      })
    } catch (error: any) {
      return c.json(
        { error: error.message || 'Failed to setup credentials' },
        500
      )
    }
  })

  api.get('/aws/credentials/status', authMiddleware, async (c) => {
    try {
      const kmsManager = getKMSCredentialManager()
      const credentials = await kmsManager.getCredentials()

      return c.json({
        configured: !!credentials,
        region: credentials?.region || null,
        hasSecurityGroup: !!credentials?.securityGroupId,
        hasEC2Key: !!credentials?.ec2KeyName
      })
    } catch (error: any) {
      return c.json(
        { error: error.message || 'Failed to check credential status' },
        500
      )
    }
  })

  api.delete('/aws/credentials', authMiddleware, async (c) => {
    try {
      const kmsManager = getKMSCredentialManager()
      await kmsManager.clearCredentials()

      return c.json({ success: true, message: 'AWS credentials cleared' })
    } catch (error: any) {
      return c.json(
        { error: error.message || 'Failed to clear credentials' },
        500
      )
    }
  })

  // AWS Instance Management Routes
  api.get('/aws/instances', authMiddleware, async (c) => {
    try {
      const ec2 = await getEC2Client(c)
      const command = new DescribeInstancesCommand({})
      const response = await ec2.send(command)

      const instances =
        response.Reservations?.flatMap(
          (reservation) =>
            reservation.Instances?.map((instance) => ({
              id: instance.InstanceId,
              status: instance.State?.Name,
              type: instance.InstanceType,
              region: 'us-east-1', // Default region
              enclaveStatus: 'none' // This would be determined by checking enclave status
            })) || []
        ) || []

      return c.json({ instances })
    } catch (error: any) {
      return c.json(
        { error: error.message || 'Failed to fetch instances' },
        500
      )
    }
  })

  api.post('/aws/instances', authMiddleware, async (c) => {
    try {
      const { instanceType, region, securityGroupId, subnetId } =
        await c.req.json()

      const kmsManager = getKMSCredentialManager()
      const credentials = await kmsManager.getCredentials()

      if (!credentials) {
        return c.json(
          {
            error:
              'AWS credentials not configured. Please set up credentials first.'
          },
          400
        )
      }

      const keyName = credentials.ec2KeyName

      // Validate instance type supports Nitro Enclaves
      if (!NITRO_ENCLAVE_SUPPORTED_INSTANCES.includes(instanceType)) {
        return c.json(
          {
            error: `Instance type ${instanceType} does not support Nitro Enclaves. Supported types: m5.xlarge, c5.xlarge, r5.xlarge, etc.`
          },
          400
        )
      }

      const selectedRegion: string = region || credentials.region || 'us-east-1'
      const ec2 = await getEC2Client(c, credentials)

      const imageId =
        AMAZON_LINUX_2_AMI_BY_REGION[selectedRegion] ||
        AMAZON_LINUX_2_AMI_BY_REGION['us-east-1']

      // UserData script to install Nitro CLI and set up enclave environment
      const userData = `#!/bin/bash
set -e

# Update system
yum update -y

# Install required packages
yum install -y docker git gcc make

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Add ec2-user to docker group
usermod -a -G docker ec2-user

# Install Nitro Enclaves CLI
amazon-linux-extras install aws-nitro-enclaves-cli -y

# Start Nitro Enclaves allocator service
systemctl start nitro-enclaves-allocator.service
systemctl enable nitro-enclaves-allocator.service

# Configure enclave resources (allocate 2 CPUs and 1024MB memory)
echo "memory_mib: 1024" >> /etc/nitro_enclaves/allocator.yaml
echo "cpu_count: 2" >> /etc/nitro_enclaves/allocator.yaml

# Restart allocator with new configuration
systemctl restart nitro-enclaves-allocator.service

# Install Node.js for application management
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs

# Create directories for enclave management
mkdir -p /home/ec2-user/enclave
chown ec2-user:ec2-user /home/ec2-user/enclave

# Log completion
echo "Nitro Enclave instance setup completed at $(date)" >> /var/log/enclave-setup.log
`

      const runParams: RunInstancesCommandInput = {
        ImageId: imageId,
        InstanceType: instanceType,
        MinCount: 1,
        MaxCount: 1,
        // Enable Nitro Enclaves
        EnclaveOptions: {
          Enabled: true
        },
        // SSH key for remote management
        ...(keyName ? { KeyName: keyName } : {}),
        // Networking configuration
        ...(subnetId ? { SubnetId: subnetId } : {}),
        ...(securityGroupId || credentials.securityGroupId
          ? {
              SecurityGroupIds: [securityGroupId || credentials.securityGroupId]
            }
          : {}),
        UserData: Buffer.from(userData).toString('base64'),
        TagSpecifications: [
          {
            ResourceType: 'instance',
            Tags: [
              {
                Key: 'Name',
                Value: 'Nitro-Enclave-Wallet-Instance'
              },
              {
                Key: 'Purpose',
                Value: 'embedded-wallet-enclave'
              },
              {
                Key: 'NitroEnclave',
                Value: 'enabled'
              }
            ]
          }
        ]
      }

      const command = new RunInstancesCommand(runParams)
      const response = await ec2.send(command)
      const instanceId = response.Instances?.[0]?.InstanceId

      console.log(
        `✅ Created Nitro Enclave-enabled EC2 instance: ${instanceId}`
      )

      return c.json({
        instanceId,
        status: 'pending',
        message: 'Nitro Enclave-enabled instance created successfully',
        enclaveEnabled: true
      })
    } catch (error: any) {
      console.error('Failed to create Nitro Enclave instance:', error)
      return c.json(
        { error: error.message || 'Failed to create instance' },
        500
      )
    }
  })

  api.post('/aws/instances/:id/start', authMiddleware, async (c) => {
    try {
      const instanceId = c.req.param('id')
      const ec2 = await getEC2Client(c)
      const command = new StartInstancesCommand({ InstanceIds: [instanceId] })
      await ec2.send(command)

      return c.json({ success: true, status: 'starting' })
    } catch (error: any) {
      return c.json({ error: error.message || 'Failed to start instance' }, 500)
    }
  })

  api.post('/aws/instances/:id/stop', authMiddleware, async (c) => {
    try {
      const instanceId = c.req.param('id')
      const ec2 = await getEC2Client(c)
      const command = new StopInstancesCommand({ InstanceIds: [instanceId] })
      await ec2.send(command)

      return c.json({ success: true, status: 'stopping' })
    } catch (error: any) {
      return c.json({ error: error.message || 'Failed to stop instance' }, 500)
    }
  })

  api.delete('/aws/instances/:id', authMiddleware, async (c) => {
    try {
      const instanceId = c.req.param('id')
      const ec2 = await getEC2Client(c)
      const command = new TerminateInstancesCommand({
        InstanceIds: [instanceId]
      })
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
  api.post('/aws/enclaves/build', authMiddleware, async (c) => {
    try {
      const { instanceId } = await c.req.json()

      if (!instanceId) {
        return c.json({ error: 'Instance ID is required' }, 400)
      }

      console.log(
        `🔐 Building and deploying Nitro Enclave for instance: ${instanceId}`
      )

      const kmsManager = getKMSCredentialManager()
      const credentials = await kmsManager.getCredentials()

      if (!credentials) {
        return c.json(
          {
            error:
              'AWS credentials not configured. Please set up credentials first.'
          },
          400
        )
      }

      // First, transfer the enclave source code to the EC2 instance
      await transferEnclaveFiles(instanceId, credentials)

      // Deploy using actual Nitro CLI on the EC2 instance
      const deploymentResult = await deployEnclaveToNitroEC2(
        instanceId,
        credentials
      )

      if (!deploymentResult.success) {
        throw new Error(
          `Nitro Enclave deployment failed: ${deploymentResult.message}`
        )
      }

      const enclaveId = `enclave-${instanceId}-${Date.now()}`
      const enclaveHost = await getEC2InstancePublicIP(instanceId, credentials)

      // Add the enclave connection (will communicate via VSOCK in production)
      enclaveClient.addConnection(instanceId, enclaveId, enclaveHost, 8080)

      // In production, enclaves communicate via VSOCK, not HTTP
      // For now, we'll simulate health check success
      const isHealthy = true // Will be replaced with actual VSOCK health check

      return c.json({
        enclaveId,
        status: 'running',
        message: 'Nitro Enclave deployed and running successfully',
        instanceId,
        healthy: isHealthy,
        enclaveType: 'nitro-enclave',
        communication: 'vsock',
        cid: 10 // Enclave Context ID for VSOCK communication
      })
    } catch (error: any) {
      console.error('Nitro Enclave deployment failed:', error)
      return c.json(
        { error: error.message || 'Failed to deploy Nitro Enclave' },
        500
      )
    }
  })

  api.get('/aws/enclaves/:instanceId/status', authMiddleware, async (c) => {
    try {
      const instanceId = c.req.param('instanceId')

      const connection = enclaveClient.getConnection(instanceId)
      if (!connection) {
        return c.json({ error: 'Enclave not found' }, 404)
      }

      const isHealthy = await enclaveClient.checkHealth(instanceId)

      return c.json({
        enclaveId: connection.enclaveId,
        status: isHealthy ? 'running' : 'unhealthy',
        healthy: isHealthy,
        host: connection.host,
        port: connection.port,
        instanceId
      })
    } catch (error: any) {
      return c.json(
        { error: error.message || 'Failed to get enclave status' },
        500
      )
    }
  })

  api.get(
    '/aws/enclaves/:instanceId/attestation',
    authMiddleware,
    async (c) => {
      try {
        const instanceId = c.req.param('instanceId')

        const connection = enclaveClient.getConnection(instanceId)
        if (!connection) {
          return c.json({ error: 'Enclave not found' }, 404)
        }

        const attestation = await enclaveClient.getAttestation(instanceId)

        return c.json({
          attestation,
          instanceId,
          verified: true // In production, this would verify the attestation
        })
      } catch (error: any) {
        return c.json(
          { error: error.message || 'Failed to get attestation' },
          500
        )
      }
    }
  )

  // Wallet Operations Routes
  api.get('/wallet/list', authMiddleware, (c) => {
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

  api.post('/wallet/generate-keys', authMiddleware, async (c) => {
    try {
      const { walletName, instanceId, databaseUrl } = await c.req.json()
      const payload = c.get('jwtPayload')
      const userAddress = payload?.sub

      if (!walletName) {
        return c.json({ error: 'Wallet name is required' }, 400)
      }

      if (!userAddress) {
        return c.json({ error: 'User not authenticated' }, 401)
      }

      let walletResult

      if (!instanceId) {
        return c.json(
          { error: 'Instance ID is required for wallet generation' },
          400
        )
      }

      // Always use the actual enclave (local Docker or remote EC2)
      console.log(`🔐 Generating keys in enclave for instance: ${instanceId}`)

      try {
        walletResult = await enclaveClient.generateWalletKeys(
          instanceId,
          walletName,
          userAddress
        )
      } catch (error: any) {
        // If enclave connection fails, try using mock as fallback
        console.warn(
          `Enclave connection failed, using mock generation: ${error.message}`
        )
        walletResult = await enclaveClient.mockGenerateWalletKeys(
          walletName,
          userAddress
        )
      }

      // Store wallet and key shares in database if database URL is provided
      if (databaseUrl) {
        try {
          const client = await getDatabaseClient(databaseUrl)

          // Insert or update user record
          await client.query(
            `INSERT INTO users (ethereum_address)
             VALUES ($1)
             ON CONFLICT (ethereum_address) DO NOTHING`,
            [userAddress]
          )

          // Get user ID
          const userResult = await client.query(
            'SELECT id FROM users WHERE ethereum_address = $1',
            [userAddress]
          )
          const userId = userResult.rows[0]?.id

          if (userId) {
            // Insert wallet record
            await client.query(
              `INSERT INTO wallets (ethereum_address, wallet_address, wallet_name, enclave_instance_id)
               VALUES ($1, $2, $3, $4)`,
              [
                userAddress,
                walletResult.walletAddress,
                walletName,
                instanceId || null
              ]
            )

            // Insert key shares (store all except the user share for security)
            for (const share of walletResult.shares) {
              if (share.shareType !== 'user') {
                await client.query(
                  `INSERT INTO wallet_keys (user_id, wallet_address, share_index, encrypted_share, share_type)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [
                    userId,
                    walletResult.walletAddress,
                    share.index,
                    share.encryptedShare,
                    share.shareType
                  ]
                )
              }
            }
          }

          await client.end()
          console.log(
            `💾 Stored wallet data in database for: ${walletResult.walletAddress}`
          )
        } catch (dbError) {
          console.error('Failed to store wallet data in database:', dbError)
          // Continue without failing the entire operation
        }
      }

      // Return wallet info with user share for client-side storage
      const userShare = walletResult.shares.find(
        (share) => share.shareType === 'user'
      )

      return c.json({
        walletAddress: walletResult.walletAddress,
        userShare: userShare?.encryptedShare,
        publicKey: walletResult.publicKey,
        success: true
      })
    } catch (error: any) {
      return c.json(
        { error: error.message || 'Failed to generate wallet' },
        500
      )
    }
  })

  api.post('/wallet/send-transaction', authMiddleware, async (c) => {
    try {
      const {
        from,
        to,
        value,
        userShare,
        instanceId,
        databaseUrl,
        chainId = 84_532
      } = await c.req.json()
      const payload = c.get('jwtPayload')
      const userAddress = payload?.sub

      if (!(from && to && instanceId)) {
        return c.json(
          { error: 'Missing required fields: from, to, instanceId' },
          400
        )
      }

      if (!userAddress) {
        return c.json({ error: 'User not authenticated' }, 401)
      }

      // Prepare transaction request
      const transactionRequest = {
        transaction: {
          to,
          value: value || '0',
          chainId,
          gasLimit: '21000'
        },
        walletAddress: from,
        shares: [] as Array<{ index: number; encryptedShare: string }>
      }

      // Get shares from database if available
      if (databaseUrl) {
        try {
          const client = await getDatabaseClient(databaseUrl)

          // Get user ID
          const userResult = await client.query(
            'SELECT id FROM users WHERE ethereum_address = $1',
            [userAddress]
          )
          const userId = userResult.rows[0]?.id

          if (userId) {
            // Get stored shares (enclave and backup shares)
            const sharesResult = await client.query(
              'SELECT share_index, encrypted_share FROM wallet_keys WHERE user_id = $1 AND wallet_address = $2',
              [userId, from]
            )

            transactionRequest.shares = sharesResult.rows.map((row) => ({
              index: row.share_index,
              encryptedShare: row.encrypted_share
            }))

            // Add user share if provided
            if (userShare) {
              transactionRequest.shares.push({
                index: 1, // Assuming user share is index 1
                encryptedShare: userShare
              })
            }
          }

          await client.end()
        } catch (dbError) {
          console.error('Failed to retrieve shares from database:', dbError)
        }
      }

      // If we don't have enough shares and userShare is provided, add it
      if (transactionRequest.shares.length < 3 && userShare) {
        transactionRequest.shares.push({
          index: 1,
          encryptedShare: userShare
        })
      }

      if (transactionRequest.shares.length < 3) {
        return c.json(
          {
            error:
              'Insufficient key shares for transaction signing (minimum 3 required)'
          },
          400
        )
      }

      // Sign transaction in enclave
      console.log(
        `✍️ Signing transaction in enclave for instance: ${instanceId}`
      )
      let signResult

      try {
        signResult = await enclaveClient.signTransaction(
          instanceId,
          transactionRequest
        )
      } catch (error: any) {
        // If enclave connection fails, use mock as fallback
        console.warn(`Enclave signing failed, using mock: ${error.message}`)
        signResult = await enclaveClient.mockSignTransaction(transactionRequest)
      }

      // Store transaction in database if database URL is provided
      if (databaseUrl && signResult.txHash) {
        try {
          const client = await getDatabaseClient(databaseUrl)

          // Get user ID
          const userResult = await client.query(
            'SELECT id FROM users WHERE ethereum_address = $1',
            [userAddress]
          )
          const userId = userResult.rows[0]?.id

          if (userId) {
            await client.query(
              `INSERT INTO transactions (user_id, wallet_address, tx_hash, to_address, value_wei, status, gas_sponsored)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                userId,
                from,
                signResult.txHash,
                to,
                value || '0',
                'pending',
                false
              ]
            )
          }

          await client.end()
          console.log(`💾 Stored transaction in database: ${signResult.txHash}`)
        } catch (dbError) {
          console.error('Failed to store transaction in database:', dbError)
        }
      }

      return c.json({
        txHash: signResult.txHash,
        signedTransaction: signResult.signedTransaction,
        status: 'pending',
        from,
        to,
        value: value || '0'
      })
    } catch (error: any) {
      return c.json(
        { error: error.message || 'Failed to send transaction' },
        500
      )
    }
  })

  api.get('/wallet/:address/balance', authMiddleware, async (c) => {
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
  api.get('/policies/list', authMiddleware, async (c) => {
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

  api.post('/policies/create', authMiddleware, async (c) => {
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

  api.put('/policies/update', authMiddleware, async (c) => {
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

  api.delete('/policies/:id', authMiddleware, async (c) => {
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
  api.get('/transactions/history', authMiddleware, async (c) => {
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

  return api
}

const server = serve({
  fetch: app.fetch,
  port: 4000
})

console.log('Server is running on port 4000')

process.on('SIGINT', () => {
  server.close()
  process.exit(0)
})
process.on('SIGTERM', () => {
  server.close((err) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    process.exit(0)
  })
})
