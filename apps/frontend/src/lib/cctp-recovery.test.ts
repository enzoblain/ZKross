import { describe, expect, it } from 'vitest'
import { settlementTransition as apply, type SettlementState, type SettlementEvent } from './cctp-recovery'
const hash = `0x${'11'.repeat(32)}`
const nonce = `0x${'22'.repeat(32)}`
const commitment = `0x${'33'.repeat(32)}`
const start: SettlementState = { id:'test',phase:'created',amount:'1000' }
const events: SettlementEvent[] = [{type:'begin_burn'},{type:'burn_submitted',hash},{type:'source_confirmed',hash},{type:'attested',nonce,fee:'10'},{type:'begin_mint'},{type:'mint_submitted',hash},{type:'mint_confirmed',hash,amount:'990'},{type:'begin_deposit',commitment},{type:'deposit_submitted',hash},{type:'deposit_confirmed',hash,amount:'990',commitment}]
const through = (count: number) => events.slice(0,count).reduce(apply,start)
describe('settlement recovery accounting', () => {
  it('conserves net minted value through a confirmed private deposit', () => {
    const state = through(events.length)
    expect(state.phase).toBe('private'); expect(state.netAmount).toBe('990'); expect(state.fee).toBe('10')
    expect(apply(state,events.at(-1)!)).toEqual(state)
  })
  it('survives serialized journal recovery at every boundary', () => {
    let state = start
    for (const event of events) state=apply(JSON.parse(JSON.stringify(state)),event)
    expect(state).toEqual(through(events.length))
  })
  it.each([1,2,3,4,5,6,7,8,9,10])('never reburns after boundary %s', count => {
    const state = apply(through(count),{type:'interrupted',reason:'offline'})
    expect(() => apply(state,{type:'begin_burn'})).toThrow()
  })
  it('retains confirmed mint and pending deposit after interruption', () => {
    const state=apply(through(9),{type:'interrupted',reason:'submission outcome unknown'})
    expect(state.phase).toBe('deposit_pending'); expect(state.mintHash).toBe(hash)
    expect(() => apply(state,{type:'begin_deposit',commitment})).toThrow()
    expect(apply(state,events.at(-1)!).phase).toBe('private')
  })
  it('rejects a deposit credit greater than the net minted amount', () => {
    expect(() => apply(through(9),{type:'deposit_confirmed',hash,commitment,amount:'1000'})).toThrow('conserve')
  })
  it('rejects conflicting burn receipts', () => {
    expect(() => apply(through(2),{type:'source_confirmed',hash:nonce})).toThrow('mismatch')
  })
  it('rejects conflicting nonce attestations', () => {
    expect(() => apply(through(4),{type:'attested',nonce:commitment,fee:'10'})).toThrow('Conflicting')
  })
})
