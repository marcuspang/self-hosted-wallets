# Embedded Wallet Frontend

Modern React frontend for the self-hosted embedded wallet application, built with Vite, TypeScript, and Tailwind CSS.

## Features

- **Modern UI**: Built with shadcn/ui components and Tailwind CSS
- **Authentication**: SIWE (Sign-in with Ethereum) integration using Porto SDK
- **Dashboard**: Comprehensive wallet management interface
- **Real-time State**: React Query for server state management
- **URL State**: nuqs for URL-based navigation state
- **Responsive Design**: Mobile-first responsive design

## Tech Stack

- **Frontend Framework**: React 19 + TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 4
- **UI Components**: shadcn/ui
- **State Management**: @tanstack/react-query
- **URL State**: nuqs
- **Web3**: wagmi + viem
- **Authentication**: Porto SDK

## Development

### Prerequisites

- Node.js 18+
- pnpm

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Copy environment variables:
```bash
cp .env.example .env.local
```

3. Configure your environment variables in `.env.local`:
- `VITE_API_BASE_URL`: Backend API URL (default: http://localhost:8787)

### Development Server

```bash
pnpm dev
```

The frontend will be available at `http://localhost:5173`

### Building for Production

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

## Project Structure

```
src/
├── components/
│   ├── dashboard/          # Dashboard-specific components
│   │   ├── AWSInstanceManagement.tsx
│   │   ├── DatabaseSetup.tsx
│   │   ├── PolicyConfiguration.tsx
│   │   ├── TransactionHistory.tsx
│   │   └── WalletOperations.tsx
│   ├── ui/                 # shadcn/ui components
│   ├── Dashboard.tsx       # Main dashboard container
│   └── SignInScreen.tsx    # Authentication screen
├── lib/
│   ├── api.ts             # API utilities
│   └── utils.ts           # General utilities
├── hooks/                 # Custom React hooks
├── types/                 # TypeScript type definitions
└── main.tsx              # Application entry point
```

## Key Components

### Dashboard Sections

1. **Overview**: Wallet summary and key metrics
2. **Database Setup**: PostgreSQL connection and schema setup
3. **AWS Management**: EC2 instances and Nitro Enclaves
4. **Wallet Operations**: Generate wallets with SSS, send transactions
5. **Policy Configuration**: Transaction policies and spending limits
6. **Transaction History**: Full transaction history with gas sponsorship tracking

### API Integration

The frontend communicates with the backend API using:
- Configurable base URL via environment variables
- React Query for caching and state management
- Automatic request/response handling with error boundaries

## Configuration

### Environment Variables

- `VITE_API_BASE_URL`: Backend API base URL
  - Development: `http://localhost:8787`
  - Production: Your deployed backend URL

### CORS Requirements

Ensure your backend API allows requests from your frontend domain. The backend should include your frontend URL in its CORS configuration.

## Deployment

This is a standard Vite React application that can be deployed to any static hosting service:

- **Vercel**: Connect your repository for automatic deployments
- **Netlify**: Drag and drop the `dist` folder after building
- **Cloudflare Pages**: Connect your repository for automatic builds
- **AWS S3 + CloudFront**: Upload the `dist` folder to S3

Make sure to set the `VITE_API_BASE_URL` environment variable to your production backend URL.