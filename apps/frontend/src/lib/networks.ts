import { StrKey } from '@stellar/stellar-sdk'
import { isAddress } from 'viem'

export type NetworkId = 'stellar' | 'ethereum'

export type WalletConnection = {
  network: NetworkId
  address: string
  provider: string
  networkLabel: string
  isExpectedNetwork: boolean
  mode: 'injected'
}

export type ProgressState = 'idle' | 'active' | 'complete' | 'failed'

export type TransferProgressStep = {
  id: string
  label: string
  description: string
  status: ProgressState
}

export const networkMeta: Record<
  NetworkId,
  { name: string; shortName: string; token: string; wallet: string }
> = {
  stellar: {
    name: 'Stellar Testnet',
    shortName: 'Stellar',
    token: 'USDC',
    wallet: 'Freighter',
  },
  ethereum: {
    name: 'Ethereum Sepolia',
    shortName: 'Ethereum',
    token: 'USDC',
    wallet: 'MetaMask',
  },
}

export const otherNetwork = (network: NetworkId): NetworkId =>
  network === 'ethereum' ? 'stellar' : 'ethereum'

/** A valid public account address on `network`. */
export function validAddress(network: NetworkId, address: string) {
  const value = address.trim()
  return network === 'stellar' ? StrKey.isValidEd25519PublicKey(value) : isAddress(value)
}
