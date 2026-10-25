import {
  AlertTriangle,
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
  Repeat2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Spotlight } from '../components/aceternity/spotlight'
import { NetworkMark, NetworkRouteMark } from '../components/network-logo'
import { Button } from '../components/ui/button'
import { WalletConnectDialog } from '../components/wallet-connect-dialog'
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

const routeCapacity: Record<NetworkId, number> = {
  ethereum: 930000,
  stellar: 610000,
}

function BridgePage() {
  const { wallets, connecting } = useWallets()
  const [from, setFrom] = useState<NetworkId>('ethereum')
  const to: NetworkId = from === 'ethereum' ? 'stellar' : 'ethereum'
  const [walletDialogNetwork, setWalletDialogNetwork] = useState<NetworkId | null>(null)
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
  const recipientIsValid =
    to === 'stellar'
      ? recipient.trim().startsWith('G') && recipient.trim().length >= 16
      : /^0x[a-fA-F0-9]{40}$/.test(recipient.trim())
  const canReview =
    Boolean(wallets[from]) &&
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

  const reverseRoute = () => {
    setFrom(to)
    setRecipient('')
    resetSimulation()
  }

  return (
    <div className="page-enter">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          <span className="h-px w-6 bg-accent/60" />
          <NetworkRouteMark from={from} to={to} />
          {networkMeta[from].shortName} → {networkMeta[to].shortName}
          <span className="h-px w-6 bg-accent/60" />
        </div>
        <h1 className="text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
          One transfer. Clear boundaries.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-muted">
          A public source deposit funds a public destination payout. The target protocol
          protects the link between them — not the on-chain actions themselves.
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
                <span className="text-xs font-medium text-muted">Wallet for this transfer</span>
                <span className="text-[10px] text-subtle">One required · one optional</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {([from, to] as NetworkId[]).map((network) => {
                  const connection = wallets[network]
                  const isConnecting = connecting === network
                  const isSource = network === from

                  return (
                    <button
                      key={network}
                      type="button"
                      onClick={() => setWalletDialogNetwork(network)}
                      className={cn(
                        'focus-ring flex min-h-18 items-center gap-3 rounded-2xl border bg-background/55 px-3.5 text-left transition-colors hover:border-border-strong',
                        isSource ? 'border-accent/30' : 'border-border',
                      )}
                    >
                      <NetworkMark network={network} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-[9px] font-semibold uppercase tracking-[0.1em]', isSource ? 'text-accent' : 'text-subtle')}>
                          {isSource ? 'Sender · required' : 'Recipient · optional'}
                        </span>
                        <span className="mt-1 block truncate text-xs font-medium text-foreground">
                          {connection
                            ? truncateAddress(connection.address)
                            : isConnecting
                              ? 'Waiting for wallet…'
                              : `Connect ${networkMeta[network].wallet}`}
                        </span>
                      </span>
                      {isConnecting ? (
                        <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-accent" />
                      ) : connection ? (
                        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
                      ) : (
                        <ArrowRight aria-hidden="true" className="size-4 text-subtle" />
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 text-[10px] leading-4 text-subtle">
                The source wallet would authorize the send. The recipient only needs a public
                destination address; connecting its wallet is a convenience, not a requirement.
              </p>
            </div>

            <div className="overflow-hidden rounded-[1.75rem] border border-border bg-background/55">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-border px-4 py-5 sm:px-6">
                <div className="flex min-w-0 flex-col items-center text-center">
                  <NetworkMark network={from} className="size-12 rounded-[18px]" />
                  <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.15em] text-accent">You send</p>
                  <p className="mt-1 truncate text-xs font-medium">{networkMeta[from].shortName}</p>
                </div>

                <button
                  type="button"
                  aria-label={`Reverse route to ${networkMeta[to].shortName} to ${networkMeta[from].shortName}`}
                  title="Reverse transfer direction"
                  onClick={reverseRoute}
                  className="focus-ring group mx-3 grid size-11 place-items-center rounded-full border border-border-strong bg-surface-raised text-muted transition-colors hover:border-accent/45 hover:text-accent sm:mx-8"
                >
                  <Repeat2 key={from} aria-hidden="true" className="route-turn size-4" />
                </button>

                <div className="flex min-w-0 flex-col items-center text-center">
                  <NetworkMark network={to} className="size-12 rounded-[18px]" />
                  <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.15em] text-subtle">They receive</p>
                  <p className="mt-1 truncate text-xs font-medium">{networkMeta[to].shortName}</p>
                </div>
              </div>

              <div className="px-5 py-6 sm:px-7">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="bridge-amount" className="text-[10px] font-medium text-subtle">Amount</label>
                  <span className="text-[10px] text-subtle">Balance · 1,250.00 USDC</span>
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <input
                    id="bridge-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                    className="min-w-0 flex-1 bg-transparent text-4xl font-medium tracking-[-0.06em] outline-none placeholder:text-subtle sm:text-5xl"
                    placeholder="0.00"
                  />
                  <button
                    type="button"
                    className="focus-ring mb-1 rounded-full border border-border px-3 py-1.5 text-[10px] font-semibold text-accent hover:border-accent/40"
                    onClick={() => setAmount('1250')}
                  >
                    MAX
                  </button>
                  <span className="mb-1 rounded-full bg-surface-raised px-3 py-1.5 text-xs font-semibold">USDC</span>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-[11px]">
                  <span className="text-subtle">Estimated at destination</span>
                  <span className="font-mono">≈ {compactNumber.format(quote.amountOut)} USDC</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <span className="text-subtle">Illustrative {networkMeta[to].shortName} capacity</span>
                  <span className="font-mono text-muted">{compactNumber.format(routeCapacity[to])} USDC</span>
                </div>
              </div>

              <div className="border-t border-border px-5 py-5 sm:px-7">
                <label htmlFor="recipient" className="block text-[10px] font-medium text-subtle">
                  Receiving {networkMeta[to].shortName} address
                </label>
                <div className="mt-3 flex items-center rounded-xl border border-border bg-surface/60 px-3 focus-within:border-accent/50">
                  <input
                    id="recipient"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    aria-invalid={recipient.length > 0 && !recipientIsValid}
                    className="min-w-0 flex-1 bg-transparent py-3 font-mono text-xs outline-none placeholder:text-subtle"
                    placeholder={to === 'stellar' ? 'G…' : '0x…'}
                  />
                  <button
                    type="button"
                    aria-label={`Use a demo ${networkMeta[to].shortName} recipient`}
                    title="Use demo recipient"
                    className="focus-ring rounded-lg p-2 text-subtle hover:text-foreground"
                    onClick={() => setRecipient(
                      to === 'stellar'
                        ? 'GCFX4N6W4FZDB3A7XUVKQ5BIRXW3S2E5HUEXAMPLEADDR'
                        : '0x1111111111111111111111111111111111111111',
                    )}
                  >
                    <Copy aria-hidden="true" className="size-4" />
                  </button>
                </div>
                {recipient.length > 0 && !recipientIsValid && (
                  <p className="mt-2 text-[10px] text-danger">
                    {to === 'stellar'
                      ? 'Enter a Stellar public address beginning with G.'
                      : 'Enter a 42-character Ethereum address beginning with 0x.'}
                  </p>
                )}
                {wallets[to] && recipient !== wallets[to]?.address && (
                  <button
                    type="button"
                    className="focus-ring mt-2 rounded-md text-[10px] font-medium text-accent hover:text-accent-strong"
                    onClick={() => setRecipient(wallets[to]?.address ?? '')}
                  >
                    Use connected {networkMeta[to].wallet} address
                  </button>
                )}
                {wallets[to] && recipient === wallets[to]?.address && (
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] text-success">
                    <CheckCircle2 aria-hidden="true" className="size-3" />
                    Filled from connected {networkMeta[to].wallet}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background/40 p-4">
                <p className="text-[10px] text-subtle">Settlement visibility</p>
                <p className="mt-2 flex items-center gap-2 font-medium">
                  <Info aria-hidden="true" className="size-3.5 text-muted" />
                  Deposit + payout are public
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-4">
                <p className="text-[10px] text-subtle">Link protection</p>
                <p className="mt-2 flex items-center gap-2 font-medium">
                  <LockKeyhole aria-hidden="true" className="size-3.5 text-warning" />
                  Planned · circuit missing
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
                <span className="text-subtle">Destination vault capacity</span>
                <span className="font-mono text-muted">{compactNumber.format(routeCapacity[to])} USDC</span>
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
                <div className="flex justify-between gap-4">
                  <dt className="text-subtle">Public event policy</dt>
                  <dd>Not implemented</dd>
                </div>
              </dl>
            </details>

            <Button
              variant="accent"
              size="lg"
              className="w-full"
              disabled={Boolean(wallets[from]) && !canReview}
              onClick={() => wallets[from] ? setReviewOpen(true) : setWalletDialogNetwork(from)}
            >
              <ShieldCheck aria-hidden="true" />
              {wallets[from]
                ? recipientIsValid
                  ? 'Review test transfer'
                  : `Enter ${networkMeta[to].shortName} recipient`
                : `Connect ${networkMeta[from].wallet} to send`}
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
                  Amounts, sender and recipient addresses remain public. The planned proof
                  protects the note and protocol-level link; timing or amount correlation may remain.
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
              <div className="flex justify-between gap-4"><dt className="text-subtle">On-chain visibility</dt><dd>Public deposit + payout</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">ZK link protection</dt><dd className="text-warning">Not active</dd></div>
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

      <WalletConnectDialog
        network={walletDialogNetwork}
        open={Boolean(walletDialogNetwork)}
        onOpenChange={(open) => !open && setWalletDialogNetwork(null)}
        purpose={walletDialogNetwork === from ? 'required' : 'optional'}
      />
    </div>
  )
}

export { BridgePage }
