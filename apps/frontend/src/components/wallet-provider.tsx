import {
  useState,
  type ReactNode,
} from 'react'

import type { NetworkId } from '../lib/networks'
import { connectInjectedWallet } from '../lib/wallet-adapters'
import { WalletContext, type Wallets } from './wallet-context'

function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<Wallets>({})
  const [connecting, setConnecting] = useState<NetworkId | null>(null)
  const [errors, setErrors] = useState<Partial<Record<NetworkId, string>>>({})

  const connectWallet = async (network: NetworkId) => {
    if (connecting) return
    setErrors((current) => ({ ...current, [network]: undefined }))
    setConnecting(network)

    try {
      const wallet = await connectInjectedWallet(network)
      setWallets((current) => ({ ...current, [network]: wallet }))
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [network]:
          error instanceof Error ? error.message : 'The wallet could not be connected.',
      }))
    } finally {
      setConnecting(null)
    }
  }

  const disconnectWallet = (network: NetworkId) => {
    setWallets((current) => {
      const next = { ...current }
      delete next[network]
      return next
    })
    setErrors((current) => ({ ...current, [network]: undefined }))
  }

  return (
    <WalletContext.Provider
      value={{ wallets, connecting, errors, connectWallet, disconnectWallet }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export { WalletProvider }
