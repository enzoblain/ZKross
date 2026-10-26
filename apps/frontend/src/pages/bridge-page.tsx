import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  FileKey2,
  Info,
  LoaderCircle,
  LockKeyhole,
  Repeat2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { Spotlight } from '../components/aceternity/spotlight'
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
import { formatMessage, formatNote, parseUnits, toNoteAmount } from '../lib/amounts'
import { createProgress, createTransfer, identityOf, runTransfer, type FlowStepId } from '../lib/bridge-flow'
import { chooseIdentity, identity, type Identity } from '../lib/keys'
import { chainId, explorer, isDeployed, poolAddress, protocol } from '../lib/config'
import { networkMeta, otherNetwork, validAddress, type NetworkId, type TransferProgressStep } from '../lib/networks'
import { type Via, pools } from '../lib/pools'
import { RELAYER_URL, relayerHealth } from '../lib/relayer'
import * as store from '../lib/store'
import type { Transfer } from '../lib/store'
import { cn } from '../lib/utils'
import { truncateAddress } from '../lib/wallet-adapters'

type RunStatus = 'idle' | 'running' | 'complete' | 'failed'

const unfinishedTransfer = () =>
  store.transfers().find((item) => !store.isFinished(item))

function stepTransactions(transfer: Transfer | null, step: FlowStepId) {
  if (!transfer) return []
  const source = transfer.from
  const destination = transfer.to
  const rows: { hash: string; network: NetworkId; label: string }[] = []
  if (step === 'deposit') {
    if (transfer.txs.approve) rows.push({ hash: transfer.txs.approve, network: source, label: 'Approval' })
    if (transfer.txs.deposit) rows.push({ hash: transfer.txs.deposit, network: source, label: 'Deposit' })
  }
  if (step === 'bridgeOut' && transfer.txs.bridgeOut) {
    rows.push({ hash: transfer.txs.bridgeOut, network: source, label: 'Bridge out' })
  }
  if (step === 'claim' && transfer.txs.bridgeIn) {
    rows.push({ hash: transfer.txs.bridgeIn, network: destination, label: 'Claim' })
  }
  if (step === 'withdraw') {
    if (transfer.txs.trustline) rows.push({ hash: transfer.txs.trustline, network: destination, label: 'Trustline' })
    if (transfer.txs.withdraw) rows.push({ hash: transfer.txs.withdraw, network: destination, label: 'Withdrawal' })
  }
  return rows
}

