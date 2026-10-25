export type NetworkId = 'stellar' | 'ethereum'
export type PrivacyMode = 'transparent' | 'private-intent'

export type WalletConnection = {
  network: NetworkId
  address: string
}

export type TransferDraft = {
  from: NetworkId
  to: NetworkId
  amount: number
  recipient: string
  privacyMode: PrivacyMode
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
  { name: string; shortName: string; token: string; mark: string }
> = {
  stellar: {
    name: 'Stellar',
    shortName: 'Stellar',
    token: 'USDC',
    mark: 'S',
  },
  ethereum: {
    name: 'Ethereum',
    shortName: 'Ethereum',
    token: 'USDC',
    mark: 'Ξ',
  },
}

const walletAddresses: Record<NetworkId, string> = {
  stellar: 'GB7A…D94K',
  ethereum: '0x71F3…89A2',
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds))

export const mockBridgeAdapter = {
  async connectWallet(network: NetworkId): Promise<WalletConnection> {
    await wait(650)
    return { network, address: walletAddresses[network] }
  },

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

  createProgress(from: NetworkId): TransferProgressStep[] {
    return [
      {
        id: 'intent',
        label: 'Intent prepared',
        description: 'Local transfer parameters created',
        status: 'idle',
      },
      {
        id: 'source',
        label: `${networkMeta[from].name} lock simulated`,
        description: 'No transaction is broadcast',
        status: 'idle',
      },
      {
        id: 'attestation',
        label: 'Attestation simulated',
        description: 'Mock relayer confirmation',
        status: 'idle',
      },
      {
        id: 'settlement',
        label: 'Destination release simulated',
        description: 'No assets are moved',
        status: 'idle',
      },
    ]
  },
}
