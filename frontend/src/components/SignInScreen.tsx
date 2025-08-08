import { Hooks } from 'porto/wagmi'
import { useConnectors } from 'wagmi'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

export function SignInScreen() {
  const connect = Hooks.useConnect()
  const [connector] = useConnectors()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Self-Hosted Embedded Wallet</CardTitle>
          <CardDescription className="text-center">
            Sign in with Ethereum to access your embedded wallet dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() =>
              connect.mutate({
                connector,
                signInWithEthereum: {
                  authUrl: '/api/siwe'
                }
              })
            }
            className="w-full"
            size="lg"
            disabled={connect.isPending}
          >
            {connect.isPending ? 'Connecting...' : 'Sign in with Ethereum'}
          </Button>
          {connect.error && (
            <div className="text-sm text-destructive text-center">
              {connect.error.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}