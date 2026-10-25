import type { NetworkId } from './networks'

export type ProtocolMode = 'simulation' | 'testnet'

type RequiredComponent = {
  id: string
  label: string
  value?: string
}

const env = import.meta.env

export const cctp = {
  version: 'V2',
  domains: {
    ethereum: 0,
    stellar: 27,
  } satisfies Record<NetworkId, number>,
  components: [
    {
      id: 'sepolia-private-pool',
      label: 'Ethereum private pool',
      value: env.VITE_ETHEREUM_PRIVATE_POOL as string | undefined,
    },
    {
      id: 'stellar-spp-usdc-pool',
      label: 'Stellar SPP USDC pool',
      value: env.VITE_STELLAR_SPP_USDC_POOL as string | undefined,
    },
    {
      id: 'sepolia-token-messenger',
      label: 'CCTP TokenMessengerV2 on Sepolia',
      value: env.VITE_CCTP_SEPOLIA_TOKEN_MESSENGER as string | undefined,
    },
    {
      id: 'stellar-forwarder',
      label: 'CCTP Forwarder on Stellar testnet',
      value: env.VITE_CCTP_STELLAR_FORWARDER as string | undefined,
    },
    {
      id: 'privacy-adapter',
      label: 'CCTP to private-pool adapter',
      value: env.VITE_PRIVACY_ADAPTER as string | undefined,
    },
    {
      id: 'relayer',
      label: 'Batcher and relayer API',
      value: env.VITE_RELAYER_URL as string | undefined,
    },
  ] satisfies RequiredComponent[],
}

export const missingTestnetComponents = () =>
  cctp.components.filter((component) => !component.value).map((component) => component.label)

export const isCctpTestnetReady = () => missingTestnetComponents().length === 0

export const defaultProtocolMode: ProtocolMode =
  env.VITE_PROTOCOL_MODE === 'testnet' && isCctpTestnetReady() ? 'testnet' : 'simulation'

