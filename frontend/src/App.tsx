import { useAccount } from 'wagmi'
import { Dashboard } from './components/Dashboard'
import { SignInScreen } from './components/SignInScreen'

export function App() {
  const { isConnected } = useAccount()
  
  return (
    <>
      {isConnected ? <Dashboard /> : <SignInScreen />}
    </>
  )
}