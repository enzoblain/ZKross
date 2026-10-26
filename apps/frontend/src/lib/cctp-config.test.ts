import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
it('preserves explicitly requested testnet mode even when components are missing', async () => {
  vi.stubEnv('VITE_PROTOCOL_MODE', 'testnet'); vi.resetModules()
  const config = await import('./cctp-config')
  expect(config.defaultProtocolMode).toBe('testnet')
  expect(config.isCctpTestnetReady()).toBe(false)
})
it('does not mistake configured strings for verified infrastructure', async () => {
  for (const key of ['VITE_ETHEREUM_PRIVATE_POOL', 'VITE_STELLAR_SPP_USDC_POOL', 'VITE_CCTP_SEPOLIA_TOKEN_MESSENGER', 'VITE_CCTP_STELLAR_FORWARDER', 'VITE_PRIVACY_ADAPTER', 'VITE_RELAYER_URL']) vi.stubEnv(key, 'unverified')
  vi.resetModules()
  const config = await import('./cctp-config')
  expect(config.missingTestnetComponents()).toHaveLength(0)
  expect(config.isCctpTestnetReady()).toBe(false)
})

it('retains the user-selected testnet mode across page remounts', async () => {
  const values = new Map<string, string>()
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) } })
  const config = await import('./cctp-config')
  config.selectProtocolMode('testnet')
  expect(config.selectedProtocolMode()).toBe('testnet')
  vi.unstubAllGlobals()
})
