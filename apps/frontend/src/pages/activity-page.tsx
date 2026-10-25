import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Eye,
  FileKey2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { NetworkRouteMark } from '../components/network-logo'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'

type DemoActivity = {
  id: string
  date: string
  route: string
  asset: string
  amount: string
  status: string
  verification: string
}

const demoActivity: DemoActivity[] = [
  {
    id: 'DEMO-2F9A',
    date: 'Oct 24, 2026',
    route: 'Ethereum → Stellar',
    asset: 'USDC',
    amount: '••••••',
    status: 'Prototype complete',
    verification: 'Not performed',
  },
  {
    id: 'DEMO-1C42',
    date: 'Oct 22, 2026',
    route: 'Ethereum → Stellar',
    asset: 'USDC',
    amount: '••••••',
    status: 'Prototype complete',
    verification: 'Not performed',
  },
  {
    id: 'DEMO-8B73',
    date: 'Oct 20, 2026',
    route: 'Ethereum → Stellar',
    asset: 'USDC',
    amount: '••••••',
    status: 'Prototype stopped',
    verification: 'Unavailable',
  },
]

function ActivityPage() {
  const [workspace, setWorkspace] = useState<'locked' | 'loading' | 'demo'>('locked')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<DemoActivity | null>(null)

  const filteredActivity = useMemo(
    () =>
      demoActivity.filter((item) =>
        [item.id, item.route, item.asset, item.status]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query],
  )

  const loadDemo = () => {
    setWorkspace('loading')
    window.setTimeout(() => setWorkspace('demo'), 700)
  }

  return (
    <div className="page-enter">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            <NetworkRouteMark />
            Private activity
          </p>
          <h1 className="mt-4 text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
            Your transfers, and only yours.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted">
            Production history requires owner authentication, authorization, and
            decryption. Those controls are not implemented in this frontend prototype.
          </p>
        </div>
        <span className="flex w-fit items-center gap-2 rounded-full border border-warning/25 bg-warning/[0.055] px-3 py-1.5 text-[10px] font-medium text-warning">
          <LockKeyhole aria-hidden="true" className="size-3.5" />
          Owner access unavailable
        </span>
      </div>

      <section className="mt-10 overflow-hidden rounded-[2rem] border border-border bg-surface" aria-labelledby="activity-title">
        {workspace === 'locked' && (
          <div className="grid min-h-[440px] place-items-center p-6 text-center">
            <div className="max-w-md">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-border bg-background text-accent">
                <KeyRound aria-hidden="true" className="size-5" />
              </span>
              <h2 id="activity-title" className="mt-6 text-xl font-semibold tracking-[-0.03em]">
                No authenticated owner session
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Real transaction history is intentionally unavailable until server-side
                authorization and encrypted storage exist.
              </p>
              <Button variant="secondary" className="mt-7" onClick={loadDemo}>
                <Eye aria-hidden="true" />
                View local demo data
              </Button>
              <p className="mt-3 text-[10px] text-subtle">
                Local fixtures only · no wallet or identity lookup
              </p>
            </div>
          </div>
        )}

        {workspace === 'loading' && (
          <div className="grid min-h-[440px] place-items-center p-6 text-center" aria-live="polite">
            <div>
              <LoaderCircle aria-hidden="true" className="mx-auto size-6 animate-spin text-accent" />
              <p className="mt-4 text-sm font-medium">Loading local fixtures…</p>
              <p className="mt-1 text-xs text-subtle">No network request is made.</p>
            </div>
          </div>
        )}

        {workspace === 'demo' && (
          <>
            <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="activity-title" className="text-sm font-semibold">Activity registry</h2>
                  <span className="rounded-md border border-warning/25 bg-warning/[0.06] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-warning">
                    Demo
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-subtle">Illustrative records with masked amounts</p>
              </div>
              <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-accent/50">
                <Search aria-hidden="true" className="size-3.5 text-subtle" />
                <span className="sr-only">Search demo activity</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search activity"
                  className="w-48 bg-transparent text-xs outline-none placeholder:text-subtle"
                />
              </label>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">
                    <th className="px-7 py-4">Reference</th>
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Route</th>
                    <th className="px-5 py-4">Asset</th>
                    <th className="px-5 py-4">Amount</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-7 py-4"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivity.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-b-0">
                      <td className="px-7 py-5 font-mono text-[11px]">{item.id}</td>
                      <td className="px-5 py-5 text-xs text-muted">{item.date}</td>
                      <td className="px-5 py-5"><span className="flex items-center gap-2 text-xs"><NetworkRouteMark />{item.route}</span></td>
                      <td className="px-5 py-5 text-xs text-muted">{item.asset}</td>
                      <td className="px-5 py-5 font-mono text-xs">{item.amount}</td>
                      <td className="px-5 py-5">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[9px] text-muted">
                          <CheckCircle2 aria-hidden="true" className="size-3 text-subtle" />
                          {item.status}
                        </span>
                      </td>
                      <td className="px-7 py-5 text-right">
                        <button
                          type="button"
                          className="focus-ring rounded-lg p-2 text-subtle hover:bg-background hover:text-foreground"
                          onClick={() => setSelected(item)}
                          aria-label={'View details for ' + item.id}
                        >
                          <ArrowRight aria-hidden="true" className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {filteredActivity.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="focus-ring flex w-full items-start justify-between gap-4 p-5 text-left"
                  onClick={() => setSelected(item)}
                >
                  <span>
                    <span className="font-mono text-[10px] text-subtle">{item.id}</span>
                    <span className="mt-2 flex items-center gap-2 text-sm font-medium"><NetworkRouteMark />{item.route}</span>
                    <span className="mt-1 block text-[11px] text-muted">{item.date} · {item.asset} · {item.amount}</span>
                  </span>
                  <ArrowRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-subtle" />
                </button>
              ))}
            </div>

            {filteredActivity.length === 0 && (
              <div className="grid min-h-64 place-items-center p-6 text-center">
                <div>
                  <Search aria-hidden="true" className="mx-auto size-5 text-subtle" />
                  <p className="mt-3 text-sm font-medium">No matching demo records</p>
                  <button type="button" onClick={() => setQuery('')} className="focus-ring mt-2 rounded-md text-xs text-accent">
                    Clear search
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="flex items-start gap-3 rounded-3xl border border-border bg-surface p-5">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="text-xs font-medium">On-chain visibility still matters</p>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              ZK proofs alone do not hide amounts, addresses, or relationships already
              published on public ledgers.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-3xl border border-border bg-surface p-5">
          <FileKey2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
          <div>
            <p className="text-xs font-medium">Production requirement</p>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              Server-side authorization and scoped decryption must back every private
              activity view.
            </p>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demo transaction details</DialogTitle>
            <DialogDescription>
              This record is a local fixture. It is not tied to an account, wallet,
              transaction, or proof.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <dl className="divide-y divide-border rounded-2xl border border-border bg-background/50 px-4 text-xs">
              {[
                ['Reference', selected.id],
                ['Date', selected.date],
                ['Route', selected.route],
                ['Asset', selected.asset],
                ['Amount', selected.amount + ' · intentionally masked'],
                ['UI status', selected.status],
                ['ZK verification', selected.verification],
                ['Explorer links', 'Unavailable'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-5 py-3.5">
                  <dt className="text-subtle">{label}</dt>
                  <dd className="text-right text-muted">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
            <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            No confidential data is loaded or decrypted by this prototype.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { ActivityPage }
