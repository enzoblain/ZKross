// Reading pool logs over a public RPC whose nodes are a block or two apart.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getLogsCaughtUp, publicClient } from './eth'

const beyond = () => new Error('Invalid parameters were provided to the RPC method. Details: block range beyond current head block: requested 11996314, head 11996313')

const original = publicClient.getLogs
afterEach(() => {
  publicClient.getLogs = original
})

describe('getLogsCaughtUp', () => {
  it('retries a range that is past a lagging node head until it catches up', async () => {
    const getLogs = vi.fn().mockRejectedValueOnce(beyond()).mockRejectedValueOnce(beyond()).mockResolvedValue(['log'])
    publicClient.getLogs = getLogs as never
    await expect(getLogsCaughtUp({ fromBlock: 1n, toBlock: 11996314n }, 0)).resolves.toEqual(['log'])
    expect(getLogs).toHaveBeenCalledTimes(3)
  })

  it('ends the range two blocks earlier when the node keeps lagging', async () => {
    const getLogs = vi.fn(async (args: { toBlock: bigint }) => {
      if (args.toBlock > 11996312n) throw beyond()
      return ['log']
    })
    publicClient.getLogs = getLogs as never
    await expect(getLogsCaughtUp({ fromBlock: 1n, toBlock: 11996314n }, 0)).resolves.toEqual(['log'])
    expect(getLogs.mock.calls.at(-1)?.[0]).toMatchObject({ toBlock: 11996312n })
  })

  it('does not retry other errors', async () => {
    const getLogs = vi.fn().mockRejectedValue(new Error('rate limited'))
    publicClient.getLogs = getLogs as never
    await expect(getLogsCaughtUp({ fromBlock: 1n, toBlock: 2n }, 0)).rejects.toThrow('rate limited')
    expect(getLogs).toHaveBeenCalledTimes(1)
  })
})
