/** Public transaction journal reducer. Chain observers must authenticate receipts
 * and intent binding before emitting confirmations. No user secrets belong here.
 * A pending submission is persisted BEFORE signing/broadcast; an unknown outcome
 * must be reconciled, never retried as a fresh burn/deposit automatically.
 */
export type SettlementState = {
  id: string
  phase: 'created' | 'burn_pending' | 'source_confirmed' | 'attested' | 'mint_pending' | 'minted' | 'deposit_pending' | 'private'
  amount: string
  sourceHash?: string
  nonce?: string
  mintHash?: string
  depositHash?: string
  fee?: string
  netAmount?: string
  commitment?: string
  recoveryReason?: string
}
export type SettlementEvent =
  | { type: 'begin_burn' }
  | { type: 'burn_submitted'; hash: string }
  | { type: 'source_confirmed'; hash: string }
  | { type: 'attested'; nonce: string; fee: string }
  | { type: 'begin_mint' }
  | { type: 'mint_submitted'; hash: string }
  | { type: 'mint_confirmed'; hash: string; amount: string }
  | { type: 'begin_deposit'; commitment: string }
  | { type: 'deposit_submitted'; hash: string }
  | { type: 'deposit_confirmed'; hash: string; commitment: string; amount: string }
  | { type: 'interrupted'; reason: string }
const txHash = (value: string) => /^(?:0x)?[0-9a-fA-F]{64}$/.test(value)
const unsigned = (value: string) => /^(0|[1-9][0-9]*)$/.test(value)
export function settlementTransition(state: SettlementState, event: SettlementEvent): SettlementState {
  if (!unsigned(state.amount) || BigInt(state.amount) <= 0n) throw new Error('Invalid settlement amount.')
  const requirePhase = (...phases: SettlementState['phase'][]) => { if (!phases.includes(state.phase)) throw new Error(`Unsafe transition from ${state.phase}: ${event.type}. Reconcile the existing transaction.`) }
  const bindHash = (previous: string | undefined, next: string) => { if (!txHash(next) || (previous && previous !== next)) throw new Error('Transaction hash mismatch.') }
  const next = { ...state }
  switch (event.type) {
    case 'interrupted':
      return { ...state, recoveryReason: event.reason }
    case 'begin_burn': requirePhase('created'); next.phase = 'burn_pending'; break
    case 'burn_submitted': requirePhase('burn_pending'); bindHash(state.sourceHash,event.hash); next.sourceHash=event.hash; break
    case 'source_confirmed': requirePhase('burn_pending','source_confirmed'); if (!state.sourceHash) throw new Error('Missing submitted burn.'); bindHash(state.sourceHash,event.hash); next.phase='source_confirmed'; break
    case 'attested':
      requirePhase('source_confirmed','attested')
      if (!/^0x[0-9a-fA-F]{64}$/.test(event.nonce) || BigInt(event.nonce) === 0n || !unsigned(event.fee) || BigInt(event.fee) >= BigInt(state.amount)) throw new Error('Invalid attestation accounting.')
      if (state.nonce && (state.nonce !== event.nonce || state.fee !== event.fee)) throw new Error('Conflicting attestation.')
      next.nonce=event.nonce; next.fee=event.fee; next.netAmount=(BigInt(state.amount)-BigInt(event.fee)).toString(); next.phase='attested'; break
    case 'begin_mint': requirePhase('attested'); next.phase='mint_pending'; break
    case 'mint_submitted': requirePhase('mint_pending'); bindHash(state.mintHash,event.hash); next.mintHash=event.hash; break
    case 'mint_confirmed':
      requirePhase('mint_pending','minted')
      if (!state.mintHash || event.amount !== state.netAmount) throw new Error('Mint amount/hash not bound to settlement.')
      bindHash(state.mintHash,event.hash); next.phase='minted'; break
    case 'begin_deposit':
      requirePhase('minted')
      if (!/^0x[0-9a-fA-F]{64}$/.test(event.commitment) || BigInt(event.commitment) === 0n) throw new Error('Invalid commitment.')
      next.commitment=event.commitment; next.phase='deposit_pending'; break
    case 'deposit_submitted': requirePhase('deposit_pending'); bindHash(state.depositHash,event.hash); next.depositHash=event.hash; break
    case 'deposit_confirmed':
      requirePhase('deposit_pending','private')
      if (!state.depositHash || event.commitment !== state.commitment || event.amount !== state.netAmount) throw new Error('Deposit does not conserve confirmed mint.')
      bindHash(state.depositHash,event.hash); next.phase='private'; break
  }
  delete next.recoveryReason
  return next
}
