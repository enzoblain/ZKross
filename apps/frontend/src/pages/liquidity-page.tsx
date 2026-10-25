import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Info,
  LoaderCircle,
  LockKeyhole,
  Route,
  Scale,
  ShieldCheck,
  WalletCards,
} from 'lucide-react'
import { useMemo, useState } from 'react'

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
import { useWallets } from '../components/wallet-context'
import { WalletConnectDialog } from '../components/wallet-connect-dialog'
import { networkMeta, type NetworkId } from '../lib/mock-bridge'
import { cn } from '../lib/utils'
import { truncateAddress } from '../lib/wallet-adapters'

type LiquidityView = 'provide' | 'withdraw' | 'positions'
type DraftAction = 'provide' | 'withdraw'

const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const vaults: Record<
  NetworkId,
  {
    balance: number
    available: number
    safetyBuffer: number
    pendingOut: number
    utilization: number
    monthlyVolume: number
    feeRate: number
    status: string
  }
> = {
  ethereum: {
    balance: 1_240_000,
    available: 930_000,
    safetyBuffer: 250_000,
    pendingOut: 60_000,
    utilization: 25,
    monthlyVolume: 3_800_000,
    feeRate: 0.0005,
    status: 'Comfortable',
  },
  stellar: {
    balance: 910_000,
    available: 610_000,
    safetyBuffer: 240_000,
    pendingOut: 60_000,
    utilization: 33,
    monthlyVolume: 4_200_000,
    feeRate: 0.0006,
    status: 'Balanced',
  },
}

