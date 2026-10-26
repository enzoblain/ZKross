import SpotlightCard from '../components/react-bits/SpotlightCard'
import { useState } from 'react'
import { Button } from '../components/ui/button'
import { useWallets } from '../components/wallet-context'
import { WalletConnectDialog } from '../components/wallet-connect-dialog'
import { selectedProtocolMode, selectProtocolMode, missingTestnetComponents, testnetExecutionBlocker, type ProtocolMode } from '../lib/cctp-config'
import { createCctpTransfer, runCctpTransfer, progressFor } from '../lib/cctp-flow'
import { transfers, type CctpTransfer } from '../lib/cctp-store'
import { parseUnits } from '../lib/amounts'
import { type NetworkId, otherNetwork, networkMeta } from '../lib/networks'

export function CctpBridgePage() {
  const { wallets } = useWallets()
  const [mode, setMode] = useState<ProtocolMode>(selectedProtocolMode)
  const [from, setFrom] = useState<NetworkId>('ethereum')
  const [amount, setAmount] = useState('1')
  const [transfer, setTransfer] = useState<CctpTransfer | undefined>(() => transfers().find(t => t.mode === mode))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wallet, setWallet] = useState<NetworkId | null>(null)
  const to = otherNetwork(from)
  async function execute(resume = false) {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const units = parseUnits(amount, 6)
      if (!units || units <= 0n) throw new Error('Enter a positive USDC amount with at most six decimals.')
      const next = resume && transfer ? transfer : createCctpTransfer({ mode, from, to, amount: units, sourceAddress: wallets[from]?.address ?? `demo:${from}` })
      setTransfer({ ...next })
      await runCctpTransfer(next, () => setTransfer({ ...next }))
      setTransfer({ ...next })
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  return <div className="mx-auto max-w-2xl space-y-6">
    <div><h1 className="text-4xl font-medium tracking-tight">Bridge USDC</h1><p className="mt-3 text-sm text-muted">Public CCTP settlement, followed by a private pool deposit when verified infrastructure is available.</p></div>
    <SpotlightCard className="space-y-5 border border-border" spotlightColor="rgba(100, 200, 190, 0.35)" style={{ backgroundColor: 'var(--color-surface)' }}>
      <label className="block text-sm">Execution mode<select disabled={busy} className="ml-3 rounded border border-border bg-background p-2" value={mode} onChange={e => { selectProtocolMode(e.target.value as ProtocolMode); setMode(e.target.value as ProtocolMode); setTransfer(undefined); setError('') }}><option value="simulation">Simulation — no network settlement</option><option value="testnet">Testnet — real signatures required</option></select></label>
      <p className="text-sm text-muted">{mode === 'simulation' ? 'All balances, commitments, batches and events below are simulated. No proof or blockchain transaction is created.' : testnetExecutionBlocker}</p>
      {mode === 'testnet' && <div role="status" className="text-sm text-warning"><p>Missing configuration:</p><ul className="list-disc pl-5">{missingTestnetComponents().map(label => <li key={label}>{label}</li>)}</ul><p className="mt-2">Configuration alone does not enable execution. No burn can be submitted from this page.</p></div>}
      <label className="block text-sm">Source<select disabled={busy} className="ml-3 rounded border border-border bg-background p-2" value={from} onChange={e => { setFrom(e.target.value as NetworkId); setTransfer(undefined) }}><option value="ethereum">Ethereum Sepolia</option><option value="stellar">Stellar Testnet</option></select></label>
      <p className="text-sm">Destination: {networkMeta[to].name}</p>
      <label className="block text-sm">USDC amount<input disabled={busy} className="ml-3 rounded border border-border bg-background p-2" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2">{([from, to] as NetworkId[]).map(n => <Button key={n} variant="secondary" onClick={() => setWallet(n)}>{wallets[n] ? `${networkMeta[n].shortName} connected` : `Connect ${networkMeta[n].wallet}`}</Button>)}</div>
      <Button disabled={busy || mode === 'testnet'} onClick={() => void execute()}>{busy ? 'Simulating…' : mode === 'simulation' ? 'Simulate transfer' : 'Testnet blocked'}</Button>
      {transfer && transfer.mode === mode && transfer.status !== 'private' && transfer.status !== 'withdrawn' && !busy && mode === 'simulation' && <Button variant="secondary" onClick={() => void execute(true)}>Resume simulation</Button>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </SpotlightCard>
    {transfer && transfer.mode === mode && <section aria-live="polite" className="rounded-3xl border border-border p-6"><h2 className="font-medium">{mode === 'simulation' ? 'Simulated' : 'Testnet'} activity</h2><ol className="mt-4 space-y-3">{progressFor(transfer.from, transfer.to, transfer).map(step => <li key={step.id}><p className="text-sm">{step.label} · {step.status}</p><p className="text-xs text-muted">{step.description}</p></li>)}</ol></section>}
    <p className="text-xs leading-5 text-muted">CCTP exposes settlement amounts, addresses and timing. Batching does not guarantee anonymity. The older pool contracts use a Global View Key and require redesign before user-granted disclosure can be claimed.</p>
    <WalletConnectDialog network={wallet} open={Boolean(wallet)} onOpenChange={open => !open && setWallet(null)} purpose="required" />
  </div>
}
