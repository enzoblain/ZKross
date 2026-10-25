import { describe, expect, it } from 'vitest'

import { chainId, isDeployed, poolAddress, protocol, sepoliaConfig, stellarConfig } from './config'

describe('testnet configuration', () => {
  it('uses only Stellar Testnet and Ethereum Sepolia identifiers', () => {
    expect(stellarConfig.passphrase).toBe('Test SDF Network ; September 2015')
    expect(chainId('stellar')).toBe(33_353_711_811_639_397_682n)
    expect(chainId('ethereum')).toBe(11_155_111n)
    expect(sepoliaConfig.chainIdHex).toBe('0xaa36a7')
  })

  it('matches the protocol decimal conversion', () => {
    expect(protocol.decimals).toEqual({ stellar: 7, ethereum: 6 })
    expect(protocol.scale).toEqual({ stellar: 10n, ethereum: 1n })
    expect(protocol.assetId).toBe(1n)
  })

  it('derives deployment readiness from deployments.json', () => {
    expect(isDeployed('stellar')).toBe(true)
    expect(poolAddress('stellar')).toBe(stellarConfig.pool)
    expect(isDeployed('ethereum')).toBe(Boolean(sepoliaConfig.pool))
  })
})
