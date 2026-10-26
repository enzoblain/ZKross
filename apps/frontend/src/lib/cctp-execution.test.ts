import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCctpTransfer, runCctpTransfer } from './cctp-flow'
import * as store from './cctp-store'
const input = { mode: 'simulation' as const, from: 'ethereum' as const, to: 'stellar' as const, amount: 1_000_000n, sourceAddress: 'demo:ethereum' }
beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) }, setTimeout })
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('CCTP execution separation and recovery', () => {
  it('completes a simulation with exactly one valueless note and no tx hashes', async () => {
    const transfer = createCctpTransfer(input)
    const run = runCctpTransfer(transfer, vi.fn())
    await vi.runAllTimersAsync(); await run
    expect(transfer.status).toBe('private')
    expect(transfer.events).toHaveLength(7)
    expect(transfer.events.every(e => e.kind === 'simulation' && !e.txHash)).toBe(true)
    expect(store.privateBalance('stellar')).toBe(input.amount)
    await runCctpTransfer(transfer, vi.fn())
    expect(store.notes()).toHaveLength(1)
    expect(store.transfer(transfer.id)?.events).toHaveLength(7)
  })
  it('rejects concurrent execution and allows recovery afterward', async () => {
    const transfer = createCctpTransfer(input)
    const run = runCctpTransfer(transfer, vi.fn())
    await expect(runCctpTransfer(transfer, vi.fn())).rejects.toThrow('already running')
    await vi.runAllTimersAsync(); await run
    expect(store.notes()).toHaveLength(1)
  })
  it('never changes a testnet transfer into simulation', async () => {
    const transfer = createCctpTransfer({ ...input, mode: 'testnet' })
    await expect(runCctpTransfer(transfer, vi.fn())).rejects.toThrow('blocked')
    expect(store.transfer(transfer.id)?.mode).toBe('testnet')
    expect(transfer.events).toHaveLength(0)
    expect(store.notes()).toHaveLength(0)
  })
  it('rejects same-chain operations', () => expect(() => createCctpTransfer({ ...input, to: 'ethereum' })).toThrow())
  it('refuses real notes in plaintext demo storage', () => {
    expect(() => store.putNote({ id: 'real', mode: 'testnet', network: 'stellar', amount: '1', commitment: 'real', transferId: 't', createdAt: 1 })).toThrow('encrypted storage')
  })
  it('prevents duplicate simulated withdrawals and reexecution of spent transfers', async () => {
    const transfer = createCctpTransfer(input)
    const run = runCctpTransfer(transfer, vi.fn()); await vi.runAllTimersAsync(); await run
    store.markNoteWithdrawn(transfer.noteId!, 'demo:recipient')
    expect(store.privateBalance('stellar')).toBe(0n)
    expect(() => store.markNoteWithdrawn(transfer.noteId!, 'demo:recipient')).toThrow('already')
    await expect(runCctpTransfer(store.transfer(transfer.id)!, vi.fn())).rejects.toThrow('already')
  })
})
