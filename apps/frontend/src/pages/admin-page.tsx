import {
  AlertTriangle,
  Download,
  ExternalLink,
  Eye,
  FileClock,
  KeyRound,
  Link2,
  LoaderCircle,
  Lock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { NetworkMark, NetworkRouteMark } from '../components/network-logo'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import {
  type AdminNote,
  type AdminTx,
  type LedgerTx,
  type TxKind,
  adminCsv,
  balances,
  decryptLedger,
  loadLedger,
} from '../lib/admin-ledger'
import { formatMessage, formatNote } from '../lib/amounts'
import { explorer, isDeployed } from '../lib/config'
import { type NetworkId, networkMeta } from '../lib/networks'
import { pools } from '../lib/pools'
import { cn } from '../lib/utils'
import { truncateAddress } from '../lib/wallet-adapters'
import { hex32, prover } from '../lib/zk/prover'

const kindLabel: Record<TxKind, string> = {
  deposit: 'Deposit',
  transfer: 'Private transfer',
  withdraw: 'Withdrawal',
  bridgeOut: 'Bridge out',
  bridgeIn: 'Bridge in',
  refund: 'Refund',
  finalize: 'Finalized',
  liquidity: 'Liquidity added',
  root: 'Remote root posted',
}

const shortHex = (v: bigint | string) => {
  const h = typeof v === 'bigint' ? hex32(v) : v
  return `${h.slice(0, 8)}…${h.slice(-4)}`
}

function PublicDetails({ tx }: { tx: LedgerTx }) {
  const n = tx.network
  return (
    <div className="space-y-1 text-[10px] text-muted">
      {tx.sender && <p>From <span className="font-mono text-foreground">{truncateAddress(tx.sender)}</span></p>}
      {tx.publicAmount !== 0n && (
        <p>
          <span className="font-mono text-foreground">{formatNote(n, tx.publicAmount < 0n ? -tx.publicAmount : tx.publicAmount)} USDC</span>
          {tx.publicAmount > 0n ? ' into the pool' : ` out to ${truncateAddress(tx.counterparty ?? '')}`}
        </p>
      )}
      {tx.bridgeOut && (
        <p>Message <span className="font-mono">{shortHex(tx.bridgeOut.message)}</span> · deadline {new Date(Number(tx.bridgeOut.deadline) * 3_600_000).toLocaleString()} · amount hidden</p>
      )}
      {tx.claimNullifier !== undefined && <p>Claim nullifier <span className="font-mono">{shortHex(tx.claimNullifier)}</span></p>}
      {tx.settles !== undefined && <p>Settles <span className="font-mono">{shortHex(tx.settles)}</span></p>}
      {tx.root !== undefined && <p>Root <span className="font-mono">{shortHex(tx.root)}</span></p>}
      {tx.commitments.length > 0 && <p>Commitments {tx.commitments.map((c) => shortHex(c.commitment)).join(' · ')}</p>}
      {tx.nullifiers.length > 0 && <p>Nullifiers {tx.nullifiers.map((x) => shortHex(x.nullifier)).join(' · ')}</p>}
    </div>
  )
}

function NoteLine({ network, note, verb }: { network: NetworkId; note: AdminNote; verb: string }) {
  return (
    <p className={cn('flex flex-wrap items-center gap-1.5', !note.matches && 'text-danger')}>
      {verb} <span className="font-mono text-foreground">{formatNote(network, note.amount)} USDC</span>
      owner <span className="font-mono">{shortHex(note.pk)}</span>
      {!note.matches && <span className="rounded-full border border-danger/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]">Commitment mismatch</span>}
    </p>
  )
}

function AdminDetails({ row, hoveredLink, onHoverLink }: { row: AdminTx; hoveredLink: string | null; onHoverLink: (id: string | null) => void }) {
  const n = row.tx.network
  const visible = (list: (AdminNote | null)[]) => list.filter((x): x is AdminNote => Boolean(x) && (x!.amount > 0n || !x!.matches))
  const undecrypted = [...row.outputs, ...row.inputs].filter((x) => x === null).length
  return (
    <div className="space-y-1 text-[10px] text-muted">
      {row.tx.sender && <p>From <span className="font-mono text-foreground">{truncateAddress(row.tx.sender)}</span>{row.tx.publicAmount !== 0n && <> · public {formatNote(n, row.tx.publicAmount < 0n ? -row.tx.publicAmount : row.tx.publicAmount)} USDC</>}</p>}
      {visible(row.inputs).map((note, i) => <NoteLine key={`in${i}`} network={n} note={note} verb="Spends" />)}
      {visible(row.outputs).map((note, i) => <NoteLine key={`out${i}`} network={n} note={note} verb="Creates" />)}
      {row.bridge && (
        <p className={cn('flex flex-wrap items-center gap-1.5', !row.bridge.messageMatches && 'text-danger')}>
          Bridges <span className="font-mono text-foreground">{formatMessage(row.bridge.amount)} USDC</span> to owner <span className="font-mono">{shortHex(row.bridge.recipientPk)}</span>
          {!row.bridge.messageMatches && <span className="rounded-full border border-danger/30 px-2 py-0.5 text-[9px] font-semibold uppercase">Message mismatch</span>}
        </p>
      )}
      {row.bridge?.refund && <NoteLine network={n} note={row.bridge.refund} verb="Refund note" />}
      {row.linkedTo && (
        <a
          href={`#tx-${row.linkedTo.hash}`}
          onMouseEnter={() => onHoverLink(row.linkId ?? null)}
          onMouseLeave={() => onHoverLink(null)}
          className={cn(
            'focus-ring mt-1 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-medium text-accent',
            hoveredLink === row.linkId ? 'border-accent/60 bg-accent/10' : 'border-accent/25 bg-background/45',
          )}
        >
          <Link2 aria-hidden="true" className="size-3" />
          {row.linkId} · {row.tx.kind === 'bridgeOut' ? 'claimed by' : 'claims'} {networkMeta[row.linkedTo.network].shortName} {truncateAddress(row.linkedTo.hash)}
        </a>
      )}
      {undecrypted > 0 && <p className="text-warning">{undecrypted} ciphertext{undecrypted > 1 ? 's' : ''} could not be decrypted</p>}
    </div>
  )
}

/** Both pools' transactions and public USDC balances (no key involved). */
async function fetchPublicData() {
  const [txs, stellarUsdc, ethereumUsdc] = await Promise.all([
    loadLedger(),
    pools.stellar.poolUsdcBalance().catch(() => null),
    isDeployed('ethereum') ? pools.ethereum.poolUsdcBalance().catch(() => null) : Promise.resolve(null),
  ])
  return { txs, poolUsdc: { stellar: stellarUsdc, ethereum: ethereumUsdc } as Record<NetworkId, bigint | null> }
}

function AdminPage() {
  const [ledger, setLedger] = useState<LedgerTx[] | null>(null)
  const [poolUsdc, setPoolUsdc] = useState<Record<NetworkId, bigint | null>>({ stellar: null, ethereum: null })
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  // The view key lives only in this component's memory: never stored or sent.
  const [viewKey, setViewKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [keyError, setKeyError] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [adminRows, setAdminRows] = useState<AdminTx[] | null>(null)
  const [adminView, setAdminView] = useState(false)
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)

  const apply = (data: Awaited<ReturnType<typeof fetchPublicData>> | Error) => {
    setLoading(false)
    if (data instanceof Error) {
      setLoadError(data.message)
      return null
    }
    setLedger(data.txs)
    setPoolUsdc(data.poolUsdc)
    return data.txs
  }

  const load = async () => apply(await fetchPublicData().catch((error: unknown) => (error instanceof Error ? error : new Error(String(error)))))

  useEffect(() => {
    let cancelled = false
    fetchPublicData().then(
      (data) => !cancelled && apply(data),
      (error: unknown) => !cancelled && apply(error instanceof Error ? error : new Error(String(error))),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const decrypt = async (key: string, txs: LedgerTx[]) =>
    setAdminRows(await decryptLedger(txs, key, prover))

  const unlock = async () => {
    const key = draft.trim()
    if (!key) return
    setUnlocking(true)
    setKeyError('')
    try {
      const d = await prover.adminKey(key).catch(() => {
        throw new Error('This is not a valid view key: paste the admin scalar as 0x-hex or decimal.')
      })
      for (const network of ['stellar', 'ethereum'] as NetworkId[]) {
        if (!isDeployed(network)) continue
        const [x, y] = await pools[network].adminViewKey()
        if (BigInt(x) !== BigInt(d.x) || BigInt(y) !== BigInt(d.y)) {
          throw new Error(`This key does not match the Global View Key stored in the ${networkMeta[network].name} pool.`)
        }
      }
      setViewKey(key)
      setDraft('')
      setAdminView(true)
      if (ledger) await decrypt(key, ledger)
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : String(error))
    } finally {
      setUnlocking(false)
    }
  }

  const lock = () => {
    setViewKey(null)
    setDraft('')
    setAdminRows(null)
    setAdminView(false)
  }

  const refresh = async () => {
    setLoading(true)
    setLoadError('')
    const txs = await load()
    if (txs && viewKey) await decrypt(viewKey, txs)
  }

  const showAdmin = adminView && adminRows !== null
  const rows: AdminTx[] = useMemo(
    () => adminRows ?? (ledger ?? []).map((tx) => ({ tx, outputs: [], inputs: [] })),
    [adminRows, ledger],
  )
  const poolBalances = useMemo(() => balances(adminRows ?? [], poolUsdc), [adminRows, poolUsdc])
  const mismatches = (adminRows ?? []).filter(
    (r) => [...r.outputs, ...r.inputs, r.bridge?.refund ?? null].some((x) => x && !x.matches) || r.bridge?.messageMatches === false,
  ).length

  const exportCsv = () => {
    if (!adminRows) return
    const url = URL.createObjectURL(new Blob([adminCsv(adminRows)], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `zkross-admin-view-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-enter">
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent"><NetworkRouteMark />Admin oversight</p>
          <h1 className="mt-4 text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">Two views of one ledger.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted">Every pool transaction on both chains, as the public sees it and as the admin sees it with the traceable Global View Key: decrypted amounts, note owners, and each bridge out linked to its claim.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>{loading ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}Refresh</Button>
          {showAdmin && <Button variant="secondary" onClick={exportCsv}><Download aria-hidden="true" />Export CSV</Button>}
        </div>
      </div>

      <section className="mt-8 rounded-[2rem] border border-border bg-surface p-5 sm:p-7" aria-labelledby="key-title">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <h2 id="key-title" className="flex items-center gap-2 text-base font-semibold tracking-[-0.02em]"><KeyRound aria-hidden="true" className="size-4 text-accent" />Admin view key</h2>
            {viewKey ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-success"><ShieldCheck aria-hidden="true" className="size-3.5" />Unlocked: the key matches both pools. It is held in this page’s memory only.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-subtle">Paste the Global View Key scalar. It stays in this page’s memory: never saved, never sent; reloading or locking clears it.</p>
                <div className="mt-4 flex items-center rounded-xl border border-border bg-background/55 px-3 focus-within:border-accent/50">
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Admin view key"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && void unlock()}
                    className="min-w-0 flex-1 bg-transparent py-3 font-mono text-xs outline-none placeholder:text-subtle"
                    placeholder="0x…"
                  />
                </div>
              </>
            )}
            {keyError && <p role="alert" className="mt-2 text-[11px] text-danger">{keyError}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-3 text-xs font-medium">
              <span className={cn(!adminView && 'text-foreground', adminView && 'text-subtle')}>Public view</span>
              <Switch checked={adminView} disabled={!viewKey} onCheckedChange={setAdminView} aria-label="Admin view" />
              <span className={cn(adminView ? 'text-foreground' : 'text-subtle')}>Admin view</span>
            </label>
            {viewKey ? (
              <Button variant="secondary" onClick={lock}><Lock aria-hidden="true" />Lock</Button>
            ) : (
              <Button variant="accent" onClick={() => void unlock()} disabled={!draft.trim() || unlocking}>{unlocking ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Eye aria-hidden="true" />}Unlock</Button>
            )}
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Pool balances">
        {poolBalances.map((b) => (
          <div key={b.network} className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3"><NetworkMark network={b.network} /><div><p className="text-xs font-semibold">{networkMeta[b.network].shortName} pool</p><p className="mt-1 text-[10px] text-subtle">Public USDC held</p></div></div>
            <p className="mt-4 text-2xl font-medium tracking-[-0.04em]">{poolUsdc[b.network] === null ? '—' : `${formatNote(b.network, b.poolUsdc)} USDC`}</p>
            {showAdmin && (
              <dl className="mt-4 space-y-2 border-t border-border pt-4 text-[11px]">
                <div className="flex justify-between gap-4"><dt className="text-subtle">User notes ({b.noteCount})</dt><dd className="font-mono">{formatNote(b.network, b.userNotes)} USDC</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-subtle">Pending bridge outs (refundable)</dt><dd className="font-mono">{formatNote(b.network, b.pending)} USDC</dd></div>
                <div className="flex justify-between gap-4 font-medium"><dt>Reserve (liquidity)</dt><dd className="font-mono text-accent">{formatNote(b.network, b.reserve)} USDC</dd></div>
              </dl>
            )}
          </div>
        ))}
      </section>

      {showAdmin && mismatches > 0 && (
        <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger/[0.055] p-4 text-[11px] leading-5 text-danger"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><p>{mismatches} transaction{mismatches > 1 ? 's have' : ' has'} a decrypted note or message that does not match its on-chain commitment. That would be a circuit bug.</p></div>
      )}
      {loadError && <div role="alert" className="mt-5 rounded-2xl border border-danger/25 bg-danger/[0.055] p-4 text-[11px] leading-5 text-danger">{loadError}</div>}

      <section className="mt-5 overflow-hidden rounded-[2rem] border border-border bg-surface" aria-labelledby="ledger-title">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
          <div><h2 id="ledger-title" className="text-base font-semibold tracking-[-0.02em]">{showAdmin ? 'Admin view' : 'Public view'}</h2><p className="mt-1 text-xs text-subtle">{rows.length} transaction{rows.length === 1 ? '' : 's'} on both pools, oldest first</p></div>
          {loading && <span className="flex items-center gap-2 text-[10px] text-accent"><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />Reading both chains…</span>}
        </div>
        {rows.length === 0 ? (
          <div className="grid min-h-60 place-items-center p-8 text-center"><div className="max-w-sm"><span className="mx-auto grid size-14 place-items-center rounded-full border border-border bg-background text-subtle"><FileClock aria-hidden="true" className="size-5" /></span><p className="mt-6 text-sm leading-6 text-muted">{loading ? 'Loading pool events…' : 'No pool transactions found.'}</p></div></div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <article
                key={`${row.tx.network}:${row.tx.hash}`}
                id={`tx-${row.tx.hash}`}
                className={cn('grid gap-3 p-5 sm:grid-cols-[150px_1fr_auto] sm:px-7', showAdmin && row.linkId && 'border-l-2', showAdmin && row.linkId && (hoveredLink === row.linkId ? 'border-l-accent bg-accent/[0.04]' : 'border-l-accent/30'))}
              >
                <div className="flex items-start gap-3">
                  <NetworkMark network={row.tx.network} className="size-8 rounded-xl" />
                  <div><p className="text-xs font-semibold">{kindLabel[row.tx.kind]}</p><p className="mt-1 text-[10px] text-subtle">{new Date(row.tx.time).toLocaleString()}</p></div>
                </div>
                {showAdmin ? <AdminDetails row={row} hoveredLink={hoveredLink} onHoverLink={setHoveredLink} /> : <PublicDetails tx={row.tx} />}
                <a href={explorer.tx(row.tx.network, row.tx.hash)} target="_blank" rel="noreferrer" className="focus-ring inline-flex h-fit items-center gap-1.5 self-start rounded-lg border border-border bg-background/45 px-2.5 py-1.5 text-[10px] font-medium text-accent hover:border-accent/30">{truncateAddress(row.tx.hash)}<ExternalLink aria-hidden="true" className="size-3" /></a>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-border bg-background/35 p-4 text-[11px] leading-5 text-muted"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" /><p>The public view is what any chain observer can read. The admin view exists because the pools run in traceable mode: every note is encrypted to the admin’s Global View Key inside the proof, and the pools reject notes encrypted to any other key.</p></div>
    </div>
  )
}

export { AdminPage }
