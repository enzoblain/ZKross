export type NetworkId = 'stellar' | 'ethereum'
export type PrivacyMode = 'transparent' | 'private-intent'

export type WalletConnection = {
  network: NetworkId
  address: string
  provider: string
  networkLabel: string
  isExpectedNetwork: boolean
  mode: 'injected'
}

export type MockQuote = {
  amountOut: number
  networkFee: number
  protocolFee: number
  estimatedSeconds: number
}

export type ProgressState = 'idle' | 'active' | 'complete'

export type TransferProgressStep = {
  id: string
  label: string
  description: string
  status: ProgressState
}

export const networkMeta: Record<
  NetworkId,
  { name: string; shortName: string; token: string; mark: string; wallet: string }
> = {
  stellar: {
    name: 'Stellar Testnet',
    shortName: 'Stellar',
    token: 'USDC',
    mark: 'S',
    wallet: 'Freighter',
  },
  ethereum: {
    name: 'Ethereum Sepolia',
    shortName: 'Ethereum',
    token: 'USDC',
    mark: 'Ξ',
    wallet: 'MetaMask',
  },
}

export const mockBridgeAdapter = {
  getQuote(amount: number): MockQuote {
    const safeAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0
    const protocolFee = safeAmount * 0.0005
    const networkFee = safeAmount > 0 ? (safeAmount < 100 ? 0.08 : 0.12) : 0

    return {
      amountOut: Math.max(safeAmount - protocolFee - networkFee, 0),
      networkFee,
      protocolFee,
      estimatedSeconds: 74,
    }
  },

  createProgress(): TransferProgressStep[] {
    return [
      {
        id: 'intent',
        label: 'Preparing transaction',
        description: 'Local intent; no wallet approval',
        status: 'idle',
      },
      {
        id: 'proof',
        label: 'Generating privacy proof',
        description: 'No ZK circuit is connected',
        status: 'idle',
      },
      {
        id: 'settlement',
        label: 'Verifying and completing',
        description: 'No verification or asset movement',
        status: 'idle',
      },
    ]
  },
}
