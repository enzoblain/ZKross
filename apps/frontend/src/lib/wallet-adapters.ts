import * as freighter from '@stellar/freighter-api'

import { sepoliaConfig, stellarConfig } from './config'
import type { NetworkId, WalletConnection } from './networks'

const SEPOLIA_CHAIN_ID = sepoliaConfig.chainIdHex
const STELLAR_TESTNET_PASSPHRASE = stellarConfig.passphrase

type ProviderRequest = {
  method: string
  params?: unknown[]
}

type EthereumProvider = {
  on?: (event: 'accountsChanged' | 'chainChanged', listener: () => void) => void
  removeListener?: (event: 'accountsChanged' | 'chainChanged', listener: () => void) => void
  request<T = unknown>(request: ProviderRequest): Promise<T>
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

class WalletConnectionError extends Error {
  code: 'INSTALL_REQUIRED' | 'USER_REJECTED' | 'REQUEST_PENDING' | 'WRONG_NETWORK' | 'UNKNOWN'
  installUrl?: string

  constructor(
    code: WalletConnectionError['code'],
    message: string,
    installUrl?: string,
  ) {
    super(message)
    this.name = 'WalletConnectionError'
    this.code = code
    this.installUrl = installUrl
  }
}

const withTimeout = async <T>(promise: Promise<T>, milliseconds = 3500) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      window.setTimeout(
        () => reject(new WalletConnectionError('UNKNOWN', 'The wallet did not respond in time.')),
        milliseconds,
      ),
    ),
  ])

const providerErrorCode = (error: unknown) => {
  if (typeof error === 'object' && error && 'code' in error) {
    return Number((error as { code: unknown }).code)
  }
  return undefined
}

async function ensureSepolia(provider: EthereumProvider) {
  const currentChain = await provider.request<string>({ method: 'eth_chainId' })
  if (currentChain.toLowerCase() === SEPOLIA_CHAIN_ID) return

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    })
  } catch (error) {
    if (providerErrorCode(error) !== 4902) {
      throw new WalletConnectionError(
        'WRONG_NETWORK',
        'Switch MetaMask to Ethereum Sepolia to continue.',
      )
    }

    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: SEPOLIA_CHAIN_ID,
          chainName: 'Ethereum Sepolia',
          nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: [sepoliaConfig.rpcUrl],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        },
      ],
    })
  }
}

async function connectEthereum(): Promise<WalletConnection> {
  const provider = window.ethereum
  if (!provider) {
    const installUrl = 'https://metamask.io/download/'
    throw new WalletConnectionError(
      'INSTALL_REQUIRED',
      'MetaMask is unavailable in this browser. Install it or open Zkross in a browser where the extension is enabled.',
      installUrl,
    )
  }

  try {
    const accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' })
    const address = accounts[0]
    if (!address) {
      throw new WalletConnectionError('UNKNOWN', 'MetaMask did not return an account.')
    }

    await ensureSepolia(provider)

    return {
      network: 'ethereum',
      address,
      provider: 'MetaMask',
      networkLabel: 'Ethereum Sepolia',
      isExpectedNetwork: true,
      mode: 'injected',
    }
  } catch (error) {
    const code = providerErrorCode(error)
    if (error instanceof WalletConnectionError) throw error
    if (code === 4001) {
      throw new WalletConnectionError('USER_REJECTED', 'MetaMask connection was cancelled.')
    }
    if (code === -32002) {
      throw new WalletConnectionError(
        'REQUEST_PENDING',
        'A MetaMask request is already open. Complete it in the extension.',
      )
    }
    throw new WalletConnectionError('UNKNOWN', 'MetaMask could not be connected.')
  }
}

async function connectStellar(): Promise<WalletConnection> {
  const api = freighter
  const installUrl = 'https://www.freighter.app/'

  const connection = await withTimeout(api.isConnected())
  if (connection.error || !connection.isConnected) {
    throw new WalletConnectionError(
      'INSTALL_REQUIRED',
      'Freighter is not installed or cannot be reached from this browser.',
      installUrl,
    )
  }

  const access = await withTimeout(api.requestAccess(), 12000)
  if (access.error || !access.address) {
    throw new WalletConnectionError(
      'USER_REJECTED',
      access.error?.message ?? 'Freighter connection was cancelled.',
    )
  }

  const network = await withTimeout(api.getNetworkDetails())
  const isExpectedNetwork =
    network.network === 'TESTNET' ||
    network.networkPassphrase === STELLAR_TESTNET_PASSPHRASE

  if (!isExpectedNetwork) {
    throw new WalletConnectionError(
      'WRONG_NETWORK',
      'Switch Freighter to Stellar Testnet, then connect again.',
    )
  }

  return {
    network: 'stellar',
    address: access.address,
    provider: 'Freighter',
    networkLabel: 'Stellar Testnet',
    isExpectedNetwork,
    mode: 'injected',
  }
}

async function connectInjectedWallet(network: NetworkId) {
  return network === 'ethereum' ? connectEthereum() : connectStellar()
}

function truncateAddress(address: string) {
  if (address.length <= 13) return address
  return address.slice(0, 6) + '…' + address.slice(-5)
}

export { connectInjectedWallet, truncateAddress, WalletConnectionError }
