import {
  ArrowRight,
  Check,
  Circle,
  Eye,
  FileKey2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { NetworkMark, NetworkRouteMark } from '../components/network-logo'
import { Button } from '../components/ui/button'
import type { NetworkId } from '../lib/mock-bridge'
import { cn } from '../lib/utils'

type DemoActivity = {
  id: string
  date: string
  time: string
  from: NetworkId
  to: NetworkId
  asset: string
  amount: string
  status: 'UI complete' | 'UI stopped'
  statusDetail: string
  verification: string
}

const demoActivity: DemoActivity[] = [
  {
    id: 'DEMO-2F9A',
    date: 'Oct 24, 2026',
    time: '14:08',
    from: 'ethereum',
    to: 'stellar',
    asset: 'USDC',
    amount: '24,800.00',
    status: 'UI complete',
    statusDetail: 'Local sequence reached its final UI state',
    verification: 'Not performed',
  },
  {
    id: 'DEMO-1C42',
    date: 'Oct 22, 2026',
    time: '09:31',
    from: 'stellar',
    to: 'ethereum',
    asset: 'USDC',
    amount: '8,000.00',
    status: 'UI complete',
    statusDetail: 'Local sequence reached its final UI state',
    verification: 'Not performed',
  },
  {
    id: 'DEMO-8B73',
    date: 'Oct 20, 2026',
    time: '18:44',
    from: 'ethereum',
    to: 'stellar',
    asset: 'USDC',
    amount: '12,500.00',
    status: 'UI stopped',
    statusDetail: 'Prototype sequence stopped before its final state',
    verification: 'Unavailable',
  },
]

function ActivityPage() {
  const [workspace, setWorkspace] = useState<'locked' | 'loading' | 'demo'>('locked')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(demoActivity[0].id)

  const filteredActivity = useMemo(
    () => demoActivity.filter((item) =>
      [item.id, item.from, item.to, item.asset, item.status]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    [query],
  )
  const selected = demoActivity.find((item) => item.id === selectedId) ?? demoActivity[0]

  const loadDemo = () => {
    setWorkspace('loading')
    window.setTimeout(() => {
      setSelectedId(demoActivity[0].id)
      setWorkspace('demo')
    }, 700)
  }

  return (
    <div className="page-enter">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            <NetworkRouteMark />
            Transfer activity
          </p>
          <h1 className="mt-4 text-4xl font-medium tracking-[-0.055em] sm:text-5xl">Public rails. Private context.</h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted">
            The owner view can join public deposit and payout records with private note status and
            authorized context. Real history still requires authentication and server authorization.
          </p>
        </div>
        <span className="flex w-fit items-center gap-2 rounded-full border border-warning/25 bg-warning/[0.055] px-3 py-1.5 text-[10px] font-medium text-warning">
          <LockKeyhole aria-hidden="true" className="size-3.5" />
          Owner access unavailable
        </span>
      </div>

      <section className="mt-10 overflow-hidden rounded-[2rem] border border-border bg-surface" aria-labelledby="activity-title">
        {workspace === 'locked' && (
          <div className="grid min-h-[500px] place-items-center p-6 text-center">
            <div className="max-w-md">
              <span className="mx-auto grid size-14 place-items-center rounded-full border border-border bg-background text-accent">
                <KeyRound aria-hidden="true" className="size-5" />
              </span>
              <h2 id="activity-title" className="mt-6 text-xl font-semibold tracking-[-0.03em]">No authenticated owner session</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Real transaction history stays closed until identity, authorization, and encrypted storage exist.
              </p>
              <Button variant="secondary" className="mt-7" onClick={loadDemo}>
                <Eye aria-hidden="true" />
                Explore the ledger demo
              </Button>
              <p className="mt-3 text-[10px] text-subtle">Local fixtures only · no wallet or identity lookup</p>
            </div>
          </div>
        )}

        {workspace === 'loading' && (
          <div className="grid min-h-[500px] place-items-center p-6 text-center" aria-live="polite">
            <div>
              <LoaderCircle aria-hidden="true" className="mx-auto size-6 animate-spin text-accent" />
              <p className="mt-4 text-sm font-medium">Opening local ledger…</p>
              <p className="mt-1 text-xs text-subtle">No network request is made.</p>
            </div>
          </div>
        )}

        {workspace === 'demo' && (
          <div className="grid min-h-[590px] lg:grid-cols-[0.82fr_1.18fr]">
            <div className="border-b border-border lg:border-b-0 lg:border-r">
              <div className="border-b border-border px-5 py-5 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 id="activity-title" className="text-sm font-semibold">Transfer index</h2>
                      <span className="rounded-md border border-warning/25 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-warning">Demo</span>
                    </div>
                    <p className="mt-1 text-[10px] text-subtle">{filteredActivity.length} local records</p>
                  </div>
                </div>
                <label className="mt-4 flex h-10 items-center gap-2 border-b border-border focus-within:border-accent/60">
                  <Search aria-hidden="true" className="size-3.5 text-subtle" />
                  <span className="sr-only">Search demo activity</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search reference, route, status"
                    className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-subtle"
                  />
                </label>
              </div>

              <div className="divide-y divide-border">
                {filteredActivity.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={selected.id === item.id ? 'true' : undefined}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'focus-ring group flex w-full items-start gap-4 px-5 py-5 text-left transition-colors sm:px-6',
                      selected.id === item.id ? 'bg-accent/[0.055]' : 'hover:bg-background/40',
                    )}
                  >
                    <span className={cn('mt-1 size-1.5 shrink-0 rounded-full', item.status === 'UI complete' ? 'bg-success' : 'bg-warning')} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[10px]">{item.id}</span>
                        <span className="text-[9px] text-subtle">{item.date}</span>
                      </span>
                      <span className="mt-3 flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-xs font-medium">
                          <NetworkRouteMark from={item.from} to={item.to} />
                          {item.asset}
                        </span>
                        <ArrowRight aria-hidden="true" className="size-3.5 text-subtle transition-transform group-hover:translate-x-0.5" />
                      </span>
                      <span className="mt-3 flex items-center justify-between gap-3 text-[10px]">
                        <span className="text-muted">{item.status}</span>
                        <span className="font-mono text-subtle">{item.amount}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {filteredActivity.length === 0 && (
                <div className="grid min-h-48 place-items-center p-6 text-center">
                  <div>
                    <p className="text-sm font-medium">No matching local records</p>
                    <button type="button" onClick={() => setQuery('')} className="focus-ring mt-2 rounded-md text-xs text-accent">Clear search</button>
                  </div>
                </div>
              )}
            </div>

            <article className="p-5 sm:p-7 lg:p-8" aria-label={`Details for ${selected.id}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] text-subtle">{selected.id}</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Transfer trace</h3>
                </div>
                <span className={cn(
                  'rounded-full border px-2.5 py-1 text-[9px]',
                  selected.status === 'UI complete' ? 'border-success/25 text-success' : 'border-warning/25 text-warning',
                )}>
                  {selected.status}
                </span>
              </div>

              <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center border-y border-border py-7">
                <div className="flex flex-col items-center text-center">
                  <NetworkMark network={selected.from} className="size-12 rounded-[18px]" />
                  <p className="mt-3 text-[9px] uppercase tracking-[0.13em] text-subtle">Source</p>
                  <p className="mt-1 text-xs font-medium capitalize">{selected.from}</p>
                </div>
                <div className="mx-4 flex items-center sm:mx-8">
                  <span className="h-px w-5 bg-border sm:w-10" />
                  <ArrowRight aria-hidden="true" className="mx-2 size-4 text-accent" />
                  <span className="h-px w-5 bg-border sm:w-10" />
                </div>
                <div className="flex flex-col items-center text-center">
                  <NetworkMark network={selected.to} className="size-12 rounded-[18px]" />
                  <p className="mt-3 text-[9px] uppercase tracking-[0.13em] text-subtle">Destination</p>
                  <p className="mt-1 text-xs font-medium capitalize">{selected.to}</p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-px border-b border-border bg-border text-[10px]">
                {[
                  ['Recorded', `${selected.date} · ${selected.time}`],
                  ['Asset', selected.asset],
                  ['Amount', `${selected.amount} USDC · public fixture`],
                  ['Verification', selected.verification],
                ].map(([label, value]) => (
                  <div key={label} className="bg-surface px-4 py-4">
                    <dt className="text-subtle">{label}</dt>
                    <dd className="mt-1.5 text-muted">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">Interface sequence</p>
                <ol className="mt-5">
                  {[
                    ['Intent prepared', true],
                    ['Privacy proof generated', false],
                    ['Destination settlement verified', false],
                  ].map(([label, complete], index) => (
                    <li key={label as string} className="relative flex gap-3 pb-6 last:pb-0">
                      {index < 2 && <span aria-hidden="true" className="absolute left-[9px] top-5 h-[calc(100%-8px)] w-px bg-border" />}
                      <span className="relative z-10 grid size-5 shrink-0 place-items-center rounded-full bg-surface">
                        {complete ? (
                          <span className="grid size-5 place-items-center rounded-full bg-success text-background"><Check aria-hidden="true" className="size-3" /></span>
                        ) : (
                          <Circle aria-hidden="true" className="size-5 text-border-strong" />
                        )}
                      </span>
                      <div>
                        <p className={cn('text-xs font-medium', complete ? 'text-foreground' : 'text-muted')}>{label as string}</p>
                        <p className="mt-1 text-[10px] text-subtle">{complete ? selected.statusDetail : 'No circuit or settlement adapter connected'}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-8 flex items-start gap-3 border-t border-border pt-5 text-[10px] leading-5 text-muted">
                <FileKey2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                Static fixture only. No confidential data, explorer record, proof, or transaction was loaded or decrypted.
              </div>
            </article>
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-6 border-y border-border py-7 lg:grid-cols-2">
        <div className="flex items-start gap-3">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="text-xs font-medium">Public ledgers remain public</p>
            <p className="mt-1 text-[11px] leading-5 text-muted">USDC amounts, wallet addresses, vault actions, and timestamps remain visible on Ethereum or Stellar.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <FileKey2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
          <div>
            <p className="text-xs font-medium">Private views require a policy layer</p>
            <p className="mt-1 text-[11px] leading-5 text-muted">Every reveal should be scoped, authorized, expiring, and written to a tamper-evident access log.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export { ActivityPage }