function LiquidityPage() {
  const { wallets, connecting } = useWallets()
  const [view, setView] = useState<LiquidityView>('provide')
  const [selectedVault, setSelectedVault] = useState<NetworkId>('ethereum')
  const [withdrawDestination, setWithdrawDestination] = useState<NetworkId>('stellar')
  const [walletDialogNetwork, setWalletDialogNetwork] = useState<NetworkId | null>(null)
  const [amount, setAmount] = useState('10000')
  const [recipient, setRecipient] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [savedDraft, setSavedDraft] = useState<{
    action: DraftAction
    network: NetworkId
    destination: NetworkId
    amount: number
  } | null>(null)

  const vault = vaults[selectedVault]
  const numericAmount = Number.parseFloat(amount) || 0
  const isCrossChainWithdrawal = view === 'withdraw' && withdrawDestination !== selectedVault
  const destinationVault = vaults[withdrawDestination]
  const wallet = wallets[selectedVault]
  const isConnecting = connecting === selectedVault

  const recipientIsValid = !isCrossChainWithdrawal || (
    withdrawDestination === 'stellar'
      ? recipient.trim().startsWith('G') && recipient.trim().length >= 16
      : /^0x[a-fA-F0-9]{40}$/.test(recipient.trim())
  )

  const earnings = useMemo(() => {
    const denominator = vault.balance + numericAmount
    const providerShare = denominator > 0 ? Math.min(numericAmount / denominator, 1) : 0
    const monthlyFeePool = vault.monthlyVolume * vault.feeRate
    const monthly = monthlyFeePool * providerShare
    const annual = monthly * 12
    const modeledRate = numericAmount > 0 ? (annual / numericAmount) * 100 : 0

    return { providerShare, monthlyFeePool, monthly, annual, modeledRate }
  }, [numericAmount, vault])

  const canReview = Boolean(wallet) && numericAmount > 0 && recipientIsValid

  const changeVault = (network: NetworkId) => {
    setSelectedVault(network)
    setWithdrawDestination(network === 'ethereum' ? 'stellar' : 'ethereum')
    setRecipient('')
  }

  const useDemoRecipient = () => {
    setRecipient(
      withdrawDestination === 'stellar'
        ? 'GCFX4N6W4FZDB3A7XUVKQ5BIRXW3S2E5HUEXAMPLEADDR'
        : '0x1111111111111111111111111111111111111111',
    )
  }

  const openPrimaryAction = () => {
    if (!wallet) {
      setWalletDialogNetwork(selectedVault)
      return
    }
    setReviewOpen(true)
  }

  const saveDraft = () => {
    setSavedDraft({
      action: view === 'withdraw' ? 'withdraw' : 'provide',
      network: selectedVault,
      destination: view === 'withdraw' ? withdrawDestination : selectedVault,
      amount: numericAmount,
    })
    setReviewOpen(false)
    setView('positions')
  }

  return (
    <div className="page-enter">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.58fr] lg:items-end">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            <NetworkRouteMark />
            Two independent USDC vaults
          </p>
          <h1 className="mt-4 text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
            Liquidity where settlement happens.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted">
            Provide USDC to one chain at a time. Bridge payouts use the destination vault,
            and every deposit or withdrawal remains visible on that chain.
          </p>
        </div>
        <div className="flex items-start gap-3 border-l border-warning/30 pl-5 text-[11px] leading-5 text-muted">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <p><strong className="text-foreground">Illustrative balances.</strong> No vault contract, LP share, fee accrual, or APY exists in this frontend.</p>
        </div>
      </div>

      <section className="mt-10 grid gap-3 sm:grid-cols-2" aria-label="Illustrative vaults">
        {(['ethereum', 'stellar'] as NetworkId[]).map((network) => {
          const item = vaults[network]
          const isSelected = selectedVault === network
          return (
            <button
              key={network}
              type="button"
              aria-pressed={isSelected}
              onClick={() => changeVault(network)}
              className={cn(
                'focus-ring group rounded-3xl border p-5 text-left transition-colors sm:p-6',
                isSelected ? 'border-accent/40 bg-accent/[0.055]' : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <NetworkMark network={network} className="size-10 rounded-[14px]" />
                  <div>
                    <p className="text-xs font-semibold">{networkMeta[network].shortName} vault</p>
                    <p className="mt-1 text-[9px] text-subtle">USDC · illustrative testnet state</p>
                  </div>
                </div>
                <span className={cn('size-2 rounded-full', isSelected ? 'bg-accent' : 'bg-success')} />
              </div>
              <div className="mt-7 grid grid-cols-3 divide-x divide-border">
                <div>
                  <p className="text-[9px] text-subtle">Vault balance</p>
                  <p className="mt-1 font-mono text-xs">${compact.format(item.balance)}</p>
                </div>
                <div className="px-4">
                  <p className="text-[9px] text-subtle">Route capacity</p>
                  <p className="mt-1 font-mono text-xs">${compact.format(item.available)}</p>
                </div>
                <div className="pl-4">
                  <p className="text-[9px] text-subtle">Utilization</p>
                  <p className="mt-1 font-mono text-xs">{item.utilization}%</p>
                </div>
              </div>
              <div className="mt-5 h-1 overflow-hidden rounded-full bg-background">
                <span className="block h-full rounded-full bg-accent/70" style={{ width: `${item.utilization}%` }} />
              </div>
            </button>
          )
        })}
      </section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(310px,0.75fr)]">
        <section className="overflow-hidden rounded-[2rem] border border-border bg-surface" aria-labelledby="liquidity-card-title">
          <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <h2 id="liquidity-card-title" className="text-base font-semibold tracking-[-0.02em]">{networkMeta[selectedVault].shortName} vault workspace</h2>
              <p className="mt-1 text-xs text-subtle">One vault, one owner wallet, one clear action.</p>
            </div>
            <div role="tablist" aria-label="Liquidity views" className="flex w-fit rounded-xl border border-border bg-background p-1">
              {[
                ['provide', 'Provide'],
                ['withdraw', 'Withdraw'],
                ['positions', 'Positions'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id as LiquidityView)}
                  className={cn(
                    'focus-ring rounded-lg px-3 py-2 text-[10px] font-medium',
                    view === id ? 'bg-surface-raised text-foreground' : 'text-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {view === 'positions' ? (
            <div className="grid min-h-[510px] place-items-center p-7 text-center">
              {savedDraft ? (
                <div className="max-w-md">
                  <span className="mx-auto grid size-14 place-items-center rounded-full border border-accent/25 bg-accent/10 text-accent">
                    {savedDraft.action === 'provide' ? <ArrowDownToLine aria-hidden="true" className="size-5" /> : <ArrowUpFromLine aria-hidden="true" className="size-5" />}
                  </span>
                  <p className="mt-6 text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">Local {savedDraft.action} draft</p>
                  <h3 className="mt-2 text-xl font-semibold">{money.format(savedDraft.amount)} USDC</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    {savedDraft.action === 'provide'
                      ? `${networkMeta[savedDraft.network].shortName} vault only.`
                      : `${networkMeta[savedDraft.network].shortName} position → ${networkMeta[savedDraft.destination].shortName} payout.`}
                    {' '}No on-chain position or withdrawal exists.
                  </p>
                  <div className="mt-6 flex justify-center gap-2">
                    <NetworkMark network={savedDraft.network} />
                    {savedDraft.destination !== savedDraft.network && (
                      <><ArrowRight aria-hidden="true" className="mt-2 size-4 text-subtle" /><NetworkMark network={savedDraft.destination} /></>
                    )}
                  </div>
                  <Button variant="secondary" className="mt-7" onClick={() => setView(savedDraft.action)}>Edit draft</Button>
                </div>
              ) : (
                <div className="max-w-sm">
                  <span className="mx-auto grid size-14 place-items-center rounded-full border border-border bg-background text-subtle">
                    <CircleDollarSign aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-6 text-lg font-semibold">No live positions</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">Positions will appear after vault contracts, indexing, and wallet-signed deposits exist.</p>
                  <Button variant="secondary" className="mt-6" onClick={() => setView('provide')}>Compose an intent</Button>
                </div>
              )}
            </div>
          ) : (
            <div>
              {view === 'withdraw' && (
                <div className="border-b border-border px-5 py-5 sm:px-7">
                  <p className="text-[10px] font-medium text-subtle">Receive withdrawal on</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(['ethereum', 'stellar'] as NetworkId[]).map((network) => (
                      <button
                        key={network}
                        type="button"
                        onClick={() => { setWithdrawDestination(network); setRecipient('') }}
                        className={cn(
                          'focus-ring flex items-center gap-3 rounded-2xl border px-4 py-3 text-left',
                          withdrawDestination === network ? 'border-accent/35 bg-accent/[0.06]' : 'border-border bg-background/40',
                        )}
                      >
                        <NetworkMark network={network} className="size-8 rounded-xl" />
                        <span>
                          <span className="block text-xs font-medium">{networkMeta[network].shortName}</span>
                          <span className="mt-1 block text-[9px] text-subtle">{network === selectedVault ? 'Same-chain exit' : 'Cross-chain exit'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-b border-border px-5 py-6 sm:px-7">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="liquidity-amount" className="text-[10px] font-medium text-subtle">
                    {view === 'provide' ? 'Amount to provide' : 'LP share value to withdraw'}
                  </label>
                  <span className="rounded-full bg-surface-raised px-3 py-1 text-[10px] font-semibold">USDC</span>
                </div>
                <input
                  id="liquidity-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                  className="mt-3 w-full bg-transparent text-4xl font-medium tracking-[-0.06em] outline-none placeholder:text-subtle sm:text-5xl"
                  placeholder="0.00"
                />
                <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-[10px]">
                  <span className="text-subtle">{view === 'provide' ? 'Selected vault' : 'Illustrative available position'}</span>
                  <span className="font-mono">{view === 'provide' ? `${networkMeta[selectedVault].shortName} USDC` : '25,000.00 USDC'}</span>
                </div>
              </div>

              {isCrossChainWithdrawal && (
                <div className="border-b border-border px-5 py-5 sm:px-7">
                  <div className="flex items-center justify-between gap-4">
                    <label htmlFor="withdraw-recipient" className="text-[10px] font-medium text-subtle">Receiving {networkMeta[withdrawDestination].shortName} address</label>
                    <button type="button" onClick={useDemoRecipient} className="focus-ring rounded-lg text-[9px] font-medium text-accent">Use demo</button>
                  </div>
                  <input
                    id="withdraw-recipient"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    placeholder={withdrawDestination === 'stellar' ? 'G…' : '0x…'}
                    aria-invalid={recipient.length > 0 && !recipientIsValid}
                    className="mt-3 w-full rounded-xl border border-border bg-background/50 px-4 py-3 font-mono text-xs outline-none focus:border-accent/50"
                  />
                  {recipient.length > 0 && !recipientIsValid && <p className="mt-2 text-[10px] text-danger">Enter a valid public destination address.</p>}
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/[0.05] p-3 text-[10px] leading-4 text-muted">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    Cross-chain exit depends on the {networkMeta[withdrawDestination].shortName} vault’s available capacity. It may be repriced, queued, or paused.
                  </div>
                </div>
              )}

              <div className="border-b border-border px-5 py-5 sm:px-7">
                <p className="text-[10px] font-medium text-subtle">Position owner wallet</p>
                <button
                  type="button"
                  onClick={() => setWalletDialogNetwork(selectedVault)}
                  className="focus-ring mt-3 flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-background/45 px-3.5 text-left hover:border-border-strong"
                >
                  <NetworkMark network={selectedVault} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[9px] text-subtle">{networkMeta[selectedVault].wallet} · one wallet required</span>
                    <span className="mt-1 block truncate text-xs font-medium">
                      {wallet ? truncateAddress(wallet.address) : isConnecting ? 'Waiting for wallet…' : 'Connect wallet'}
                    </span>
                  </span>
                  {isConnecting ? (
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-accent" />
                  ) : wallet ? (
                    <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
                  ) : (
                    <WalletCards aria-hidden="true" className="size-4 text-subtle" />
                  )}
                </button>
                <p className="mt-3 text-[10px] leading-4 text-subtle">The other-chain recipient only needs a public address. A second connected wallet is not required.</p>
              </div>

              <div className="px-5 py-6 sm:px-7">
                <Button
                  variant="accent"
                  size="lg"
                  className="w-full"
                  disabled={Boolean(wallet) && !canReview}
                  onClick={openPrimaryAction}
                >
                  {view === 'provide' ? <ArrowDownToLine aria-hidden="true" /> : <ArrowUpFromLine aria-hidden="true" />}
                  {!wallet
                    ? `Connect ${networkMeta[selectedVault].wallet}`
                    : view === 'provide'
                      ? 'Review provide intent'
                      : isCrossChainWithdrawal && !recipientIsValid
                        ? `Enter ${networkMeta[withdrawDestination].shortName} recipient`
                        : 'Review withdrawal intent'}
                </Button>
                <p className="mt-3 text-center text-[10px] leading-4 text-subtle">No approval, signature, deposit, withdrawal, or LP share is created.</p>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="overflow-hidden rounded-3xl border border-accent/25 bg-surface" aria-labelledby="economics-title">
            <div className="border-b border-border p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">Vault economics</p>
                  <h2 id="economics-title" className="mt-2 text-lg font-semibold tracking-[-0.03em]">Fees follow the reserve used.</h2>
                </div>
                <NetworkMark network={selectedVault} />
              </div>
              <p className="mt-3 text-[11px] leading-5 text-muted">LPs in one vault earn a proportional share of fees attributed to payouts served by that vault.</p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
              <div className="p-4">
                <p className="text-[9px] text-subtle">Modeled monthly outflow</p>
                <p className="mt-2 font-mono text-xs">${compact.format(vault.monthlyVolume)}</p>
              </div>
              <div className="p-4">
                <p className="text-[9px] text-subtle">Illustrative route fee</p>
                <p className="mt-2 font-mono text-xs">{(vault.feeRate * 100).toFixed(2)}%</p>
              </div>
            </div>

            <div className="p-6">
              <p className="text-[9px] text-subtle">Modeled annual fee share</p>
              <p className="mt-2 text-3xl font-medium tracking-[-0.05em]">${money.format(earnings.annual)}</p>
              <p className="mt-2 text-[10px] text-muted">≈ ${money.format(earnings.monthly)}/month · {earnings.modeledRate.toFixed(2)}% annualized scenario</p>

              <dl className="mt-6 space-y-3 border-t border-border pt-5 text-[10px]">
                <div className="flex justify-between gap-4"><dt className="text-subtle">Your modeled vault share</dt><dd>{(earnings.providerShare * 100).toFixed(3)}%</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-subtle">Modeled monthly fee pool</dt><dd>${money.format(earnings.monthlyFeePool)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-subtle">Capital at risk</dt><dd>Smart contract + liquidity</dd></div>
              </dl>

              <div className="mt-5 flex items-start gap-2.5 border-t border-border pt-5 text-[10px] leading-4 text-muted">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
                Scenario only, not an APY quote or guarantee. Fees, utilization, losses, and withdrawals are not implemented.
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-6" aria-labelledby="capacity-title">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">Destination capacity</p>
                <h2 id="capacity-title" className="mt-2 text-sm font-semibold">How the vault stays available</h2>
              </div>
              <Gauge aria-hidden="true" className="size-4 text-accent" />
            </div>
            <dl className="mt-5 space-y-3 border-y border-border py-4 text-[10px]">
              <div className="flex justify-between gap-4"><dt className="text-subtle">Vault balance</dt><dd>${compact.format(destinationVault.balance)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Safety buffer</dt><dd>− ${compact.format(destinationVault.safetyBuffer)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Pending payouts</dt><dd>− ${compact.format(destinationVault.pendingOut)}</dd></div>
              <div className="flex justify-between gap-4 font-medium"><dt>Available route capacity</dt><dd className="text-accent">${compact.format(destinationVault.available)}</dd></div>
            </dl>
            <ol className="mt-5 space-y-4">
              {[
                [Scale, 'Price the imbalance', 'A direction that drains a scarce vault should cost more.'],
                [Route, 'Reward rebalancing', 'Market makers replenish the deficit side when incentives justify it.'],
                [ShieldCheck, 'Protect the buffer', 'The route queues or pauses before required reserves are consumed.'],
              ].map(([Icon, title, description]) => {
                const StepIcon = Icon as typeof Scale
                return (
                  <li key={title as string} className="flex gap-3">
                    <StepIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-accent" />
                    <div><p className="text-[10px] font-medium">{title as string}</p><p className="mt-1 text-[10px] leading-4 text-subtle">{description as string}</p></div>
                  </li>
                )
              })}
            </ol>
          </section>
        </aside>
      </div>

      <section className="mt-5 grid gap-4 rounded-[2rem] border border-border bg-background/35 p-6 sm:grid-cols-3 sm:p-8" aria-label="Liquidity model summary">
        {[
          [ArrowDownToLine, 'Single-sided entry', 'An LP chooses Ethereum or Stellar. Depositing into both is never required.'],
          [LockKeyhole, 'Public LP actions', 'Vault entry, exit, amount, and address are public on the selected chain.'],
          [CircleDollarSign, 'Commercial providers', 'Market makers, fintechs, and treasuries may provide liquidity for fees; regulators normally do not.'],
        ].map(([Icon, title, description], index) => {
          const ItemIcon = Icon as typeof ArrowDownToLine
          return (
            <article key={title as string} className={cn('sm:px-5', index > 0 && 'border-t border-border pt-5 sm:border-l sm:border-t-0 sm:pt-0')}>
              <ItemIcon aria-hidden="true" className="size-4 text-accent" />
              <h2 className="mt-5 text-xs font-semibold">{title as string}</h2>
              <p className="mt-2 text-[11px] leading-5 text-muted">{description as string}</p>
            </article>
          )
        })}
      </section>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review {view === 'withdraw' ? 'withdrawal' : 'provide'} intent</DialogTitle>
            <DialogDescription>
              Save this configuration locally. No token approval, signature, vault action, payout, or LP position will be created.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-border bg-background/50 p-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <NetworkMark network={selectedVault} />
              <div><p className="text-xs font-semibold">{networkMeta[selectedVault].shortName} vault</p><p className="mt-1 text-[9px] text-subtle">Position owner chain</p></div>
              {view === 'withdraw' && withdrawDestination !== selectedVault && (
                <><ArrowRight aria-hidden="true" className="ml-auto size-4 text-subtle" /><NetworkMark network={withdrawDestination} /></>
              )}
            </div>
            <dl className="mt-4 space-y-4 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-subtle">Action</dt><dd className="capitalize">{view}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Amount</dt><dd className="font-mono">{money.format(numericAmount)} USDC</dd></div>
              {view === 'provide' ? (
                <div className="flex justify-between gap-4"><dt className="text-subtle">Modeled annual fees</dt><dd className="font-mono">${money.format(earnings.annual)} · scenario</dd></div>
              ) : (
                <div className="flex justify-between gap-4"><dt className="text-subtle">Payout chain</dt><dd>{networkMeta[withdrawDestination].shortName}</dd></div>
              )}
              <div className="flex justify-between gap-4"><dt className="text-subtle">Vault contracts</dt><dd className="text-warning">Unavailable</dd></div>
            </dl>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            Connected wallets expose public addresses only. They are not asked to sign this draft.
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <DialogClose asChild><Button variant="secondary">Back to edit</Button></DialogClose>
            <Button variant="accent" onClick={saveDraft}>
              Save local draft
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <WalletConnectDialog
        network={walletDialogNetwork}
        open={Boolean(walletDialogNetwork)}
        onOpenChange={(open) => !open && setWalletDialogNetwork(null)}
        purpose="liquidity"
      />
    </div>
  )
}

export { LiquidityPage }
