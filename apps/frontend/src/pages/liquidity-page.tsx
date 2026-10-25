import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  ExternalLink,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { NetworkMark, NetworkRouteMark } from '../components/network-logo'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { WalletConnectDialog } from '../components/wallet-connect-dialog'
import { useWallets } from '../components/wallet-context'
import { formatNote, parseUnits } from '../lib/amounts'
import { explorer, isDeployed, poolAddress, protocol } from '../lib/config'
import { networkMeta, type NetworkId } from '../lib/networks'
import { pools } from '../lib/pools'
import { cn } from '../lib/utils'
import { truncateAddress } from '../lib/wallet-adapters'

// The contracts do not implement public LP shares, earnings, APY, or LP
// withdrawals. Keep this switch for the frontend team to restore that UI only
// after the economics and accounting are implemented and reviewed on-chain.
const SHOW_LP_ECONOMICS = false

type PoolState = {
  balance: bigint | null
  liquidityAdded: bigint | null
  admin: string | null
  error: string
}

type PoolStates = Record<NetworkId, PoolState>

const emptyState = (): PoolStates => ({
  ethereum: { balance: null, liquidityAdded: null, admin: null, error: '' },
  stellar: { balance: null, liquidityAdded: null, admin: null, error: '' },
})

function sameAddress(network: NetworkId, first: string, second: string) {
  return network === 'ethereum' ? first.toLowerCase() === second.toLowerCase() : first === second
}

function LegacyLpEconomics() {
  if (!SHOW_LP_ECONOMICS) return null
  return (
    <section className="rounded-3xl border border-border bg-surface p-6">
      LP share, earnings, APY, and withdrawal UI is intentionally hidden until contracts implement it.
    </section>
  )
}

