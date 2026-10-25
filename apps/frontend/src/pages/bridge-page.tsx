import {
  ArrowDownUp,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  Info,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Spotlight } from '../components/aceternity/spotlight'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import {
  mockBridgeAdapter,
  networkMeta,
  type NetworkId,
  type PrivacyMode,
  type TransferProgressStep,
  type WalletConnection,
} from '../lib/mock-bridge'
import { cn } from '../lib/utils'

const compactNumber = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

type Wallets = Partial<Record<NetworkId, WalletConnection>>

function NetworkMark({ network }: { network: NetworkId }) {
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full border text-sm font-semibold',
        network === 'stellar'
          ? 'border-foreground/20 bg-foreground text-background'
          : 'border-accent/30 bg-accent/10 text-accent',
      )}
      aria-hidden="true"
    >
      {networkMeta[network].mark}
    </span>
  )
}

function BridgePage() {
  const [from, setFrom] = useState<NetworkId>('stellar')
  const [amount, setAmount] = useState('250')
  const [recipient, setRecipient] = useState('')
  const [privacyMode, setPrivacyMode] =
    useState<PrivacyMode>('transparent')
  const [wallets, setWallets] = useState<Wallets>({})
  const [connecting, setConnecting] = useState<NetworkId | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'complete'>(
    'idle',
  )
  const [progress, setProgress] = useState<TransferProgressStep[]>(() =>
    mockBridgeAdapter.createProgress('stellar'),
  )

  const to: NetworkId = from === 'stellar' ? 'ethereum' : 'stellar'
  const numericAmount = Number.parseFloat(amount) || 0
  const quote = useMemo(
    () => mockBridgeAdapter.getQuote(numericAmount),
    [numericAmount],
  )
  const canReview =
    Boolean(wallets.stellar && wallets.ethereum) &&
    numericAmount > 0 &&
    recipient.trim().length >= 8 &&
    runStatus !== 'running'

  useEffect(() => {
    if (runStatus !== 'running') return undefined

    let activeIndex = 0
    const interval = window.setInterval(() => {
      activeIndex += 1

      if (activeIndex >= progress.length) {
        setProgress((steps) =>
          steps.map((step) => ({ ...step, status: 'complete' })),
        )
        setRunStatus('complete')
        window.clearInterval(interval)
        return
      }

      setProgress((steps) =>
        steps.map((step, index) => ({
          ...step,
          status:
            index < activeIndex
              ? 'complete'
              : index === activeIndex
                ? 'active'
                : 'idle',
        })),
      )
    }, 1150)

    return () => window.clearInterval(interval)
  }, [runStatus, progress.length])

  const connectWallet = async (network: NetworkId) => {
    if (wallets[network]) return

    setConnecting(network)
    const wallet = await mockBridgeAdapter.connectWallet(network)
    setWallets((current) => ({ ...current, [network]: wallet }))
    setConnecting(null)
  }

  const swapDirection = () => {
    const nextFrom = from === 'stellar' ? 'ethereum' : 'stellar'
    setFrom(nextFrom)
    if (runStatus !== 'running') {
      setProgress(mockBridgeAdapter.createProgress(nextFrom))
      setRunStatus('idle')
    }
  }

  const beginSimulation = () => {
    const initialProgress = mockBridgeAdapter.createProgress(from).map(
      (step, index) => ({
        ...step,
        status: index === 0 ? ('active' as const) : ('idle' as const),
      }),
    )
    setProgress(initialProgress)
    setRunStatus('running')
    setReviewOpen(false)
  }

  const resetSimulation = () => {
    setProgress(mockBridgeAdapter.createProgress(from))
    setRunStatus('idle')
  }

  return (
    <div className="page-enter">
      <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end lg:mb-12">
        <div className="max-w-2xl">
          <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            <span className="h-px w-6 bg-accent/60" />
            Stellar ↔ Ethereum
          </div>
          <h1 className="max-w-xl text-[2.4rem] font-medium leading-[1.04] tracking-[-0.055em] text-foreground sm:text-5xl">
            Move value.<br />
            Keep control.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted sm:text-[15px]">
            Compose a cross-chain USDC transfer with a legible audit trail.
            This interface currently runs against mock adapters only.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start rounded-2xl border border-border bg-surface px-4 py-3 sm:self-end">
          <span className="grid size-8 place-items-center rounded-full bg-warning/10 text-warning">
            <Info aria-hidden="true" className="size-4" />
          </span>
          <div>
            <p className="text-xs font-medium text-foreground">Simulation environment</p>
            <p className="mt-0.5 text-[11px] text-subtle">No signing · No settlement</p>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.48fr)_minmax(310px,0.72fr)]">
        <section
          aria-labelledby="bridge-form-title"
          className="hairline-card relative overflow-hidden rounded-3xl border border-border bg-surface-raised"
        >
          <Spotlight />
          <div className="relative border-b border-border px-5 py-5 sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="bridge-form-title" className="text-base font-semibold tracking-[-0.02em]">
                  New transfer
                </h2>
                <p className="mt-1 text-xs text-subtle">Build and review before any wallet prompt.</p>
              </div>
              <span className="rounded-full border border-border bg-background/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
                Mock
              </span>
            </div>
          </div>

          <div className="relative space-y-6 p-5 sm:p-7">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Wallets</span>
                <span className="text-[11px] text-subtle">
                  {Object.keys(wallets).length}/2 connected
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['stellar', 'ethereum'] as NetworkId[]).map((network) => {
                  const connection = wallets[network]
                  const isConnecting = connecting === network

                  return (
                    <button
                      key={network}
                      type="button"
                      onClick={() => void connectWallet(network)}
                      disabled={Boolean(connection) || isConnecting}
                      className="focus-ring flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-background/40 px-3.5 text-left transition-colors hover:border-border-strong disabled:cursor-default disabled:opacity-100"
                    >
                      <NetworkMark network={network} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] text-subtle">
                          {networkMeta[network].name} wallet
                        </span>
                        <span className="mt-0.5 block truncate text-xs font-medium text-foreground">
                          {connection?.address ??
                            (isConnecting ? 'Connecting…' : 'Connect wallet')}
                        </span>
                      </span>
                      {isConnecting ? (
                        <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-accent" />
                      ) : connection ? (
                        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
                      ) : (
                        <ChevronRight aria-hidden="true" className="size-4 text-subtle" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="relative grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="rounded-2xl border border-border bg-background/45 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">From</p>
                <div className="mt-3 flex items-center gap-3">
                  <NetworkMark network={from} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{networkMeta[from].name}</p>
                    <p className="text-[11px] text-subtle">Source network</p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                aria-label="Swap source and destination networks"
                className="focus-ring absolute left-1/2 top-1/2 z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border border-border-strong bg-surface-raised text-muted shadow-lg transition-colors hover:text-accent sm:static sm:translate-x-0 sm:translate-y-0"
                onClick={swapDirection}
                disabled={runStatus === 'running'}
              >
                <ArrowDownUp aria-hidden="true" className="size-4 sm:rotate-90" />
              </button>

              <div className="rounded-2xl border border-border bg-background/45 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">To</p>
                <div className="mt-3 flex items-center gap-3">
                  <NetworkMark network={to} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{networkMeta[to].name}</p>
                    <p className="text-[11px] text-subtle">Destination network</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <label htmlFor="bridge-amount" className="text-xs font-medium text-muted">
                  Amount
                </label>
                <span className="text-[11px] text-subtle">Mock balance: 1,250.00 USDC</span>
              </div>
              <div className="flex items-center rounded-2xl border border-border bg-background/45 px-4 transition-colors focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/10">
                <input
                  id="bridge-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                  className="min-w-0 flex-1 bg-transparent py-4 text-2xl font-medium tracking-[-0.035em] text-foreground outline-none placeholder:text-subtle"
                  placeholder="0.00"
                />
                <button
                  type="button"
                  className="focus-ring mr-3 rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent hover:bg-accent/10"
                  onClick={() => setAmount('1250')}
                >
                  Max
                </button>
                <span className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground">
                  USDC
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="recipient" className="mb-2.5 block text-xs font-medium text-muted">
                Recipient on {networkMeta[to].name}
              </label>
              <div className="flex items-center rounded-2xl border border-border bg-background/45 px-4 transition-colors focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/10">
                <input
                  id="recipient"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-3.5 font-mono text-xs text-foreground outline-none placeholder:text-subtle"
                  placeholder={to === 'ethereum' ? '0x…' : 'G…'}
                />
                <button
                  type="button"
                  aria-label="Paste recipient address"
                  title="Use demo recipient"
                  className="focus-ring rounded-lg p-2 text-subtle transition-colors hover:bg-white/[0.04] hover:text-foreground"
                  onClick={() =>
                    setRecipient(
                      to === 'ethereum'
                        ? '0x8A29F07B5A88eD08c982f4Fc13e78B4fE7aD2A18'
                        : 'GCFX4N6W4FZDB3A7XUVKQ5BIRXW3S2E5HUEXAMPLEADDR',
                    )
                  }
                >
                  <Copy aria-hidden="true" className="size-4" />
                </button>
              </div>
            </div>

            <fieldset>
              <legend className="mb-2.5 text-xs font-medium text-muted">Privacy mode</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label
                  className={cn(
                    'relative flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors',
                    privacyMode === 'transparent'
                      ? 'border-accent/50 bg-accent/[0.055]'
                      : 'border-border bg-background/35 hover:border-border-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="privacy-mode"
                    value="transparent"
                    checked={privacyMode === 'transparent'}
                    onChange={() => setPrivacyMode('transparent')}
                    className="sr-only"
                  />
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-muted">
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </span>
                  <span>
                    <span className="block text-xs font-medium text-foreground">Transparent</span>
                    <span className="mt-1 block text-[11px] leading-4 text-subtle">
                      Public transfer data in this preview.
                    </span>
                  </span>
                </label>

                <label
                  className={cn(
                    'relative flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors',
                    privacyMode === 'private-intent'
                      ? 'border-accent/50 bg-accent/[0.055]'
                      : 'border-border bg-background/35 hover:border-border-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="privacy-mode"
                    value="private-intent"
                    checked={privacyMode === 'private-intent'}
                    onChange={() => setPrivacyMode('private-intent')}
                    className="sr-only"
                  />
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                    <LockKeyhole aria-hidden="true" className="size-4" />
                  </span>
                  <span>
                    <span className="flex flex-wrap items-center gap-2 text-xs font-medium text-foreground">
                      Private intent
                      <span className="rounded-md border border-warning/25 bg-warning/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-warning">
                        Preview
                      </span>
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-subtle">
                      Circuit proof generation is not connected.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="rounded-2xl border border-border bg-background/35 p-4 text-xs">
              <div className="flex items-center justify-between gap-4">
                <span className="text-subtle">You receive</span>
                <span className="font-mono font-medium text-foreground">
                  {compactNumber.format(quote.amountOut)} USDC
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-subtle">Mock fees</span>
                <span className="font-mono text-muted">
                  {compactNumber.format(quote.networkFee + quote.protocolFee)} USDC
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-subtle">Estimated simulation</span>
                <span className="font-mono text-muted">~{quote.estimatedSeconds}s</span>
              </div>
            </div>

            <Button
              variant="accent"
              size="lg"
              className="w-full"
              disabled={!canReview}
              onClick={() => setReviewOpen(true)}
            >
              <ShieldCheck aria-hidden="true" />
              {wallets.stellar && wallets.ethereum
                ? 'Review mock transfer'
                : 'Connect both wallets to continue'}
            </Button>
            <p className="text-center text-[10px] leading-4 text-subtle">
              Demo flow only. NØCT will not request a signature or submit a transaction.
            </p>
          </div>
        </section>

        <aside className="space-y-5 xl:sticky xl:top-24">
          <section className="rounded-3xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="progress-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">Transfer trace</p>
                <h2 id="progress-title" className="mt-2 text-base font-semibold tracking-[-0.02em]">
                  {runStatus === 'complete'
                    ? 'Simulation complete'
                    : runStatus === 'running'
                      ? 'Simulation in progress'
                      : 'Ready to review'}
                </h2>
              </div>
              <span
                className={cn(
                  'mt-1 size-2 rounded-full',
                  runStatus === 'complete'
                    ? 'bg-success'
                    : runStatus === 'running'
                      ? 'dot-pulse bg-accent'
                      : 'bg-subtle',
                )}
              />
            </div>

            <ol className="mt-6 space-y-0" aria-live="polite">
              {progress.map((step, index) => (
                <li key={step.id} className="relative flex gap-3.5 pb-6 last:pb-0">
                  {index < progress.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute left-[9px] top-5 h-[calc(100%-8px)] w-px',
                        step.status === 'complete' ? 'bg-success/50' : 'bg-border',
                      )}
                    />
                  )}
                  <span className="relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface">
                    {step.status === 'complete' ? (
                      <span className="grid size-5 place-items-center rounded-full bg-success text-background">
                        <Check aria-hidden="true" className="size-3" strokeWidth={3} />
                      </span>
                    ) : step.status === 'active' ? (
                      <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-accent" />
                    ) : (
                      <Circle aria-hidden="true" className="size-5 text-border-strong" />
                    )}
                  </span>
                  <div>
                    <p
                      className={cn(
                        'text-xs font-medium',
                        step.status === 'idle' ? 'text-muted' : 'text-foreground',
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-subtle">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>

            {runStatus === 'complete' && (
              <Button variant="secondary" size="sm" className="mt-6 w-full" onClick={resetSimulation}>
                <RotateCcw aria-hidden="true" />
                Reset simulation
              </Button>
            )}
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl border border-border bg-background/60 text-accent">
                <WalletCards aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="text-xs font-medium text-foreground">Wallet-safe by design</p>
                <p className="mt-0.5 text-[11px] text-subtle">Review first, prompt later.</p>
              </div>
            </div>
            <div className="my-4 h-px bg-border" />
            <div className="flex items-center gap-2 text-[11px] text-subtle">
              <Clock3 aria-hidden="true" className="size-3.5" />
              Quotes are illustrative and do not expire.
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review mock transfer</DialogTitle>
            <DialogDescription>
              Confirm the interface flow below. This creates a local simulation only—no
              signature, transaction, proof, or asset movement occurs.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-border bg-background/45 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <NetworkMark network={from} />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-subtle">Send</p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {compactNumber.format(numericAmount)} USDC
                  </p>
                </div>
              </div>
              <ArrowRight aria-hidden="true" className="size-4 text-subtle" />
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-subtle">Receive</p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {compactNumber.format(quote.amountOut)} USDC
                  </p>
                </div>
                <NetworkMark network={to} />
              </div>
            </div>
            <div className="my-5 h-px bg-border" />
            <dl className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-subtle">Route</dt>
                <dd className="text-muted">{networkMeta[from].name} → {networkMeta[to].name}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-subtle">Recipient</dt>
                <dd className="max-w-[230px] truncate font-mono text-muted">{recipient}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-subtle">Privacy</dt>
                <dd className="text-muted">
                  {privacyMode === 'private-intent'
                    ? 'Private intent preview (no circuit)'
                    : 'Transparent preview'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-warning/20 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
            Privacy properties are not active in this mock. The production interface must
            reflect the guarantees of the final audited circuits.
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <DialogClose asChild>
              <Button variant="secondary">Back to edit</Button>
            </DialogClose>
            <Button variant="accent" onClick={beginSimulation}>
              Run local simulation
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { BridgePage }
