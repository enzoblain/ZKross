import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Droplets,
  Info,
  LoaderCircle,
  LockKeyhole,
  Route,
  Scale,
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

type LiquidityView = 'provide' | 'positions'

const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

function LiquidityPage() {
  const { wallets, connecting } = useWallets()
  const [view, setView] = useState<LiquidityView>('provide')
  const [walletDialogNetwork, setWalletDialogNetwork] = useState<NetworkId | null>(null)
  const [amount, setAmount] = useState('10000')
  const [allocation, setAllocation] = useState(50)
  const [monthlyVolume, setMonthlyVolume] = useState('8000000')
  const [poolLiquidity, setPoolLiquidity] = useState('2500000')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)

  const numericAmount = Number.parseFloat(amount) || 0
  const numericMonthlyVolume = Number.parseFloat(monthlyVolume) || 0
  const numericPoolLiquidity = Number.parseFloat(poolLiquidity) || 0
  const feeRate = 0.0005

  const split = useMemo(
    () => ({
      ethereum: (numericAmount * allocation) / 100,
      stellar: (numericAmount * (100 - allocation)) / 100,
    }),
    [allocation, numericAmount],
  )

  const earnings = useMemo(() => {
    const denominator = numericPoolLiquidity + numericAmount
    const providerShare = denominator > 0 ? Math.min(numericAmount / denominator, 1) : 0
    const monthlyFees = numericMonthlyVolume * feeRate
    const monthly = monthlyFees * providerShare
    const annual = monthly * 12
    const modeledRate = numericAmount > 0 ? (annual / numericAmount) * 100 : 0

    return { providerShare, monthlyFees, monthly, annual, modeledRate }
  }, [numericAmount, numericMonthlyVolume, numericPoolLiquidity])

  const walletsReady = Boolean(wallets.ethereum && wallets.stellar)
  const canReview = walletsReady && numericAmount > 0
  const missingWallet: NetworkId | null = !wallets.ethereum
    ? 'ethereum'
    : !wallets.stellar
      ? 'stellar'
      : null

  return (
    <div className="page-enter">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            <NetworkRouteMark />
            USDC liquidity
          </p>
          <h1 className="mt-4 text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
            Put idle USDC to work.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted">
            The target model rewards liquidity providers with a proportional share of bridge fees.
            Deposits, fee accounting, and withdrawals are not live yet.
          </p>
        </div>
        <span className="w-fit rounded-full border border-warning/25 bg-warning/[0.055] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning">
          Illustrative model
        </span>
      </div>

      <div className="mt-10 grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(310px,0.75fr)]">
        <section className="overflow-hidden rounded-[2rem] border border-border bg-surface" aria-labelledby="liquidity-card-title">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
            <div>
              <h2 id="liquidity-card-title" className="text-base font-semibold tracking-[-0.02em]">Liquidity workspace</h2>
              <p className="mt-1 text-xs text-subtle">Balanced reserves for both transfer directions.</p>
            </div>
            <div role="tablist" aria-label="Liquidity views" className="flex rounded-xl border border-border bg-background p-1">
              {[
                ['provide', 'Provide'],
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

          {view === 'provide' ? (
            <div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-border px-5 py-7 sm:px-7">
                <div className="flex flex-col items-center text-center">
                  <NetworkMark network="ethereum" className="size-12 rounded-[18px]" />
                  <p className="mt-3 text-xs font-medium">Ethereum</p>
                  <p className="mt-1 text-[9px] text-subtle">USDC reserve</p>
                </div>
                <div className="mx-4 flex items-center gap-2 text-subtle sm:mx-10">
                  <span className="h-px w-5 bg-border sm:w-10" />
                  <Route aria-hidden="true" className="size-4" />
                  <span className="h-px w-5 bg-border sm:w-10" />
                </div>
                <div className="flex flex-col items-center text-center">
                  <NetworkMark network="stellar" className="size-12 rounded-[18px]" />
                  <p className="mt-3 text-xs font-medium">Stellar</p>
                  <p className="mt-1 text-[9px] text-subtle">USDC reserve</p>
                </div>
              </div>

              <div className="border-b border-border px-5 py-6 sm:px-7">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="liquidity-amount" className="text-[10px] font-medium text-subtle">Total deposit intent</label>
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
                <p className="mt-3 text-[10px] text-subtle">Wallet balances are not read in this prototype.</p>
              </div>

              <div className="border-b border-border px-5 py-6 sm:px-7">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="allocation-range" className="font-medium text-muted">Reserve allocation</label>
                  <span className="font-mono">{allocation} / {100 - allocation}</span>
                </div>
                <input
                  id="allocation-range"
                  type="range"
                  min="25"
                  max="75"
                  step="5"
                  value={allocation}
                  onChange={(event) => setAllocation(Number(event.target.value))}
                  className="mt-5 h-1.5 w-full cursor-pointer accent-accent"
                />
                <div className="mt-5 grid grid-cols-2 divide-x divide-border border-y border-border py-4">
                  <div className="pr-4">
                    <p className="text-[9px] text-subtle">Ethereum reserve</p>
                    <p className="mt-1 font-mono text-xs">{money.format(split.ethereum)} USDC</p>
                  </div>
                  <div className="pl-4 text-right">
                    <p className="text-[9px] text-subtle">Stellar reserve</p>
                    <p className="mt-1 font-mono text-xs">{money.format(split.stellar)} USDC</p>
                  </div>
                </div>
              </div>

              <div className="border-b border-border px-5 py-6 sm:px-7">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-muted">Funding wallets</p>
                  <span className="text-[9px] text-subtle">One on each reserve chain</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['ethereum', 'stellar'] as NetworkId[]).map((network) => {
                    const wallet = wallets[network]
                    const isConnecting = connecting === network
                    return (
                      <button
                        key={network}
                        type="button"
                        onClick={() => setWalletDialogNetwork(network)}
                        className="focus-ring flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-background/45 px-3.5 text-left hover:border-border-strong"
                      >
                        <NetworkMark network={network} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[9px] text-subtle">{networkMeta[network].wallet}</span>
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
                    )
                  })}
                </div>
              </div>

              <div className="px-5 py-6 sm:px-7">
                <Button
                  variant="accent"
                  size="lg"
                  className="w-full"
                  disabled={walletsReady && !canReview}
                  onClick={() => missingWallet ? setWalletDialogNetwork(missingWallet) : setReviewOpen(true)}
                >
                  <Droplets aria-hidden="true" />
                  {walletsReady ? 'Review liquidity intent' : `Connect ${networkMeta[missingWallet ?? 'ethereum'].wallet}`}
                </Button>
                <p className="mt-3 text-center text-[10px] leading-4 text-subtle">No approval, deposit, LP share, or yield is created.</p>
              </div>
            </div>
          ) : (
            <div className="grid min-h-[520px] place-items-center p-7 text-center">
              {draftSaved ? (
                <div className="max-w-sm">
                  <span className="mx-auto grid size-14 place-items-center rounded-full border border-accent/25 bg-accent/10 text-accent">
                    <CircleDollarSign aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-6 text-lg font-semibold">Local intent saved</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    {money.format(numericAmount)} USDC · {allocation}/{100 - allocation} split.
                    This is not an on-chain LP position.
                  </p>
                  <Button variant="secondary" className="mt-6" onClick={() => setView('provide')}>Edit intent</Button>
                </div>
              ) : (
                <div className="max-w-sm">
                  <span className="mx-auto grid size-14 place-items-center rounded-full border border-border bg-background text-subtle">
                    <Droplets aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-6 text-lg font-semibold">No live positions</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">Positions will appear after contracts, indexing, and wallet-signed deposits exist.</p>
                  <Button variant="secondary" className="mt-6" onClick={() => setView('provide')}>Compose an intent</Button>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="overflow-hidden rounded-3xl border border-accent/25 bg-surface" aria-labelledby="earnings-title">
            <div className="border-b border-border p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">Earnings model</p>
              <h2 id="earnings-title" className="mt-2 text-lg font-semibold tracking-[-0.03em]">Earn a share of bridge fees.</h2>
              <p className="mt-2 text-[11px] leading-5 text-muted">Change the assumptions to understand the target economics.</p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
              <label className="p-4">
                <span className="block text-[9px] text-subtle">Monthly bridge volume</span>
                <span className="mt-2 flex items-center gap-1 font-mono text-xs">
                  $
                  <input
                    inputMode="decimal"
                    value={monthlyVolume}
                    onChange={(event) => setMonthlyVolume(event.target.value.replace(/[^0-9.]/g, ''))}
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    aria-label="Illustrative monthly bridge volume"
                  />
                </span>
              </label>
              <label className="p-4">
                <span className="block text-[9px] text-subtle">Existing pool liquidity</span>
                <span className="mt-2 flex items-center gap-1 font-mono text-xs">
                  $
                  <input
                    inputMode="decimal"
                    value={poolLiquidity}
                    onChange={(event) => setPoolLiquidity(event.target.value.replace(/[^0-9.]/g, ''))}
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    aria-label="Illustrative existing pool liquidity"
                  />
                </span>
              </label>
            </div>

            <div className="p-6">
              <p className="text-[9px] text-subtle">Modeled annual fee share</p>
              <p className="mt-2 text-3xl font-medium tracking-[-0.05em]">${money.format(earnings.annual)}</p>
              <p className="mt-2 text-[10px] text-muted">
                ≈ ${money.format(earnings.monthly)}/month · {earnings.modeledRate.toFixed(2)}% annualized model
              </p>

              <dl className="mt-6 space-y-3 border-t border-border pt-5 text-[10px]">
                <div className="flex justify-between gap-4"><dt className="text-subtle">Protocol fee assumption</dt><dd>0.05% / transfer</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-subtle">Your modeled pool share</dt><dd>{(earnings.providerShare * 100).toFixed(3)}%</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-subtle">Monthly fee pool</dt><dd>${compact.format(earnings.monthlyFees)}</dd></div>
              </dl>

              <div className="mt-5 flex items-start gap-2.5 border-t border-border pt-5 text-[10px] leading-4 text-muted">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
                Variable illustration, not an APY quote or guarantee. Live utilization and fee data do not exist yet.
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-xs font-semibold">How liquidity earns</h2>
            <ol className="mt-5 space-y-5">
              {[
                [Scale, 'Fund both reserves', 'USDC is allocated to Ethereum and Stellar liquidity.'],
                [Route, 'Serve transfers', 'Bridge flow uses the destination reserve to release USDC.'],
                [CircleDollarSign, 'Share the fees', 'Accrued protocol fees are attributed pro rata to LP shares.'],
              ].map(([Icon, title, description], index) => {
                const StepIcon = Icon as typeof Scale
                return (
                  <li key={title as string} className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-accent"><StepIcon aria-hidden="true" className="size-3.5" /></span>
                    <div>
                      <p className="text-[10px] font-medium"><span className="mr-2 font-mono text-subtle">0{index + 1}</span>{title as string}</p>
                      <p className="mt-1 text-[10px] leading-4 text-subtle">{description as string}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        </aside>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review liquidity intent</DialogTitle>
            <DialogDescription>Save this allocation locally. No token approval, signature, deposit, or LP position will be created.</DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-border bg-background/50 p-5">
            <dl className="space-y-4 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-subtle">Total</dt><dd className="font-mono">{money.format(numericAmount)} USDC</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Ethereum reserve</dt><dd className="font-mono">{money.format(split.ethereum)} USDC</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Stellar reserve</dt><dd className="font-mono">{money.format(split.stellar)} USDC</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Modeled annual fees</dt><dd className="font-mono">${money.format(earnings.annual)} · illustrative</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Pool contracts</dt><dd className="text-warning">Unavailable</dd></div>
            </dl>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            Connected wallets expose public addresses only. They are not asked to sign this draft.
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <DialogClose asChild><Button variant="secondary">Back to edit</Button></DialogClose>
            <Button
              variant="accent"
              onClick={() => {
                setDraftSaved(true)
                setView('positions')
                setReviewOpen(false)
              }}
            >
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