function LiquidityPage() {
  const { wallets, connecting } = useWallets()
  const [selected, setSelected] = useState<NetworkId>('stellar')
  const [states, setStates] = useState<PoolStates>(emptyState)
  const [refresh, setRefresh] = useState(0)
  const [amount, setAmount] = useState('')
  const [walletDialogNetwork, setWalletDialogNetwork] = useState<NetworkId | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [approvalHash, setApprovalHash] = useState('')
  const [transactionHash, setTransactionHash] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const entries = await Promise.all(
        (['ethereum', 'stellar'] as NetworkId[]).map(async (network) => {
          if (!isDeployed(network)) {
            return [network, { balance: null, liquidityAdded: null, admin: null, error: 'Pool not deployed' }] as const
          }
          try {
            const [balance, liquidityAdded, admin] = await Promise.all([
              pools[network].poolUsdcBalance(),
              pools[network].liquidityAdded(),
              pools[network].admin(),
            ])
            return [network, { balance, liquidityAdded, admin, error: '' }] as const
          } catch (error) {
            return [network, {
              balance: null,
              liquidityAdded: null,
              admin: null,
              error: error instanceof Error ? error.message : String(error),
            }] as const
          }
        }),
      )
      if (!cancelled) setStates(Object.fromEntries(entries) as PoolStates)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const wallet = wallets[selected]
  const state = states[selected]
  const parsedAmount = useMemo(() => parseUnits(amount, protocol.decimals[selected]), [amount, selected])
  const isAdmin = Boolean(wallet && state.admin && sameAddress(selected, wallet.address, state.admin))
  const canSubmit = Boolean(isAdmin && parsedAmount && parsedAmount > 0n && isDeployed(selected) && !submitting)

  const addLiquidity = async () => {
    if (!wallet || !parsedAmount || !canSubmit) return
    setSubmitting(true)
    setActionError('')
    setApprovalHash('')
    setTransactionHash('')
    try {
      const sent = await pools[selected].addLiquidity(wallet.address, parsedAmount, setApprovalHash)
      setTransactionHash(sent.hash)
      setReviewOpen(false)
      setAmount('')
      setRefresh((value) => value + 1)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-enter">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.58fr] lg:items-end">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent"><NetworkRouteMark />Protocol reserves</p>
          <h1 className="mt-4 text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">Liquidity that backs private claims.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted">Each pool holds public USDC that backs notes created by incoming bridge claims. The protocol administrator seeds these unowned reserves; there are no public LP positions or promised returns.</p>
        </div>
        <div className="flex items-start gap-3 border-l border-warning/30 pl-5 text-[11px] leading-5 text-muted">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <p><strong className="text-foreground">Operational liquidity.</strong> These balances are not yield products. If a pool is short, withdrawals pause rather than minting unsupported value.</p>
        </div>
      </div>

      <section className="mt-10 grid gap-3 sm:grid-cols-2" aria-label="Live pool balances">
        {(['ethereum', 'stellar'] as NetworkId[]).map((network) => {
          const item = states[network]
          const deployed = isDeployed(network)
          const isSelected = selected === network
          return (
            <button
              key={network}
              type="button"
              aria-pressed={isSelected}
              onClick={() => { setSelected(network); setAmount(''); setActionError(''); setApprovalHash(''); setTransactionHash('') }}
              className={cn('focus-ring rounded-3xl border p-5 text-left transition-colors sm:p-6', isSelected ? 'border-accent/40 bg-accent/[0.055]' : 'border-border bg-surface hover:border-border-strong')}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3"><NetworkMark network={network} className="size-10 rounded-[14px]" /><div><p className="text-xs font-semibold">{networkMeta[network].shortName} pool</p><p className="mt-1 text-[9px] text-subtle">USDC · {deployed ? 'live testnet read' : 'awaiting deployment'}</p></div></div>
                <span className={cn('rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em]', deployed ? 'border-success/20 bg-success/[0.05] text-success' : 'border-warning/20 bg-warning/[0.05] text-warning')}>{deployed ? 'Live' : 'Pending'}</span>
              </div>
              <div className="mt-7 grid grid-cols-2 divide-x divide-border">
                <div><p className="text-[9px] text-subtle">Contract balance</p><p className="mt-1 font-mono text-sm">{item.balance === null ? '—' : formatNote(network, item.balance)} USDC</p></div>
                <div className="pl-5"><p className="text-[9px] text-subtle">Admin added · cumulative</p><p className="mt-1 font-mono text-sm">{item.liquidityAdded === null ? '—' : formatNote(network, item.liquidityAdded)} USDC</p></div>
              </div>
              {item.error && item.error !== 'Pool not deployed' && <p className="mt-4 truncate text-[10px] text-danger">{item.error}</p>}
            </button>
          )
        })}
      </section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.22fr)_minmax(300px,0.78fr)]">
        <section className="overflow-hidden rounded-[2rem] border border-border bg-surface" aria-labelledby="reserve-title">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
            <div><h2 id="reserve-title" className="text-base font-semibold tracking-[-0.02em]">Add {networkMeta[selected].shortName} reserve</h2><p className="mt-1 text-xs text-subtle">Administrator-only contract action</p></div>
            <button type="button" onClick={() => setRefresh((value) => value + 1)} className="focus-ring grid size-9 place-items-center rounded-xl border border-border text-muted hover:text-foreground" aria-label="Refresh pool data" title="Refresh pool data"><RefreshCw aria-hidden="true" className="size-4" /></button>
          </div>

          <div className="space-y-6 p-5 sm:p-7">
            <div>
              <div className="flex items-center justify-between gap-4"><label htmlFor="reserve-amount" className="text-[10px] font-medium text-subtle">Amount to add</label><span className="rounded-full bg-surface-raised px-3 py-1 text-[10px] font-semibold">USDC</span></div>
              <input id="reserve-amount" inputMode="decimal" value={amount} disabled={submitting} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} className="mt-3 w-full bg-transparent text-4xl font-medium tracking-[-0.06em] outline-none placeholder:text-subtle disabled:opacity-60 sm:text-5xl" placeholder="0.00" />
              {amount && parsedAmount === null && <p className="mt-3 text-[10px] text-danger">Use at most {protocol.decimals[selected]} decimal places on {networkMeta[selected].shortName}.</p>}
            </div>

            <button type="button" onClick={() => setWalletDialogNetwork(selected)} className="focus-ring flex min-h-18 w-full items-center gap-3 rounded-2xl border border-border bg-background/45 px-3.5 text-left hover:border-border-strong">
              <NetworkMark network={selected} />
              <span className="min-w-0 flex-1"><span className="block text-[9px] text-subtle">Configured admin wallet</span><span className="mt-1 block truncate text-xs font-medium">{wallet ? truncateAddress(wallet.address) : connecting === selected ? 'Waiting for wallet…' : `Connect ${networkMeta[selected].wallet}`}</span></span>
              {connecting === selected ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-accent" /> : wallet ? <CheckCircle2 aria-hidden="true" className={cn('size-4', isAdmin ? 'text-success' : 'text-warning')} /> : <WalletCards aria-hidden="true" className="size-4 text-subtle" />}
            </button>

            {wallet && state.admin && !isAdmin && <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.05] p-4 text-[11px] leading-5 text-muted"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" /><p>This wallet is not the pool administrator. It can inspect liquidity but cannot call <span className="font-mono text-foreground">addLiquidity</span>.</p></div>}
            {!isDeployed(selected) && <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.05] p-4 text-[11px] leading-5 text-muted"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" /><p>The {networkMeta[selected].shortName} pool is not recorded in `deployments.json`; actions are disabled.</p></div>}
            {actionError && <div role="alert" className="rounded-2xl border border-danger/25 bg-danger/[0.055] p-4 text-[11px] leading-5 text-danger">{actionError}</div>}

            <Button variant="accent" size="lg" className="w-full" disabled={Boolean(wallet) && !canSubmit} onClick={() => wallet ? canSubmit && setReviewOpen(true) : setWalletDialogNetwork(selected)}>
              {submitting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ArrowDownToLine aria-hidden="true" />}
              {!wallet ? `Connect ${networkMeta[selected].wallet}` : !isDeployed(selected) ? 'Pool not deployed' : !isAdmin ? 'Admin wallet required' : !parsedAmount || parsedAmount <= 0n ? 'Enter an amount' : 'Review liquidity addition'}
            </Button>
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="rounded-3xl border border-border bg-surface p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">Live contract state</p>
            <dl className="mt-6 space-y-4 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-subtle">Pool</dt><dd className="max-w-[62%] break-all text-right font-mono">{poolAddress(selected) ?? 'Not deployed'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">USDC balance</dt><dd className="font-mono">{state.balance === null ? '—' : formatNote(selected, state.balance)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Liquidity added</dt><dd className="font-mono">{state.liquidityAdded === null ? '—' : formatNote(selected, state.liquidityAdded)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Admin</dt><dd className="max-w-[62%] break-all text-right font-mono">{state.admin ?? '—'}</dd></div>
            </dl>
          </section>

          {(approvalHash || transactionHash) && <section className="rounded-3xl border border-success/20 bg-success/[0.04] p-5"><p className="flex items-center gap-2 text-xs font-medium text-success"><CheckCircle2 aria-hidden="true" className="size-4" />Testnet action confirmed</p><div className="mt-4 space-y-2">{approvalHash && <a href={explorer.tx(selected, approvalHash)} target="_blank" rel="noreferrer" className="focus-ring flex items-center justify-between rounded-xl border border-border px-3 py-2 text-[10px] text-accent">USDC approval<ExternalLink aria-hidden="true" className="size-3" /></a>}{transactionHash && <a href={explorer.tx(selected, transactionHash)} target="_blank" rel="noreferrer" className="focus-ring flex items-center justify-between rounded-xl border border-border px-3 py-2 text-[10px] text-accent">Liquidity transaction<ExternalLink aria-hidden="true" className="size-3" /></a>}</div></section>}

          <section className="rounded-3xl border border-border bg-background/35 p-5 text-[11px] leading-5 text-muted"><div className="flex items-start gap-3"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" /><p>Pool balance includes deposits plus operational liquidity. The cumulative event total tracks only explicit administrator additions and is not an available-withdrawal promise.</p></div></section>
        </aside>
      </div>

      <LegacyLpEconomics />

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm liquidity addition</DialogTitle><DialogDescription>This transfers public testnet USDC from the configured administrator into the {networkMeta[selected].shortName} pool as unowned protocol liquidity.</DialogDescription></DialogHeader>
          <div className="rounded-2xl border border-border bg-background/50 p-5"><div className="flex items-center gap-3"><NetworkMark network={selected} /><div><p className="text-[10px] uppercase tracking-wider text-subtle">Add to {networkMeta[selected].shortName}</p><p className="mt-1 text-lg font-semibold">{parsedAmount === null ? '—' : formatNote(selected, parsedAmount)} USDC</p></div></div><div className="my-5 h-px bg-border" /><p className="text-[11px] leading-5 text-muted">Ethereum may request an ERC-20 approval first. Both actions are public and carry no LP share, yield, or withdrawal entitlement.</p></div>
          <div className="grid gap-2 sm:grid-cols-2"><DialogClose asChild><Button variant="secondary">Back</Button></DialogClose><Button variant="accent" disabled={submitting} onClick={() => void addLiquidity()}>{submitting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ArrowDownToLine aria-hidden="true" />}Add testnet liquidity</Button></div>
        </DialogContent>
      </Dialog>

      <WalletConnectDialog network={walletDialogNetwork} open={Boolean(walletDialogNetwork)} onOpenChange={(open) => !open && setWalletDialogNetwork(null)} purpose="liquidity" />
    </div>
  )
}

export { LiquidityPage }
