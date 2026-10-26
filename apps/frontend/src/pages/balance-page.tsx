import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ExternalLink, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { NetworkMark } from '../components/network-logo'
import { Button } from '../components/ui/button'
import { WalletConnectDialog } from '../components/wallet-connect-dialog'
import { useWallets } from '../components/wallet-context'
import { formatNote, parseUnits } from '../lib/amounts'
import { createMovement, runMovement } from '../lib/balance-flow'
import { mergeSteps, settleWatched } from '../lib/bridge-flow'
import { explorer, isDeployed, protocol } from '../lib/config'
import { chooseIdentity, identity, type Identity } from '../lib/keys'
import { networkMeta, validAddress, type NetworkId } from '../lib/networks'
import { pools } from '../lib/pools'
import * as store from '../lib/store'
import type { Movement } from '../lib/store'
import { cn } from '../lib/utils'
import { truncateAddress } from '../lib/wallet-adapters'

type Kind = Movement['kind']

const NETWORKS: NetworkId[] = ['ethereum', 'stellar']

function BalanceCard({
  network,
  id,
  onIdentity,
  onConnect,
}: {
  network: NetworkId
  id: Identity | null
  onIdentity: (network: NetworkId) => Promise<Identity | null>
  onConnect: (network: NetworkId) => void
}) {
  const { wallets } = useWallets()
  const [kind, setKind] = useState<Kind>('deposit')
  const [amount, setAmount] = useState('')
  const [address, setAddress] = useState('')
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [publicBalance, setPublicBalance] = useState<{ address: string; value: bigint | null } | null>(null)
  const privateBalance = useSyncExternalStore(store.subscribe, () => (id ? store.balanceOf(network, id.pk) : 0n), () => 0n)
  const [allMovements, setAllMovements] = useState(() => store.movements())
  const movements = allMovements.filter((m) => m.network === network)
  const unfinished = movements.find((m) => m.status !== 'done')

  const meta = networkMeta[network]
  const wallet = wallets[network]
  const decimals = protocol.decimals[network]
  const value = parseUnits(amount, decimals)
  const identityWallet = id ? wallets[id.network] : wallet
  const identityReady = Boolean(identityWallet && (!id || identityWallet.address === id.address))
  const deployed = isDeployed(network)
  const merges = id && value && value > 0n && value <= privateBalance ? mergeSteps(store.notes(network, id.pk), value) : null
  const walletBalance = publicBalance && wallet && publicBalance.address === wallet.address ? publicBalance.value : null

  useEffect(() => store.subscribe(() => setAllMovements(store.movements())), [])

  // A deposit that landed after its page closed joins the balance here.
  useEffect(() => {
    if (deployed) settleWatched(network).catch(() => {})
  }, [network, deployed])

  useEffect(() => {
    let cancelled = false
    if (!wallet || !deployed) return
    pools[network]
      .usdcBalance(wallet.address)
      .then((v) => !cancelled && setPublicBalance({ address: wallet.address, value: v }))
      .catch(() => !cancelled && setPublicBalance({ address: wallet.address, value: null }))
    return () => {
      cancelled = true
    }
  }, [network, wallet, deployed, running])

  const run = async (m: Movement) => {
    setRunning(true)
    setError('')
    try {
      await runMovement(m, setMessage)
      setAmount('')
      setAddress('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      setMessage('')
    }
  }

  const start = async () => {
    if (!value || value <= 0n) return
    // The first deposit can make its wallet the identity, as the first transfer does.
    const chosen = id ?? (kind === 'deposit' ? await onIdentity(network) : null)
    if (!chosen) return
    const account = kind === 'deposit' ? wallet!.address : address.trim()
    void run(createMovement({ kind, network, amount: value, account, identity: chosen }))
  }

  const blocked: [string, () => void] | null = !deployed
    ? [`${meta.shortName} pool not deployed`, () => {}]
    : kind === 'deposit' && !wallet
      ? [`Connect ${meta.wallet} to deposit`, () => onConnect(network)]
      : kind === 'withdraw' && !id
        ? ['No private balance yet: deposit or bridge first', () => {}]
        : !identityReady
          ? [`Connect your identity wallet (${networkMeta[id?.network ?? network].wallet})`, () => onConnect(id?.network ?? network)]
          : null
  const invalid =
    !value || value <= 0n
      ? 'Enter an amount'
      : kind === 'deposit' && walletBalance !== null && value > walletBalance
        ? 'Not enough public USDC'
        : kind === 'withdraw' && value > privateBalance
          ? 'Not enough private balance'
          : kind === 'withdraw' && !validAddress(network, address)
            ? `Enter a valid ${meta.shortName} address`
            : ''

  return (
    <section aria-labelledby={`balance-${network}`} className="hairline-card rounded-[2rem] border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-5 py-5 sm:px-6">
        <NetworkMark network={network} />
        <div className="min-w-0 flex-1">
          <h2 id={`balance-${network}`} className="text-sm font-semibold tracking-[-0.02em]">{meta.name}</h2>
          <p className="mt-0.5 text-[10px] text-subtle">Public {walletBalance === null ? '—' : formatNote(network, walletBalance)} USDC{wallet ? ` · ${truncateAddress(wallet.address)}` : ''}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">Private</p>
          <p className="mt-0.5 font-mono text-lg">{formatNote(network, privateBalance)}</p>
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        <div role="radiogroup" aria-label={`${meta.shortName} action`} className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1">
          {([['deposit', 'Deposit', ArrowDownToLine], ['withdraw', 'Withdraw', ArrowUpFromLine]] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" role="radio" aria-checked={kind === value} disabled={running} onClick={() => setKind(value)} className={cn('focus-ring flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50', kind === value ? 'bg-surface-raised text-foreground' : 'text-muted hover:text-foreground')}>
              <Icon aria-hidden="true" className="size-3.5" />{label}
            </button>
          ))}
        </div>
        <p className="text-[10px] leading-4 text-subtle">
          {kind === 'deposit'
            ? `Public USDC moves from your ${meta.wallet} wallet into the pool as a hidden note. The deposit is public; what you do with the note next is not.`
            : `A proof spends your private notes and pays any public ${meta.shortName} address; the relayer sends it. The change stays private.`}
        </p>
        {kind === 'withdraw' && Boolean(merges) && (
          <p className="text-[10px] leading-4 text-muted">Your balance is spread over several notes and a proof spends at most two: {merges} merge{merges === 1 ? '' : 's'} first (a proof each, about 10 to 30 s), sent by the relayer. You still receive one payment.</p>
        )}

        <div>
          <label htmlFor={`amount-${network}`} className="text-[10px] font-medium text-subtle">Amount</label>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-background/55 px-3 focus-within:border-accent/50">
            <input id={`amount-${network}`} inputMode="decimal" value={amount} disabled={running} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" className="min-w-0 flex-1 bg-transparent py-3 font-mono text-sm outline-none placeholder:text-subtle disabled:opacity-60" />
            <button type="button" disabled={running} onClick={() => { const max = kind === 'deposit' ? walletBalance : privateBalance; if (max !== null) setAmount(formatNote(network, max).replace(/,/g, '')) }} className="focus-ring rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-accent hover:border-accent/40 disabled:opacity-40">MAX</button>
            <span className="text-xs font-semibold">USDC</span>
          </div>
          {amount && value === null && <p className="mt-2 text-[10px] text-danger">Use at most {decimals} decimal places.</p>}
        </div>

        {kind === 'withdraw' && (
          <div>
            <label htmlFor={`address-${network}`} className="text-[10px] font-medium text-subtle">Public {meta.shortName} address that receives it</label>
            <input id={`address-${network}`} value={address} disabled={running} onChange={(e) => setAddress(e.target.value)} placeholder={network === 'stellar' ? 'G…' : '0x…'} className="mt-2 w-full rounded-xl border border-border bg-background/55 px-3 py-3 font-mono text-xs outline-none placeholder:text-subtle focus:border-accent/50 disabled:opacity-60" />
            {network === 'stellar' && <p className="mt-2 text-[10px] leading-4 text-subtle">A Stellar address must exist and hold a USDC trustline before it can receive the withdrawal.</p>}
          </div>
        )}

        {running && message && <p role="status" className="flex items-center gap-1.5 text-[10px] text-accent"><LoaderCircle aria-hidden="true" className="size-3 animate-spin" />{message}</p>}
        {error && <p role="alert" className="flex items-start gap-1.5 text-[10px] leading-4 text-danger"><AlertTriangle aria-hidden="true" className="mt-0.5 size-3 shrink-0" />{error}</p>}

        {unfinished && !running ? (
          <Button variant="accent" size="lg" className="w-full" disabled={!identityReady} onClick={() => void run(unfinished)}>
            <RotateCcw aria-hidden="true" />Resume {unfinished.kind} of {formatNote(network, BigInt(unfinished.amount))} USDC
          </Button>
        ) : (
          <Button variant="accent" size="lg" className="w-full" disabled={running || (!blocked && Boolean(invalid))} onClick={() => (blocked ? blocked[1]() : void start())}>
            {running ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ShieldCheck aria-hidden="true" />}
            {running ? 'Working…' : blocked ? blocked[0] : invalid || (kind === 'deposit' ? `Deposit ${amount} USDC` : `Withdraw ${amount} USDC`)}
          </Button>
        )}

        {movements.length > 0 && (
          <ul className="space-y-1.5 border-t border-border pt-4">
            {movements.slice(0, 5).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-[10px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  {m.status === 'done' ? <CheckCircle2 aria-hidden="true" className="size-3 shrink-0 text-success" /> : <AlertTriangle aria-hidden="true" className="size-3 shrink-0 text-warning" />}
                  <span className="truncate text-muted">{m.kind === 'deposit' ? 'Deposit' : `Withdrawal to ${truncateAddress(m.account)}`} · {new Date(m.createdAt).toLocaleString()}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 font-mono">
                  {m.kind === 'deposit' ? '+' : '−'}{formatNote(network, BigInt(m.amount))}
                  {m.txs.transact && <a href={explorer.tx(network, m.txs.transact)} target="_blank" rel="noreferrer" aria-label="Open in explorer" className="text-subtle hover:text-accent"><ExternalLink className="size-3" /></a>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function BalancePage() {
  const { wallets } = useWallets()
  const [id, setId] = useState<Identity | null>(() => identity())
  const [walletDialogNetwork, setWalletDialogNetwork] = useState<NetworkId | null>(null)
  const [identityError, setIdentityError] = useState('')

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

  return (
    <div className="page-enter">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h1 className="text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">Your private balance</h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-muted">
          Deposit, bridge and withdraw are three separate steps. Deposit when you like, bridge with “Keep it private” on, and withdraw later, any amount, to any address. Spreading them over time and amounts makes a deposit harder to match with a withdrawal.
        </p>
      </div>

      <div className="mx-auto grid max-w-[1040px] items-start gap-5 md:grid-cols-2">
        {NETWORKS.map((network) => (
          <BalanceCard key={network} network={network} id={id} onIdentity={makeIdentity} onConnect={setWalletDialogNetwork} />
        ))}
      </div>

      <div className="mx-auto mt-5 max-w-[1040px] space-y-2 text-[10px] leading-4 text-subtle">
        {identityError && <p role="alert" className="text-danger">{identityError}</p>}
        <p>
          {id
            ? <>Your note key comes from your {networkMeta[id.network].wallet} wallet {truncateAddress(id.address)}; it owns your private balance on both chains.</>
            : <>Your first deposit makes its wallet your identity: it signs your note key, the same on both chains.</>}{' '}
          Notes are kept in this browser only: back them up from the Activity page. The administrator can decrypt every note with the Global View Key.
        </p>
      </div>

      <WalletConnectDialog network={walletDialogNetwork} open={Boolean(walletDialogNetwork)} onOpenChange={(open) => !open && setWalletDialogNetwork(null)} purpose="required" />
    </div>
  )
}

export { BalancePage }
