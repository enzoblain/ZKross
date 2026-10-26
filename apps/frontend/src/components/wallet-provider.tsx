import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import { lockNoteVault } from '../lib/vault-session'
import type { NetworkId } from '../lib/networks'
import { connectInjectedWallet } from '../lib/wallet-adapters'
import { WalletContext, type Wallets } from './wallet-context'

function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<Wallets>({})
  const [connecting, setConnecting] = useState<NetworkId | null>(null)
  const [errors, setErrors] = useState<Partial<Record<NetworkId, string>>>({})

  useEffect(() => {
    const provider = window.ethereum
    if (!provider?.on) return
    const invalidate = () => {
      lockNoteVault()
      setWallets(current => { const next = { ...current }; delete next.ethereum; return next })
    }
    provider.on('accountsChanged', invalidate)
    provider.on('chainChanged', invalidate)
    return () => { provider.removeListener?.('accountsChanged', invalidate); provider.removeListener?.('chainChanged', invalidate) }
  }, [wallets.ethereum?.address])

  const connectWallet = async (network: NetworkId) => {
    if (connecting) return
    setErrors((current) => ({ ...current, [network]: undefined }))
    setConnecting(network)

    try {
      const wallet = await connectInjectedWallet(network)
      lockNoteVault()
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
    lockNoteVault()
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