function BridgePage() {
  const { wallets, connecting } = useWallets()
  const [initial] = useState(() => unfinishedTransfer())
  const [from, setFrom] = useState<NetworkId>(initial?.from ?? 'ethereum')
  const to = otherNetwork(from)
  const [walletDialogNetwork, setWalletDialogNetwork] = useState<NetworkId | null>(null)
  const [amount, setAmount] = useState(initial ? formatMessage(BigInt(initial.amount)) : '')
  const [recipient, setRecipient] = useState(initial?.recipient ?? '')
  const [keepPrivate, setKeepPrivate] = useState(Boolean(initial?.keepPrivate))
  const [reviewOpen, setReviewOpen] = useState(false)
  const [transfer, setTransfer] = useState<Transfer | null>(initial ?? null)
  const [runStatus, setRunStatus] = useState<RunStatus>(initial?.error ? 'failed' : 'idle')
  const [progress, setProgress] = useState<TransferProgressStep[]>(() =>
    createProgress(initial?.from ?? 'ethereum', initial?.to ?? 'stellar', initial),
  )
  const [liveReads, setLiveReads] = useState<{
    key: string
    publicBalance: bigint | null
    destinationCapacity: bigint | null
    error: string
  }>({ key: '', publicBalance: null, destinationCapacity: null, error: '' })
  const [via, setVia] = useState<Via>(initial?.via ?? 'relayer')
  const [relayerAccounts, setRelayerAccounts] = useState<Record<NetworkId, string | null> | null | undefined>(undefined)
  const [id, setId] = useState<Identity | null>(() => identity())
  const [identityError, setIdentityError] = useState('')
  // Spendable: the identity's notes. Notes of other keys stay where they are.
  const privateBalance = useSyncExternalStore(
    store.subscribe,
    () => (id ? store.balanceOf(from, id.pk) : 0n),
    () => 0n,
  )
  const otherKeysBalance = useSyncExternalStore(
    store.subscribe,
    () => store.privateBalance(from),
    () => 0n,
  ) - privateBalance

  const sourceWallet = wallets[from]
  // Without a chosen identity, the source wallet becomes it at the first transfer.
  const identityWallet = id ? wallets[id.network] : sourceWallet
  const identityReady = Boolean(identityWallet && (!id || identityWallet.address === id.address))
  // The destination wallet is never connected: the user types the address.
  const recipientValue = recipient
  const messageAmount = useMemo(() => parseUnits(amount, 6), [amount])
  const recipientIsValid = keepPrivate || validAddress(to, recipientValue)
  const deploymentReady = isDeployed(from) && isDeployed(to)
  const readKey = `${from}:${sourceWallet?.address ?? ''}:${to}`
  const publicBalance = liveReads.key === readKey ? liveReads.publicBalance : null
  const destinationCapacity = liveReads.key === readKey ? liveReads.destinationCapacity : null
  const readError = liveReads.key === readKey ? liveReads.error : ''
  // The source wallet is needed only to deposit what the private balance lacks.
  const needsDeposit = Boolean(messageAmount && toNoteAmount(from, messageAmount) > privateBalance)
  const needsSource = needsDeposit || via === 'wallet'
  const canReview = Boolean(
    identityReady &&
      (sourceWallet || !needsSource) &&
      messageAmount &&
      messageAmount > 0n &&
      recipientIsValid &&
      deploymentReady &&
      runStatus !== 'running',
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [balanceResult, capacityResult] = await Promise.allSettled([
        sourceWallet ? pools[from].usdcBalance(sourceWallet.address) : Promise.resolve(null),
        isDeployed(to) ? pools[to].poolUsdcBalance() : Promise.resolve(null),
      ])
      if (cancelled) return
      const error = [balanceResult, capacityResult]
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason))
        .join(' ')
      setLiveReads({
        key: readKey,
        publicBalance: balanceResult.status === 'fulfilled' ? balanceResult.value : null,
        destinationCapacity: capacityResult.status === 'fulfilled' ? capacityResult.value : null,
        error,
      })
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [from, readKey, sourceWallet, to])

  useEffect(() => {
    let cancelled = false
    relayerHealth().then((h) => {
      if (!cancelled) setRelayerAccounts(h ? { stellar: h.accounts.stellar, ethereum: h.accounts.sepolia } : null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const relayerDown = relayerAccounts === null
  const relayerName = (network: NetworkId) =>
    `The relayer${relayerAccounts?.[network] ? ` (${truncateAddress(relayerAccounts[network]!)})` : ''}`
  const submitter = (network: NetworkId, wallet: string | undefined) =>
    via === 'relayer' ? relayerName(network) : `Your wallet${wallet ? ` (${truncateAddress(wallet)})` : ''}`

  const updateProgress = (step: FlowStepId, status: TransferProgressStep['status'], description?: string) => {
    setProgress((current) =>
      current.map((item) =>
        item.id === step ? { ...item, status, description: description ?? item.description } : item,
      ),
    )
  }

  const execute = async (next: Transfer) => {
    // A transfer started from the private balance may need a deposit after all.
    if (!next.sender && sourceWallet) next.sender = sourceWallet.address
    setTransfer({ ...next })
    setProgress(createProgress(next.from, next.to, next))
    setRunStatus('running')
    setReviewOpen(false)
    try {
      await runTransfer(next, (step, status, description) => {
        updateProgress(step, status, description)
        setTransfer({ ...next })
      })
      setTransfer({ ...next })
      setRunStatus('complete')
    } catch {
      setTransfer({ ...next })
      setRunStatus('failed')
    }
  }

  const makeIdentity = async (network: NetworkId) => {
    const wallet = wallets[network]
    if (!wallet) return null
    setIdentityError('')
    try {
      const chosen = await chooseIdentity({ network, address: wallet.address })
      setId(chosen)
      return chosen
    } catch (error) {
      setIdentityError(error instanceof Error ? error.message : String(error))
      return null
    }
  }

  const beginTransfer = async () => {
    if (!messageAmount || !canReview) return
    const chosen = id ?? (await makeIdentity(from))
    if (!chosen) return
    const next = createTransfer({
      from,
      to,
      amount: messageAmount,
      identity: chosen,
      sender: needsSource ? sourceWallet?.address : undefined,
      recipient: recipientValue.trim(),
      keepPrivate,
      via,
    })
    void execute(next)
  }

  const resetTransfer = () => {
    setTransfer(null)
    setProgress(createProgress(from, to))
    setRunStatus('idle')
    setAmount('')
    setRecipient('')
  }

  const reverseRoute = () => {
    if (runStatus === 'running') return
    const nextFrom = to
    const nextTo = from
    setFrom(nextFrom)
    setTransfer(null)
    setProgress(createProgress(nextFrom, nextTo))
    setRunStatus('idle')
    setAmount('')
    setRecipient('')
  }

  const useMaximum = () => {
    if (publicBalance === null) return
    setAmount(formatMessage(publicBalance / protocol.scale[from]))
  }

  const currentError = identityError || (transfer?.error ?? readError)
  const amountLabel = messageAmount && messageAmount > 0n ? formatMessage(messageAmount) : '0.00'
  const latestCanResume = Boolean(
    transfer &&
      !store.isFinished(transfer) &&
      wallets[identityOf(transfer).network]?.address === identityOf(transfer).address &&
      (!transfer.sender || sourceWallet?.address === transfer.sender) &&
      deploymentReady &&
      runStatus !== 'running',
  )

  return (
    <div className="page-enter">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          <span className="h-px w-6 bg-accent/60" />
          <NetworkRouteMark from={from} to={to} />
          Self-bridge · {networkMeta[from].shortName} → {networkMeta[to].shortName}
          <span className="h-px w-6 bg-accent/60" />
        </div>
        <h1 className="text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">Move your USDC. Break the public link.</h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-muted">Move value between wallets you control. Deposits and withdrawals stay public; Groth16 proofs hide the protocol-level link between the two pool positions.</p>
      </div>

      <div className="mx-auto grid max-w-[1040px] items-start gap-5 lg:grid-cols-[minmax(0,1.38fr)_minmax(300px,0.62fr)]">
        <section aria-labelledby="transfer-title" className="hairline-card relative overflow-hidden rounded-[2rem] border border-border bg-surface">
          <Spotlight className="-right-44 -top-52" />
          <div className="relative flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
            <div>
              <h2 id="transfer-title" className="text-base font-semibold tracking-[-0.02em]">Private self-transfer</h2>
              <p className="mt-1 text-xs text-subtle">Testnet contracts · real wallet confirmations and proofs</p>
            </div>
            <span className="rounded-full border border-accent/25 bg-accent/[0.06] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">Testnet</span>
          </div>

          <div className="relative space-y-6 p-5 sm:p-7">
            <div>
              <div className="mb-3 flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-muted">Wallets you control</span>
                <span className="text-[10px] text-subtle">No {networkMeta[to].shortName} wallet needed</span>
              </div>
              <div className={cn('grid gap-2', id && id.network !== from && 'sm:grid-cols-2')}>
                {(id && id.network !== from ? [id.network, from] : [from]).map((network) => {
                  const connection = wallets[network]
                  const isConnecting = connecting === network
                  const isIdentity = id ? network === id.network : true
                  const isSource = network === from
                  const role = isIdentity && isSource ? 'Identity · note key + deposit' : isIdentity ? 'Identity · note key' : needsSource ? 'Source · deposit' : 'Source · deposit (not needed: private balance)'
                  const wrongAccount = id && isIdentity && connection && connection.address !== id.address
                  return (
                    <button
                      key={network}
                      type="button"
                      onClick={() => setWalletDialogNetwork(network)}
                      className={cn('focus-ring flex min-h-20 items-center gap-3 rounded-2xl border bg-background/55 px-3.5 text-left transition-colors hover:border-border-strong', connection ? 'border-success/25' : isSource ? 'border-accent/30' : 'border-border')}
                    >
                      <NetworkMark network={network} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-[9px] font-semibold uppercase tracking-[0.1em]', isIdentity || needsSource ? 'text-accent' : 'text-subtle')}>{role}</span>
                        <span className={cn('mt-1 block truncate text-xs font-medium', wrongAccount ? 'text-warning' : 'text-foreground')}>{wrongAccount ? `Switch to ${truncateAddress(id.address)}` : connection ? truncateAddress(connection.address) : isConnecting ? 'Waiting for wallet…' : `Connect ${networkMeta[network].wallet}${id && isIdentity ? ` (${truncateAddress(id.address)})` : ''}`}</span>
                      </span>
                      {isConnecting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-accent" /> : connection ? <CheckCircle2 aria-hidden="true" className="size-4 text-success" /> : <ArrowRight aria-hidden="true" className="size-4 text-subtle" />}
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 rounded-2xl border border-border bg-background/40 p-3">
                <p className="text-[10px] font-medium text-foreground">Private identity</p>
                <p className="mt-1 text-[10px] leading-4 text-subtle">
                  {id
                    ? <>Your note key comes from your {networkMeta[id.network].wallet} wallet {truncateAddress(id.address)}, for every transfer in both directions: notes you receive on either chain stay spendable, including to bridge back from your private balance.</>
                    : <>Chosen once: your {networkMeta[from].wallet} wallet will sign your note key at your first transfer, and the same key will be used on both chains.</>}
                  {otherKeysBalance > 0n && <> {formatNote(from, otherKeysBalance)} USDC on {networkMeta[from].shortName} belongs to another wallet’s key: make that wallet your identity to spend it.</>}
                </p>
                {(['ethereum', 'stellar'] as NetworkId[])
                  .filter((network) => wallets[network] && !(id && id.network === network && id.address === wallets[network]!.address))
                  .map((network) => (
                    <button key={network} type="button" disabled={runStatus === 'running'} onClick={() => void makeIdentity(network)} className="focus-ring mt-2 mr-2 rounded-lg border border-border px-2.5 py-1 text-[10px] font-medium text-accent hover:border-accent/40 disabled:opacity-50">
                      {id ? 'Switch identity to' : 'Use'} {networkMeta[network].wallet} {truncateAddress(wallets[network]!.address)}
                    </button>
                  ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/40 p-3">
                <div className="min-w-0"><p className="text-[10px] font-medium text-foreground">Bridge out sent by</p><p className="mt-1 text-[10px] leading-4 text-subtle">{via === 'relayer' ? 'The relayer submits it from its own account, so your wallet does not appear on-chain for it.' : 'Your source wallet submits and pays for it, so it appears on-chain.'} A deposit, when your private balance lacks the amount, is sent by your source wallet; the claim and withdrawal always by the relayer.</p></div>
                <div role="radiogroup" aria-label="Who sends the transactions" className="flex gap-1 rounded-xl border border-border bg-background p-1">
                  {([['relayer', 'Relayer'], ['wallet', 'Send myself']] as [Via, string][]).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={via === value} disabled={runStatus === 'running'} onClick={() => setVia(value)} className={cn('focus-ring rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors disabled:opacity-50', via === value ? 'bg-surface-raised text-foreground' : 'text-muted hover:text-foreground')}>{label}</button>
                  ))}
                </div>
              </div>
              {relayerDown && <p role="status" className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-warning"><AlertTriangle aria-hidden="true" className="mt-0.5 size-3 shrink-0" />The relayer at {RELAYER_URL} is not answering. It sends the claim and withdrawal: start it (services/bridge, npm run service).</p>}
            </div>

            <div className="overflow-hidden rounded-[1.75rem] border border-border bg-background/55">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-border px-4 py-5 sm:px-6">
                <div className="flex min-w-0 flex-col items-center text-center">
                  <NetworkMark network={from} className="size-12 rounded-[18px]" />
                  <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.15em] text-accent">From your wallet</p>
                  <p className="mt-1 truncate text-xs font-medium">{networkMeta[from].shortName}</p>
                </div>
                <button type="button" disabled={runStatus === 'running'} aria-label={`Reverse route to ${networkMeta[to].shortName} to ${networkMeta[from].shortName}`} title="Reverse transfer direction" onClick={reverseRoute} className="focus-ring group mx-3 grid size-11 place-items-center rounded-full border border-border-strong bg-surface-raised text-muted transition-colors hover:border-accent/45 hover:text-accent disabled:opacity-40 sm:mx-8">
                  <Repeat2 key={from} aria-hidden="true" className="route-turn size-4" />
                </button>
                <div className="flex min-w-0 flex-col items-center text-center">
                  <NetworkMark network={to} className="size-12 rounded-[18px]" />
                  <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.15em] text-subtle">To your address</p>
                  <p className="mt-1 truncate text-xs font-medium">{networkMeta[to].shortName}</p>
                </div>
              </div>

              <div className="px-5 py-6 sm:px-7">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="bridge-amount" className="text-[10px] font-medium text-subtle">Amount</label>
                  <span className="text-right text-[10px] text-subtle">Public {publicBalance === null ? '—' : formatNote(from, publicBalance)} · Private {formatNote(from, privateBalance)} USDC</span>
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <input id="bridge-amount" inputMode="decimal" value={amount} disabled={runStatus === 'running'} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} className="min-w-0 flex-1 bg-transparent text-4xl font-medium tracking-[-0.06em] outline-none placeholder:text-subtle disabled:opacity-60 sm:text-5xl" placeholder="0.00" />
                  <button type="button" disabled={publicBalance === null || runStatus === 'running'} className="focus-ring mb-1 rounded-full border border-border px-3 py-1.5 text-[10px] font-semibold text-accent hover:border-accent/40 disabled:opacity-40" onClick={useMaximum}>MAX</button>
                  <span className="mb-1 rounded-full bg-surface-raised px-3 py-1.5 text-xs font-semibold">USDC</span>
                </div>
                {amount && messageAmount === null && <p className="mt-3 text-[10px] text-danger">Use at most 6 decimal places. Bridge amounts are exact and never rounded.</p>}
                <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-[11px]"><span className="text-subtle">Received after claim + withdrawal</span><span className="font-mono">{amountLabel} USDC</span></div>
                <div className="mt-2 flex items-center justify-between text-[10px]"><span className="text-subtle">Live destination pool balance</span><span className="font-mono text-muted">{destinationCapacity === null ? 'Unavailable' : `${formatNote(to, destinationCapacity)} USDC`}</span></div>
              </div>

              <div className="border-t border-border px-5 py-5 sm:px-7">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="recipient" className="block text-[10px] font-medium text-subtle">Your public {networkMeta[to].shortName} withdrawal address</label>
                  <label className="flex items-center gap-1.5 text-[10px] text-muted"><input type="checkbox" checked={keepPrivate} disabled={runStatus === 'running'} onChange={(event) => setKeepPrivate(event.target.checked)} />Keep it private on {networkMeta[to].shortName}</label>
                </div>
                {keepPrivate ? <p className="mt-3 text-[10px] leading-4 text-subtle">No withdrawal: the claimed note stays in your {networkMeta[to].shortName} private balance, owned by your note key, ready to bridge back, or to withdraw any amount later from the Balance page.</p> : <>
                <div className="mt-3 flex items-center rounded-xl border border-border bg-surface/60 px-3 focus-within:border-accent/50">
                  <input id="recipient" value={recipientValue} disabled={runStatus === 'running'} onChange={(event) => setRecipient(event.target.value)} aria-invalid={recipientValue.length > 0 && !recipientIsValid} className="min-w-0 flex-1 bg-transparent py-3 font-mono text-xs outline-none placeholder:text-subtle disabled:opacity-60" placeholder={to === 'stellar' ? 'G…' : '0x…'} />
                </div>
                {recipientValue.length > 0 && !recipientIsValid && <p className="mt-2 text-[10px] text-danger">Enter a valid {networkMeta[to].shortName} public address.</p>}
                {to === 'stellar' && <p className="mt-2 text-[10px] leading-4 text-subtle">A Stellar address must exist and hold a USDC trustline before it can receive the withdrawal.</p>}
                </>}
              </div>

              <div className="border-t border-border px-5 py-5 sm:px-7">
                <p className="text-[10px] font-medium text-subtle">Account visible on-chain as the sender</p>
                <dl className="mt-3 space-y-2 text-[11px]">
                  <div className="flex justify-between gap-4"><dt className="text-subtle">Deposit · {networkMeta[from].shortName}</dt><dd className="text-right font-mono">{needsDeposit ? `Your wallet${sourceWallet ? ` (${truncateAddress(sourceWallet.address)})` : ''}` : 'None: private balance'}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-subtle">Bridge out · {networkMeta[from].shortName}</dt><dd className="text-right font-mono">{submitter(from, sourceWallet?.address)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-subtle">Claim + withdrawal · {networkMeta[to].shortName}</dt><dd className="text-right font-mono">{relayerName(to)}</dd></div>
                </dl>
              </div>
            </div>

            {!deploymentReady && (
              <div role="status" className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                <p><span className="font-medium text-foreground">Sepolia pool is not deployed yet.</span> Contract reads that do not require it remain available, but sending is disabled until `deployments.json` contains `sepolia.zkross`.</p>
              </div>
            )}

            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background/40 p-4"><p className="text-[10px] text-subtle">Public boundary</p><p className="mt-2 flex items-center gap-2 font-medium"><Info aria-hidden="true" className="size-3.5 text-muted" />Entry + final exit stay visible</p></div>
              <div className="rounded-2xl border border-success/20 bg-success/[0.035] p-4"><p className="text-[10px] text-subtle">Proof system</p><p className="mt-2 flex items-center gap-2 font-medium"><LockKeyhole aria-hidden="true" className="size-3.5 text-success" />Circom + Groth16 active</p></div>
            </div>

            <details className="group rounded-2xl border border-border bg-background/30 px-4 py-3">
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-between rounded-lg text-xs font-medium">Advanced protocol details<ChevronDown aria-hidden="true" className="size-4 text-subtle transition-transform group-open:rotate-180" /></summary>
              <dl className="mt-4 space-y-3 border-t border-border pt-4 text-[11px]">
                <div className="flex justify-between gap-4"><dt className="text-subtle">Chain IDs</dt><dd className="text-right font-mono">11155111 · {chainId('stellar').toString()}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-subtle">Source pool</dt><dd className="max-w-[65%] break-all text-right font-mono">{poolAddress(from) ?? 'Not deployed'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-subtle">Destination pool</dt><dd className="max-w-[65%] break-all text-right font-mono">{poolAddress(to) ?? 'Not deployed'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-subtle">Circuits</dt><dd className="text-right">bridge_out · bridge_in · policy_tx_2_2_gvk_T</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-subtle">Admin visibility</dt><dd className="text-right">Traceable Global View Key</dd></div>
              </dl>
            </details>

            {currentError && <div role="alert" className="rounded-2xl border border-danger/25 bg-danger/[0.055] p-4 text-[11px] leading-5 text-danger">{currentError}</div>}
            {transfer?.relayerFailed && latestCanResume && (
              <Button variant="secondary" size="lg" className="w-full" onClick={() => { const next = { ...transfer, via: 'wallet' as Via, relayerFailed: false }; store.putTransfer(next); setVia('wallet'); void execute(next) }}>Send it myself instead</Button>
            )}

            {latestCanResume && transfer ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" size="lg" onClick={resetTransfer}><RotateCcw aria-hidden="true" />New transfer</Button>
                <Button variant="accent" size="lg" onClick={() => void execute(transfer)}><ShieldCheck aria-hidden="true" />Resume transfer</Button>
              </div>
            ) : (
              <Button
                variant="accent"
                size="lg"
                className="w-full"
                disabled={Boolean(identityReady && (sourceWallet || !needsSource)) && !canReview}
                onClick={() => {
                  if (!identityReady) setWalletDialogNetwork(id?.network ?? from)
                  else if (needsSource && !sourceWallet) setWalletDialogNetwork(from)
                  else if (canReview) setReviewOpen(true)
                }}
              >
                <ShieldCheck aria-hidden="true" />
                {!identityReady ? `Connect your identity wallet (${networkMeta[id?.network ?? from].wallet})` : needsSource && !sourceWallet ? `Connect ${networkMeta[from].wallet} to deposit` : !deploymentReady ? 'Sepolia pool not deployed' : !messageAmount || messageAmount <= 0n ? 'Enter an amount' : !recipientIsValid ? 'Enter a valid withdrawal address' : 'Review transfer'}
              </Button>
            )}
            <p className="text-center text-[10px] leading-4 text-subtle">Never enter a private key or seed phrase. Note keys are derived from wallet signatures and kept in memory.</p>
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="rounded-3xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="progress-title">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">Transfer trace</p><h2 id="progress-title" className="mt-2 text-base font-semibold tracking-[-0.02em]">{runStatus === 'complete' ? (transfer?.keepPrivate ? 'Transfer kept private' : 'Transfer withdrawn') : runStatus === 'running' ? 'Transfer in progress' : runStatus === 'failed' ? 'Action required' : transfer ? 'Transfer ready to resume' : 'Ready for review'}</h2></div>
              <span aria-hidden="true" className={cn('mt-1 size-2 rounded-full', runStatus === 'complete' ? 'bg-success' : runStatus === 'running' ? 'dot-pulse bg-accent' : runStatus === 'failed' ? 'bg-danger' : 'bg-subtle')} />
            </div>

            <ol className="mt-6" aria-live="polite">
              {progress.map((step, index) => {
                const transactions = stepTransactions(transfer, step.id as FlowStepId)
                return (
                  <li key={step.id} className="relative flex gap-3.5 pb-6 last:pb-0">
                    {index < progress.length - 1 && <span aria-hidden="true" className={cn('absolute left-[9px] top-5 h-[calc(100%-8px)] w-px', step.status === 'complete' ? 'bg-success/50' : 'bg-border')} />}
                    <span className="relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface">{step.status === 'complete' ? <span className="grid size-5 place-items-center rounded-full bg-success text-background"><Check aria-hidden="true" className="size-3" strokeWidth={3} /></span> : step.status === 'active' ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-accent" /> : step.status === 'failed' ? <AlertTriangle aria-hidden="true" className="size-5 text-danger" /> : <Circle aria-hidden="true" className="size-5 text-border-strong" />}</span>
                    <div className="min-w-0">
                      <p className={cn('text-xs font-medium', step.status === 'idle' ? 'text-muted' : 'text-foreground')}>{step.label}</p>
                      <p className="mt-1 text-[11px] leading-4 text-subtle">{step.description}</p>
                      {transactions.map((tx) => <a key={tx.hash} href={explorer.tx(tx.network, tx.hash)} target="_blank" rel="noreferrer" className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded text-[10px] font-medium text-accent hover:text-accent-strong">{tx.label} · {truncateAddress(tx.hash)}<ExternalLink aria-hidden="true" className="size-3" /></a>)}
                    </div>
                  </li>
                )
              })}
            </ol>

            {runStatus === 'complete' && <div className="mt-6 rounded-2xl border border-success/20 bg-success/[0.055] p-4 text-[11px] leading-5 text-muted">{transfer?.keepPrivate ? 'The destination note was claimed and stays in your private balance, spendable by your note key.' : 'The destination note was claimed and withdrawn.'} Use the explorer links above to inspect each public boundary.</div>}
          </section>

          <section className="rounded-3xl border border-warning/20 bg-warning/[0.045] p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              <div><p className="text-xs font-medium">What privacy means here</p><p className="mt-1 text-[11px] leading-5 text-muted">Proofs hide the note ownership and direct bridge-out → bridge-in link. Deposit and withdrawal addresses and amounts remain public; timing and unique amounts can still correlate them. With the relayer, bridge outs, claims and withdrawals show the relayer’s account as sender; the deposit still shows your source wallet.</p></div>
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review testnet transfer</DialogTitle>
            <DialogDescription>This submits real testnet transactions. Expect three proofs, several wallet confirmations, and a wait while the remote root is posted.</DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-border bg-background/50 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3"><NetworkMark network={from} /><div><p className="text-[10px] uppercase tracking-wider text-subtle">Your source</p><p className="mt-1 text-sm font-medium">{amountLabel} USDC</p></div></div>
              <ArrowRight aria-hidden="true" className="size-4 text-subtle" />
              <div className="flex items-center gap-3 text-right"><div><p className="text-[10px] uppercase tracking-wider text-subtle">Your destination</p><p className="mt-1 text-sm font-medium">{amountLabel} USDC</p></div><NetworkMark network={to} /></div>
            </div>
            <div className="my-5 h-px bg-border" />
            <dl className="space-y-3 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-subtle">Route</dt><dd>{networkMeta[from].name} → {networkMeta[to].name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Withdrawal address</dt><dd className="max-w-[230px] truncate font-mono">{recipientValue}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Protocol fee</dt><dd>0 USDC</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Wallet transactions</dt><dd>{via === 'relayer' ? 'Deposit only (the relayer sends the rest)' : 'Deposit · bridge out · claim · withdraw'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">ZK link protection</dt><dd className="text-success">Active</dd></div>
            </dl>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />This is unaudited testnet software. Do not use mainnet funds. Keep this browser’s note backup until encrypted note delivery is implemented.</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <DialogClose asChild><Button variant="secondary">Back to edit</Button></DialogClose>
            <Button variant="accent" onClick={() => void beginTransfer()}><FileKey2 aria-hidden="true" />Start testnet transfer</Button>
          </div>
        </DialogContent>
      </Dialog>

      <WalletConnectDialog network={walletDialogNetwork} open={Boolean(walletDialogNetwork)} onOpenChange={(open) => !open && setWalletDialogNetwork(null)} purpose={walletDialogNetwork === from ? 'required' : 'destination'} />
    </div>
  )
}

export { BridgePage }
