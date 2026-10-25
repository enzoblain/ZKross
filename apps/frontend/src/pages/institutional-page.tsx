import {
  ArrowRight,
  Building2,
  ClipboardList,
  Eye,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  Search,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'

import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { cn } from '../lib/utils'

type PortalTab = 'registry' | 'disclosures' | 'audit'

const registry = [
  {
    reference: 'ZK-DEMO-4A81',
    date: 'Oct 24, 2026',
    route: 'Ethereum → Stellar',
    verification: 'Not performed',
    disclosure: 'No request',
  },
  {
    reference: 'ZK-DEMO-3C20',
    date: 'Oct 23, 2026',
    route: 'Ethereum → Stellar',
    verification: 'Not performed',
    disclosure: 'Prototype pending',
  },
  {
    reference: 'ZK-DEMO-19B7',
    date: 'Oct 21, 2026',
    route: 'Ethereum → Stellar',
    verification: 'Unavailable',
    disclosure: 'No request',
  },
]

const disclosures = [
  {
    reference: 'REQ-DEMO-011',
    transaction: 'ZK-DEMO-3C20',
    scope: 'Asset + amount',
    authority: 'Example mandate A-42',
    status: 'UI review only',
  },
  {
    reference: 'REQ-DEMO-008',
    transaction: 'ZK-DEMO-19B7',
    scope: 'Verification metadata',
    authority: 'Example mandate B-18',
    status: 'Closed fixture',
  },
]

const auditEntries = [
  {
    actor: 'Example audit team',
    action: 'Viewed fixture',
    target: 'ZK-DEMO-4A81',
    time: 'Oct 24 · 14:08',
    authorization: 'DEMO-AUTH-92',
  },
  {
    actor: 'Example compliance reviewer',
    action: 'Opened disclosure fixture',
    target: 'REQ-DEMO-008',
    time: 'Oct 23 · 09:41',
    authorization: 'DEMO-AUTH-88',
  },
]

function InstitutionalPage() {
  const [demoAccess, setDemoAccess] = useState(false)
  const [tab, setTab] = useState<PortalTab>('registry')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<(typeof registry)[number] | null>(null)

  const filteredRegistry = useMemo(
    () =>
      registry.filter((item) =>
        Object.values(item).join(' ').toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  )

  const enterDemo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setDemoAccess(true)
  }

  if (!demoAccess) {
    return (
      <div className="page-enter mx-auto grid min-h-[calc(100vh-11rem)] max-w-[980px] items-center gap-10 py-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            Institutional portal
          </p>
          <h1 className="mt-4 text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
            Controlled access. Explicit scope.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-muted">
            The future portal separates institutional auditors from platform
            administrators and limits disclosure to verified authorizations.
          </p>

          <div className="mt-8 space-y-4">
            {[
              {
                icon: KeyRound,
                title: 'Institutional identity + MFA',
                text: 'Wallet ownership is never enough to establish regulatory authority.',
              },
              {
                icon: Eye,
                title: 'Scoped disclosure',
                text: 'Only data covered by a valid permission should be released.',
              },
              {
                icon: ClipboardList,
                title: 'Tamper-resistant audit trail',
                text: 'Every access event needs durable server-side evidence.',
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="flex gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-accent">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-medium">{item.title}</p>
                    <p className="mt-1 text-[11px] leading-5 text-muted">{item.text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <form
          onSubmit={enterDemo}
          className="hairline-card rounded-[2rem] border border-border bg-surface p-6 sm:p-8"
          aria-labelledby="institutional-signin"
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-white">
            <Building2 aria-hidden="true" className="size-5" />
          </span>
          <h2 id="institutional-signin" className="mt-7 text-xl font-semibold tracking-[-0.03em]">
            Institutional access
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Authentication is not implemented. The fields below demonstrate the intended
            enterprise flow and do not submit or store data.
          </p>

          <div className="mt-7 space-y-4">
            <div>
              <label htmlFor="work-email" className="mb-2 block text-xs font-medium text-muted">
                Work email
              </label>
              <input
                id="work-email"
                type="email"
                placeholder="name@institution.example"
                className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition-colors placeholder:text-subtle focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
              />
            </div>
            <div>
              <label htmlFor="access-reference" className="mb-2 block text-xs font-medium text-muted">
                Access reference
              </label>
              <input
                id="access-reference"
                placeholder="Issued by your administrator"
                className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition-colors placeholder:text-subtle focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
              />
            </div>
          </div>

          <Button variant="accent" size="lg" className="mt-6 w-full" type="submit">
            Open read-only interface demo
            <ArrowRight aria-hidden="true" />
          </Button>
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/20 bg-warning/[0.05] p-3 text-[10px] leading-4 text-muted">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
            No authentication, MFA, permission check, disclosure, or confidential data
            access occurs.
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="page-enter">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            Institutional portal
          </p>
          <h1 className="mt-4 text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
            Authorized scope.
          </h1>
          <p className="mt-4 text-sm text-muted">
            Read-only interface demonstration using local fixtures.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setDemoAccess(false)}>
          <LockKeyhole aria-hidden="true" />
          Exit demo
        </Button>
      </div>

      <div className="mt-8 flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>
          <strong className="font-semibold text-foreground">Mock authorization boundary.</strong>{' '}
          This browser state does not authenticate an institution or grant access to
          confidential transaction data.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'In-scope fixtures', value: '03', icon: FileCheck2 },
          { label: 'Proofs verified', value: '00', icon: ShieldCheck },
          { label: 'Review fixtures', value: '01', icon: Eye },
          { label: 'Disclosure fixtures', value: '02', icon: ClipboardList },
        ].map((metric) => {
          const Icon = metric.icon
          return (
            <article key={metric.label} className="rounded-3xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between">
                <Icon aria-hidden="true" className="size-4 text-accent" />
                <span className="text-[8px] font-semibold uppercase tracking-wider text-warning">Local demo</span>
              </div>
              <p className="mt-7 text-[10px] text-subtle">{metric.label}</p>
              <p className="mt-1 text-2xl font-medium tracking-[-0.04em]">{metric.value}</p>
            </article>
          )
        })}
      </div>

      <section className="mt-5 overflow-hidden rounded-[2rem] border border-border bg-surface">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div role="tablist" aria-label="Institutional portal sections" className="flex gap-1 rounded-xl border border-border bg-background p-1">
            {[
              ['registry', 'Registry'],
              ['disclosures', 'Disclosure'],
              ['audit', 'Audit log'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id as PortalTab)}
                className={cn(
                  'focus-ring rounded-lg px-3 py-2 text-[11px] font-medium transition-colors',
                  tab === id ? 'bg-surface-raised text-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'registry' && (
            <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-accent/50">
              <Search aria-hidden="true" className="size-3.5 text-subtle" />
              <span className="sr-only">Search transaction registry</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search registry"
                className="w-44 bg-transparent text-xs outline-none placeholder:text-subtle"
              />
            </label>
          )}
        </div>

        {tab === 'registry' && (
          <div role="tabpanel">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">
                    <th className="px-7 py-4">Reference</th>
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Route</th>
                    <th className="px-5 py-4">Verification</th>
                    <th className="px-5 py-4">Disclosure</th>
                    <th className="px-7 py-4"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegistry.map((item) => (
                    <tr key={item.reference} className="border-b border-border last:border-b-0">
                      <td className="px-7 py-5 font-mono text-[11px]">{item.reference}</td>
                      <td className="px-5 py-5 text-xs text-muted">{item.date}</td>
                      <td className="px-5 py-5 text-xs">{item.route}</td>
                      <td className="px-5 py-5 text-xs text-warning">{item.verification}</td>
                      <td className="px-5 py-5 text-xs text-muted">{item.disclosure}</td>
                      <td className="px-7 py-5 text-right">
                        <button
                          type="button"
                          className="focus-ring rounded-lg p-2 text-subtle hover:bg-background hover:text-foreground"
                          onClick={() => setSelected(item)}
                          aria-label={'Inspect ' + item.reference}
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
              {filteredRegistry.map((item) => (
                <button
                  key={item.reference}
                  type="button"
                  onClick={() => setSelected(item)}
                  className="focus-ring flex w-full items-start justify-between gap-4 p-5 text-left"
                >
                  <span>
                    <span className="font-mono text-[10px] text-subtle">{item.reference}</span>
                    <span className="mt-2 block text-sm font-medium">{item.route}</span>
                    <span className="mt-1 block text-[11px] text-warning">{item.verification}</span>
                  </span>
                  <ArrowRight aria-hidden="true" className="mt-1 size-4 text-subtle" />
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'disclosures' && (
          <div role="tabpanel" className="divide-y divide-border">
            {disclosures.map((item) => (
              <article key={item.reference} className="grid gap-4 px-5 py-5 sm:px-7 lg:grid-cols-[120px_1fr_1fr_1fr_130px] lg:items-center">
                <span className="font-mono text-[10px] text-subtle">{item.reference}</span>
                <div><p className="text-[9px] text-subtle">Transaction</p><p className="mt-1 text-xs">{item.transaction}</p></div>
                <div><p className="text-[9px] text-subtle">Requested scope</p><p className="mt-1 text-xs">{item.scope}</p></div>
                <div><p className="text-[9px] text-subtle">Authorization</p><p className="mt-1 text-xs">{item.authority}</p></div>
                <span className="w-fit rounded-full border border-warning/20 px-2 py-1 text-[9px] text-warning">{item.status}</span>
              </article>
            ))}
            <div className="flex items-start gap-3 bg-background/35 px-5 py-5 text-[11px] leading-5 text-muted sm:px-7">
              <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              The backend must verify identity, scope, and authority before any decryption
              or release. This prototype performs none of those actions.
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div role="tabpanel" className="divide-y divide-border">
            {auditEntries.map((entry) => (
              <article key={entry.authorization} className="grid gap-4 px-5 py-5 sm:px-7 lg:grid-cols-[1.2fr_1fr_1fr_1fr_120px] lg:items-center">
                <div><p className="text-[9px] text-subtle">Actor</p><p className="mt-1 text-xs">{entry.actor}</p></div>
                <div><p className="text-[9px] text-subtle">Action</p><p className="mt-1 text-xs">{entry.action}</p></div>
                <div><p className="text-[9px] text-subtle">Target</p><p className="mt-1 font-mono text-[10px]">{entry.target}</p></div>
                <div><p className="text-[9px] text-subtle">Time</p><p className="mt-1 text-xs">{entry.time}</p></div>
                <span className="font-mono text-[9px] text-subtle">{entry.authorization}</span>
              </article>
            ))}
            <div className="flex items-start gap-3 bg-background/35 px-5 py-5 text-[11px] leading-5 text-muted sm:px-7">
              <ClipboardList aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              These are editable frontend fixtures, not an immutable or security-grade audit log.
            </div>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
              <UsersRound aria-hidden="true" className="size-4" />
            </span>
            <h2 className="text-sm font-semibold">Institutional auditors</h2>
          </div>
          <p className="mt-4 text-xs leading-5 text-muted">
            Future access is limited to an institution's verified mandate and transaction scope.
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-background text-subtle">
              <KeyRound aria-hidden="true" className="size-4" />
            </span>
            <h2 className="text-sm font-semibold">Platform administrators</h2>
          </div>
          <p className="mt-4 text-xs leading-5 text-muted">
            Operational administration must not imply unrestricted access to confidential transaction data.
          </p>
        </article>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scoped transaction view</DialogTitle>
            <DialogDescription>
              Read-only local fixture. Confidential fields remain unavailable because no
              authorization or decryption service is connected.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <dl className="divide-y divide-border rounded-2xl border border-border bg-background/50 px-4 text-xs">
              {[
                ['Reference', selected.reference],
                ['Date', selected.date],
                ['Route', selected.route],
                ['Verification', selected.verification],
                ['Disclosure', selected.disclosure],
                ['Amount', 'Protected · unavailable'],
                ['Counterparties', 'Protected · unavailable'],
                ['Authorization', 'Not verified'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-5 py-3.5">
                  <dt className="text-subtle">{label}</dt>
                  <dd className="text-right text-muted">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            No frontend action can unlock protected information.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { InstitutionalPage }
