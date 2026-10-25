import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  FileKey2,
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
import { useWallets } from '../components/wallet-context'
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
  type TransferProgressStep,
} from '../lib/mock-bridge'
import { cn } from '../lib/utils'
import { truncateAddress } from '../lib/wallet-adapters'

const compactNumber = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

type RunStatus = 'idle' | 'running' | 'complete'

function NetworkMark({ network }: { network: NetworkId }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-2xl border text-sm font-semibold',
        network === 'stellar'
          ? 'border-foreground/15 bg-foreground text-background'
          : 'border-accent/30 bg-accent/10 text-accent',
      )}
    >
      {networkMeta[network].mark}
    </span>
  )
}

function BridgePage() {
  const from: NetworkId = 'ethereum'
  const to: NetworkId = 'stellar'
  const { wallets, connecting, errors, connectWallet, disconnectWallet } = useWallets()
  const [amount, setAmount] = useState('250')
  const [recipient, setRecipient] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [progress, setProgress] = useState<TransferProgressStep[]>(() =>
    mockBridgeAdapter.createProgress(),
  )

  const numericAmount = Number.parseFloat(amount) || 0
  const quote = useMemo(
    () => mockBridgeAdapter.getQuote(numericAmount),
    [numericAmount],
  )
  const recipientIsValid = recipient.trim().startsWith('G') && recipient.trim().length >= 16
  const canReview =
    Boolean(wallets.stellar && wallets.ethereum) &&
    numericAmount > 0 &&
    recipientIsValid &&
    runStatus !== 'running'

  useEffect(() => {
    if (runStatus !== 'running') return undefined

    let activeIndex = 0
    const interval = window.setInterval(() => {
      activeIndex += 1
      if (activeIndex >= progress.length) {
        setProgress((steps) => steps.map((step) => ({ ...step, status: 'complete' })))
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
    }, 1100)

    return () => window.clearInterval(interval)
  }, [runStatus, progress.length])

  const beginSimulation = () => {
    setProgress(
      mockBridgeAdapter.createProgress().map((step, index) => ({
        ...step,
        status: index === 0 ? ('active' as const) : ('idle' as const),
      })),
    )
    setRunStatus('running')
    setReviewOpen(false)
  }

  const resetSimulation = () => {
    setProgress(mockBridgeAdapter.createProgress())
    setRunStatus('idle')
  }

  return (
    <div className="page-enter">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          <span className="h-px w-6 bg-accent/60" />
          Ethereum → Stellar
          <span className="h-px w-6 bg-accent/60" />
        </div>
        <h1 className="text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
          One transfer. Clear boundaries.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-muted">
          Connect MetaMask and Freighter on test networks, then explore the intended
          bridge workflow. Proof generation and asset movement are not connected.
        </p>
      </div>

      <div className="mx-auto grid max-w-[980px] items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <section
          aria-labelledby="transfer-title"
          className="hairline-card relative overflow-hidden rounded-[2rem] border border-border bg-surface"
        >
          <Spotlight className="-right-44 -top-52" />
          <div className="relative flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
            <div>
              <h2 id="transfer-title" className="text-base font-semibold tracking-[-0.02em]">
                New test transfer
              </h2>
              <p className="mt-1 text-xs text-subtle">Review everything before the simulated flow.</p>
            </div>
            <span className="rounded-full border border-warning/25 bg-warning/[0.06] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-warning">
              Prototype
            </span>
          </div>

          <div className="relative space-y-6 p-5 sm:p-7">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Wallet connections</span>
                <span className="text-[10px] text-subtle">Injected extensions · public addresses only</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['ethereum', 'stellar'] as NetworkId[]).map((network) => {
                  const connection = wallets[network]
                  const isConnecting = connecting === network

                  return (
                    <button
                      key={network}
                      type="button"
                      onClick={() =>
                        connection
                          ? disconnectWallet(network)
                          : void connectWallet(network)
                      }
                      disabled={Boolean(connecting)}
                      className="focus-ring flex min-h-17 items-center gap-3 rounded-2xl border border-border bg-background/55 px-3.5 text-left transition-colors hover:border-border-strong disabled:cursor-default disabled:opacity-100"
                    >
                      <NetworkMark network={network} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] text-subtle">
                          {networkMeta[network].wallet} · {networkMeta[network].name}
                        </span>
                        <span className="mt-1 block truncate text-xs font-medium text-foreground">
                          {connection
                            ? truncateAddress(connection.address)
                            : isConnecting
                              ? 'Waiting for wallet…'
                              : 'Connect wallet'}
                        </span>
                      </span>
                      {isConnecting ? (
                        <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-accent" />
                      ) : connection ? (
                        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
                      ) : (
                        <WalletCards aria-hidden="true" className="size-4 text-subtle" />
                      )}
                    </button>
                  )
                })}
              </div>
              {(errors.ethereum || errors.stellar) && (
                <div role="alert" className="mt-3 space-y-1 text-xs text-danger">
                  {errors.ethereum && <p>MetaMask: {errors.ethereum}</p>}
                  {errors.stellar && <p>Freighter: {errors.stellar}</p>}
                </div>
              )}
            </div>

            <div className="relative space-y-2">
              <div className="rounded-3xl border border-border bg-background/55 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <NetworkMark network={from} />
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">From</p>
                      <p className="mt-1 text-sm font-medium">{networkMeta[from].name}</p>
                    </div>
                  </div>
                  <span className="rounded-lg border border-border px-2 py-1 text-[9px] font-medium text-subtle">USDC</span>
                </div>
                <div className="mt-5 flex items-end gap-3 border-t border-border pt-4">
                  <label htmlFor="bridge-amount" className="sr-only">Amount</label>
                  <input
                    id="bridge-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                    className="min-w-0 flex-1 bg-transparent text-3xl font-medium tracking-[-0.045em] outline-none placeholder:text-subtle"
                    placeholder="0.00"
                  />
                  <button
                    type="button"
                    className="focus-ring rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent hover:bg-accent/10"
                    onClick={() => setAmount('1250')}
                  >
                    Max
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-subtle">Illustrative balance: 1,250.00 USDC</p>
              </div>

              <button
                type="button"
                disabled
                aria-label="Reverse route unavailable in this prototype"
                title="Reverse route is not supported"
                className="absolute left-1/2 top-1/2 z-10 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl border border-border-strong bg-surface-raised text-subtle opacity-80"
              >
                <ArrowDown aria-hidden="true" className="size-4" />
              </button>

              <div className="rounded-3xl border border-border bg-background/55 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <NetworkMark network={to} />
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">To</p>
                      <p className="mt-1 text-sm font-medium">{networkMeta[to].name}</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm text-foreground">≈ {compactNumber.format(quote.amountOut)}</span>
                </div>
                <div className="mt-5 border-t border-border pt-4">
                  <label htmlFor="recipient" className="mb-2 block text-[10px] font-medium text-subtle">
                    Receiving Stellar address
                  </label>
                  <div className="flex items-center">
                    <input
                      id="recipient"
                      value={recipient}
                      onChange={(event) => setRecipient(event.target.value)}
                      aria-invalid={recipient.length > 0 && !recipientIsValid}
                      className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-subtle"
                      placeholder="G…"
                    />
                    <button
                      type="button"
                      aria-label="Use a demo Stellar recipient"
                      title="Use demo recipient"
                      className="focus-ring rounded-lg p-2 text-subtle hover:bg-surface-raised hover:text-foreground"
                      onClick={() => setRecipient('GCFX4N6W4FZDB3A7XUVKQ5BIRXW3S2E5HUEXAMPLEADDR')}
                    >
                      <Copy aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                  {recipient.length > 0 && !recipientIsValid && (
                    <p className="mt-2 text-[10px] text-danger">Enter a Stellar public address beginning with G.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background/40 p-4">
                <p className="text-[10px] text-subtle">Privacy status</p>
                <p className="mt-2 flex items-center gap-2 font-medium">
                  <LockKeyhole aria-hidden="true" className="size-3.5 text-warning" />
                  Not active · circuit missing
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-4">
                <p className="text-[10px] text-subtle">Network compatibility</p>
                <p className="mt-2 flex items-center gap-2 font-medium">
                  <CheckCircle2 aria-hidden="true" className="size-3.5 text-success" />
                  Demo route configured
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/35 p-4 text-xs">
              <div className="flex items-center justify-between gap-4">
                <span className="text-subtle">Estimated received</span>
                <span className="font-mono font-medium">{compactNumber.format(quote.amountOut)} USDC</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-subtle">Illustrative fees</span>
                <span className="font-mono text-muted">{compactNumber.format(quote.networkFee + quote.protocolFee)} USDC</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-subtle">Simulation duration</span>
                <span className="font-mono text-muted">~4 seconds</span>
              </div>
            </div>

            <details className="group rounded-2xl border border-border bg-background/30 px-4 py-3">
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-between rounded-lg text-xs font-medium">
                Advanced protocol details
                <ChevronDown aria-hidden="true" className="size-4 text-subtle transition-transform group-open:rotate-180" />
              </summary>
              <dl className="mt-4 space-y-3 border-t border-border pt-4 text-[11px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-subtle">Ethereum chain ID</dt>
                  <dd className="font-mono">11155111 · Sepolia</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-subtle">Stellar network</dt>
                  <dd className="font-mono">TESTNET</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-subtle">Bridge contract</dt>
                  <dd>Not connected</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-subtle">Circuit</dt>
                  <dd>Not connected</dd>
                </div>
              </dl>
            </details>

            <Button variant="accent" size="lg" className="w-full" disabled={!canReview} onClick={() => setReviewOpen(true)}>
              <ShieldCheck aria-hidden="true" />
              {wallets.stellar && wallets.ethereum ? 'Start test transfer' : 'Connect both wallets'}
            </Button>
            <p className="text-center text-[10px] leading-4 text-subtle">
              Never enter a private key or seed phrase. This prototype never requests one.
            </p>
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="rounded-3xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="progress-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">Prototype trace</p>
                <h2 id="progress-title" className="mt-2 text-base font-semibold tracking-[-0.02em]">
                  {runStatus === 'complete' ? 'Local simulation complete' : runStatus === 'running' ? 'Simulating workflow' : 'Ready for review'}
                </h2>
              </div>
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1 size-2 rounded-full',
                  runStatus === 'complete' ? 'bg-success' : runStatus === 'running' ? 'dot-pulse bg-accent' : 'bg-subtle',
                )}
              />
            </div>

            <ol className="mt-6" aria-live="polite">
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
                    <p className={cn('text-xs font-medium', step.status === 'idle' ? 'text-muted' : 'text-foreground')}>
                      {step.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-subtle">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>

            {runStatus === 'complete' && (
              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-success/20 bg-success/[0.055] p-4 text-[11px] leading-5 text-muted">
                  UI flow completed locally. No transaction hash, proof ID, explorer link,
                  or on-chain confirmation exists.
                </div>
                <details className="group rounded-2xl border border-border px-4 py-3">
                  <summary className="focus-ring flex cursor-pointer list-none items-center justify-between rounded-lg text-xs font-medium">
                    Technical details
                    <ChevronDown aria-hidden="true" className="size-4 text-subtle transition-transform group-open:rotate-180" />
                  </summary>
                  <dl className="mt-4 space-y-2 border-t border-border pt-4 text-[10px]">
                    <div className="flex justify-between gap-3"><dt className="text-subtle">Transaction hash</dt><dd>Not created</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-subtle">Proof identifier</dt><dd>Not created</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-subtle">Verification</dt><dd>Not performed</dd></div>
                  </dl>
                </details>
                <Button variant="secondary" size="sm" className="w-full" onClick={resetSimulation}>
                  <RotateCcw aria-hidden="true" />
                  Reset simulation
                </Button>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-warning/20 bg-warning/[0.045] p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="text-xs font-medium">Privacy boundary</p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  ZK proofs and disclosure controls are not implemented. This screen demonstrates product states only.
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review test transfer</DialogTitle>
            <DialogDescription>
              This starts a timed interface simulation only. No additional wallet prompt, signature,
              proof, transaction, or asset movement will occur.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-border bg-background/50 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <NetworkMark network={from} />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-subtle">Send</p>
                  <p className="mt-1 text-sm font-medium">{compactNumber.format(numericAmount)} USDC</p>
                </div>
              </div>
              <ArrowRight aria-hidden="true" className="size-4 text-subtle" />
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-subtle">Receive</p>
                  <p className="mt-1 text-sm font-medium">{compactNumber.format(quote.amountOut)} USDC</p>
                </div>
                <NetworkMark network={to} />
              </div>
            </div>
            <div className="my-5 h-px bg-border" />
            <dl className="space-y-3 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-subtle">Route</dt><dd>{networkMeta[from].name} → {networkMeta[to].name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Recipient</dt><dd className="max-w-[230px] truncate font-mono">{recipient}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Privacy</dt><dd className="text-warning">Not active</dd></div>
            </dl>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            The completion state will remain a local prototype result, not a blockchain success state.
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <DialogClose asChild><Button variant="secondary">Back to edit</Button></DialogClose>
            <Button variant="accent" onClick={beginSimulation}>
              <FileKey2 aria-hidden="true" />
              Run local simulation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { BridgePage }
