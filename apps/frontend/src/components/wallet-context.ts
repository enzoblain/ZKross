import { createContext, useContext } from 'react'

import type { NetworkId, WalletConnection } from '../lib/networks'

type Wallets = Partial<Record<NetworkId, WalletConnection>>

type WalletContextValue = {
  wallets: Wallets
  connecting: NetworkId | null
  errors: Partial<Record<NetworkId, string>>
  connectWallet: (network: NetworkId) => Promise<void>
  disconnectWallet: (network: NetworkId) => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

function useWallets() {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallets must be used inside WalletProvider')
  return context
}

export { WalletContext, useWallets }
export type { WalletContextValue, Wallets }
