import type { Address } from 'viem'

import deployments from '../../../../deployments.json'
import type { NetworkId } from './networks'

// Testnet only: anything but Stellar testnet and Sepolia is refused.
const STELLAR_TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'
const SEPOLIA_CHAIN_ID = 11155111

if (deployments.stellarTestnet.networkPassphrase !== STELLAR_TESTNET_PASSPHRASE) {
  throw new Error('deployments.json: stellarTestnet is not Stellar testnet')
}
if (deployments.sepolia.chainId !== SEPOLIA_CHAIN_ID) {
  throw new Error('deployments.json: sepolia is not Sepolia')
}

type SepoliaPool = { pool: Address; token: Address; deployBlock: number }

// Filled by scripts/testnet/deploy-sepolia.sh; absent until the pool exists.
const sepoliaPool = (deployments.sepolia as { zkross?: SepoliaPool }).zkross

export const stellarConfig = {
  passphrase: STELLAR_TESTNET_PASSPHRASE,
  rpcUrl: deployments.stellarTestnet.rpcUrl,
  horizonUrl: 'https://horizon-testnet.stellar.org',
  chainId: BigInt(deployments.stellarTestnet.chainId),
  pool: deployments.stellarTestnet.zkross.pool,
  deployLedger: deployments.stellarTestnet.zkross.deployLedger,
  usdc: {
    code: 'USDC',
    issuer: deployments.stellarTestnet.usdc.issuer,
    sac: deployments.stellarTestnet.usdc.sac,
    decimals: deployments.stellarTestnet.usdc.decimals,
  },
}

export const sepoliaConfig = {
  chainId: BigInt(SEPOLIA_CHAIN_ID),
  chainIdHex: `0x${SEPOLIA_CHAIN_ID.toString(16)}`,
  // publicnode prunes old logs ("pruned history unavailable"), so the pool's
  // history from its deploy block is read from Tenderly's public gateway.
  rpcUrl:
    (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ??
    'https://sepolia.gateway.tenderly.co',
  pool: sepoliaPool?.pool,
  deployBlock: BigInt(sepoliaPool?.deployBlock ?? 0),
  usdc: {
    address: deployments.sepolia.usdc.address as Address,
    decimals: deployments.sepolia.usdc.decimals,
  },
}

/** SPEC.md B1, B2, B5, B6. */
export const protocol = {
  assetId: 1n,
  levels: 20,
  /** Note units per bridge-message unit (10^-6 USDC). */
  scale: { stellar: 10n, ethereum: 1n } as Record<NetworkId, bigint>,
  decimals: {
    stellar: stellarConfig.usdc.decimals,
    ethereum: sepoliaConfig.usdc.decimals,
  } as Record<NetworkId, number>,
  /** Deadline chosen by the frontend, in hours from now (the pool allows 2 to 48). */
  deadlineHours: 6n,
}

export const chainId = (network: NetworkId) =>
  network === 'stellar' ? stellarConfig.chainId : sepoliaConfig.chainId

export const poolAddress = (network: NetworkId) =>
  network === 'stellar' ? stellarConfig.pool : sepoliaConfig.pool

export const isDeployed = (network: NetworkId) => Boolean(poolAddress(network))

export const explorer = {
  tx: (network: NetworkId, hash: string) =>
    network === 'stellar'
      ? `https://stellar.expert/explorer/testnet/tx/${hash}`
      : `https://sepolia.etherscan.io/tx/${hash}`,
  address: (network: NetworkId, address: string) =>
    network === 'stellar'
      ? `https://stellar.expert/explorer/testnet/${address.startsWith('C') ? 'contract' : 'account'}/${address}`
      : `https://sepolia.etherscan.io/address/${address}`,
}
