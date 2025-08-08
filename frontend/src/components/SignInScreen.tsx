import { Hooks } from 'porto/wagmi'
import { useConnectors } from 'wagmi'
import { getApiUrl } from '../lib/api'
import { Button } from './ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from './ui/card'

export function SignInScreen() {
  const connect = Hooks.useConnect()
  const [connector] = useConnectors()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-center text-2xl">
            Self-Hosted Embedded Wallet
          </CardTitle>
          <CardDescription className="text-center">
            Sign in with Ethereum to access your embedded wallet dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            disabled={connect.isPending}
            onClick={() =>
              connect.mutate({
                connector,
                signInWithEthereum: {
                  authUrl: getApiUrl('/api/siwe')
                }
              })
            }
            size="lg"
          >
            {connect.isPending ? 'Connecting...' : 'Sign in with Ethereum'}
          </Button>
          {connect.error && (
            <div className="text-center text-destructive text-sm">
              {connect.error.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
