import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  EyeOff,
  FileKey2,
  KeyRound,
  LockKeyhole,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UsersRound,
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
import { cn } from '../lib/utils'

type RoleId = 'compliance' | 'custodian' | 'auditor' | 'platform'
type WorkspaceTab = 'transactions' | 'requests' | 'access' | 'audit'

type ScopedTransaction = {
  reference: string
  date: string
  institution: string
  status: string
  protectedFields: string[]
  requestId?: string
}

type DisclosureRequest = {
  id: string
  transaction: string
  institution: string
  fields: string[]
  mandate: string
  expires: string
  initialApprovals: number
}

const roles: Array<{
  id: RoleId
  label: string
  description: string
  icon: typeof ShieldCheck
}> = [
  {
    id: 'compliance',
    label: 'Compliance officer',
    description: 'Reviews scoped metadata and requests field access.',
    icon: FileKey2,
  },
  {
    id: 'custodian',
    label: 'Key custodian',
    description: 'Approves or refuses a scoped release request.',
    icon: KeyRound,
  },
  {
    id: 'auditor',
    label: 'Authorized auditor',
    description: 'Views only the fields covered by an approved grant.',
    icon: Eye,
  },
  {
    id: 'platform',
    label: 'Platform operator',
    description: 'Runs the service without access to protected fields.',
    icon: UsersRound,
  },
]

const transactions: ScopedTransaction[] = [
  {
    reference: 'ZK-DEMO-4A81',
    date: 'Oct 24, 2026',
    institution: 'Example Financial Authority',
    status: 'Settlement fixture complete',
    protectedFields: ['Amount', 'Asset'],
    requestId: 'DEC-DEMO-021',
  },
  {
    reference: 'ZK-DEMO-3C20',
    date: 'Oct 23, 2026',
    institution: 'Example Bank Audit',
    status: 'Review fixture',
    protectedFields: ['Verification metadata'],
    requestId: 'DEC-DEMO-020',
  },
  {
    reference: 'ZK-DEMO-19B7',
    date: 'Oct 21, 2026',
    institution: 'Example Compliance Unit',
    status: 'Settlement fixture stopped',
    protectedFields: ['Amount', 'Source', 'Destination'],
  },
]

const requests: DisclosureRequest[] = [
  {
    id: 'DEC-DEMO-021',
    transaction: 'ZK-DEMO-4A81',
    institution: 'Example Financial Authority',
    fields: ['Amount', 'Asset'],
    mandate: 'MANDATE-DEMO-A42',
    expires: 'Oct 26 · 18:00',
    initialApprovals: 2,
  },
  {
    id: 'DEC-DEMO-020',
    transaction: 'ZK-DEMO-3C20',
    institution: 'Example Bank Audit',
    fields: ['Verification metadata'],
    mandate: 'MANDATE-DEMO-B18',
    expires: 'Oct 27 · 09:30',
    initialApprovals: 1,
  },
]

const auditEntries = [
  {
    actor: 'Authorized auditor demo',
    action: 'Viewed approved fixture fields',
    target: 'ZK-DEMO-4A81',
    authorization: 'MANDATE-DEMO-A42',
    time: 'Oct 24 · 14:08',
  },
  {
    actor: 'Key custodian demo',
    action: 'Recorded approval 1/2',
    target: 'DEC-DEMO-020',
    authorization: 'MANDATE-DEMO-B18',
    time: 'Oct 24 · 11:42',
  },
]

function CompliancePage() {
  const [enteredDemo, setEnteredDemo] = useState(false)
  const [role, setRole] = useState<RoleId>('compliance')
  const [tab, setTab] = useState<WorkspaceTab>('transactions')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ScopedTransaction | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [requestedTransactions, setRequestedTransactions] = useState<string[]>([])
  const [approvalCounts, setApprovalCounts] = useState<Record<string, number>>(
    Object.fromEntries(requests.map((request) => [request.id, request.initialApprovals])),
  )

  const activeRole = roles.find((item) => item.id === role) ?? roles[0]
  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) =>
        Object.values(transaction).flat().join(' ').toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  )

  const selectedGrant = selected?.requestId
    ? requests.find((request) => request.id === selected.requestId)
    : undefined
  const selectedApprovals = selectedGrant ? approvalCounts[selectedGrant.id] ?? 0 : 0
  const canReveal = role === 'auditor' && Boolean(selectedGrant) && selectedApprovals >= 2
  const ActiveRoleIcon = activeRole.icon

  const changeRole = (nextRole: RoleId) => {
    setRole(nextRole)
    setRevealed(false)
  }

  const requestAccess = (transaction: ScopedTransaction) => {
    setRequestedTransactions((current) =>
      current.includes(transaction.reference) ? current : [...current, transaction.reference],
    )
    setSelected(null)
    setTab('requests')
  }

  if (!enteredDemo) {
    return (
      <div className="page-enter mx-auto grid min-h-[calc(100vh-11rem)] max-w-[980px] items-center gap-10 py-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            <NetworkRouteMark />
            Unified compliance workspace
          </p>
          <h1 className="mt-5 text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
            One space. Different permissions.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-muted">
            Institutions, custodians, auditors, and platform operators work from the same
            transaction registry. Each role receives only the actions and fields it needs.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {[
              ['1', 'See assigned transactions', 'Reference, route, date, and workflow status are visible within scope.'],
              ['2', 'Request and approve access', 'Protected fields require a named mandate and threshold approval.'],
              ['3', 'Reveal only granted fields', 'An authorized auditor sees the approved fields for one transaction.'],
            ].map(([number, title, text]) => (
              <div key={number} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-border bg-surface font-mono text-[10px] text-accent">
                  {number}
                </span>
                <div>
                  <p className="text-xs font-medium">{title}</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <section className="hairline-card rounded-[2rem] border border-border bg-surface p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-white">
            <Building2 aria-hidden="true" className="size-5" />
          </span>
          <h2 className="mt-7 text-xl font-semibold tracking-[-0.03em]">Open the role-based demo</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Choose roles inside the workspace to understand what each participant can see
            and do.
          </p>
          <Button variant="accent" size="lg" className="mt-7 w-full" onClick={() => setEnteredDemo(true)}>
            Open Compliance workspace
            <ArrowRight aria-hidden="true" />
          </Button>
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/20 bg-warning/[0.05] p-3 text-[10px] leading-4 text-muted">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
            This is local UI state. No identity, mandate, key, transaction, or confidential
            value is authenticated or decrypted.
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page-enter">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            <NetworkRouteMark />
            Compliance workspace
          </p>
          <h1 className="mt-4 text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
            Transactions with explicit access.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted">
            Shared workspace for review, approval, scoped disclosure, and access evidence.
          </p>
        </div>

        <label className="w-full rounded-2xl border border-border bg-surface p-3 lg:w-72">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">Demo role</span>
          <select
            value={role}
            onChange={(event) => changeRole(event.target.value as RoleId)}
            className="mt-2 w-full bg-transparent text-xs font-medium outline-none"
          >
            {roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-7 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            <strong className="font-semibold text-foreground">Interface simulation only.</strong>{' '}
            It does not authenticate roles, verify mandates, release keys, or decrypt data.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 lg:min-w-72">
          <span className="grid size-9 place-items-center rounded-xl bg-accent/10 text-accent">
            <ActiveRoleIcon aria-hidden="true" className="size-4" />
          </span>
          <div>
            <p className="text-xs font-semibold">{activeRole.label}</p>
            <p className="mt-1 text-[9px] text-subtle">{activeRole.description}</p>
          </div>
        </div>
      </div>

      <section className="mt-5 overflow-hidden rounded-[2rem] border border-border bg-surface">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div role="tablist" aria-label="Compliance workspace sections" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-background p-1">
            {[
              ['transactions', 'Transactions'],
              ['requests', 'Access requests'],
              ['access', 'Roles'],
              ['audit', 'Audit log'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id as WorkspaceTab)}
                className={cn(
                  'focus-ring min-w-max rounded-lg px-3 py-2 text-[11px] font-medium transition-colors',
                  tab === id ? 'bg-surface-raised text-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'transactions' && (
            <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-accent/50">
              <Search aria-hidden="true" className="size-3.5 text-subtle" />
              <span className="sr-only">Search transaction registry</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search transactions"
                className="w-44 bg-transparent text-xs outline-none placeholder:text-subtle"
              />
            </label>
          )}
        </div>

        {tab === 'transactions' && (
          <div role="tabpanel">
            <div className="border-b border-border bg-background/35 px-5 py-4 text-[11px] leading-5 text-muted sm:px-7">
              Everyone sees only transactions assigned to their institution or operational scope.
              Amounts, counterparties, and verification details remain masked until a grant is approved.
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">
                    <th className="px-7 py-4">Reference</th>
                    <th className="px-5 py-4">Route</th>
                    <th className="px-5 py-4">Institution</th>
                    <th className="px-5 py-4">Protected fields</th>
                    <th className="px-5 py-4">Access</th>
                    <th className="px-7 py-4"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((transaction) => {
                    const approvals = transaction.requestId ? approvalCounts[transaction.requestId] ?? 0 : 0
                    return (
                      <tr key={transaction.reference} className="border-b border-border last:border-b-0">
                        <td className="px-7 py-5"><p className="font-mono text-[11px]">{transaction.reference}</p><p className="mt-1 text-[9px] text-subtle">{transaction.date}</p></td>
                        <td className="px-5 py-5"><span className="flex items-center gap-2 text-xs"><NetworkRouteMark /> Ethereum → Stellar</span></td>
                        <td className="px-5 py-5 text-xs text-muted">{transaction.institution}</td>
                        <td className="px-5 py-5 text-[10px] text-muted">{transaction.protectedFields.join(' · ')}</td>
                        <td className="px-5 py-5">
                          <span className={cn(
                            'inline-flex rounded-full border px-2 py-1 text-[9px]',
                            approvals >= 2 ? 'border-success/25 text-success' : 'border-warning/25 text-warning',
                          )}>
                            {approvals >= 2 ? 'Approved 2/2' : transaction.requestId ? `Pending ${approvals}/2` : 'No request'}
                          </span>
                        </td>
                        <td className="px-7 py-5 text-right">
                          <button
                            type="button"
                            className="focus-ring rounded-lg p-2 text-subtle hover:bg-background hover:text-foreground"
                            onClick={() => { setSelected(transaction); setRevealed(false) }}
                            aria-label={'Inspect ' + transaction.reference}
                          >
                            <ArrowRight aria-hidden="true" className="size-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {filteredTransactions.map((transaction) => (
                <button
                  key={transaction.reference}
                  type="button"
                  onClick={() => { setSelected(transaction); setRevealed(false) }}
                  className="focus-ring flex w-full items-start justify-between gap-4 p-5 text-left"
                >
                  <span>
                    <span className="font-mono text-[10px] text-subtle">{transaction.reference}</span>
                    <span className="mt-2 flex items-center gap-2 text-sm font-medium"><NetworkRouteMark /> Ethereum → Stellar</span>
                    <span className="mt-2 block text-[10px] text-muted">Protected: {transaction.protectedFields.join(' · ')}</span>
                  </span>
                  <ArrowRight aria-hidden="true" className="mt-1 size-4 text-subtle" />
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'requests' && (
          <div role="tabpanel" className="divide-y divide-border">
            {requestedTransactions.map((reference) => (
              <article key={reference} className="grid gap-3 bg-accent/[0.035] px-5 py-5 sm:px-7 lg:grid-cols-[130px_1fr_1fr_130px] lg:items-center">
                <span className="font-mono text-[10px] text-accent">LOCAL-NEW</span>
                <div><p className="text-[9px] text-subtle">Transaction</p><p className="mt-1 text-xs">{reference}</p></div>
                <div><p className="text-[9px] text-subtle">Requested scope</p><p className="mt-1 text-xs">Selected protected fields</p></div>
                <span className="w-fit rounded-full border border-warning/25 px-2 py-1 text-[9px] text-warning">Local draft 0/2</span>
              </article>
            ))}
            {requests.map((request) => {
              const approvals = approvalCounts[request.id] ?? 0
              return (
                <article key={request.id} className="grid gap-4 px-5 py-5 sm:px-7 lg:grid-cols-[120px_1fr_1fr_1fr_150px] lg:items-center">
                  <span className="font-mono text-[10px] text-subtle">{request.id}</span>
                  <div><p className="text-[9px] text-subtle">Transaction</p><p className="mt-1 text-xs">{request.transaction}</p></div>
                  <div><p className="text-[9px] text-subtle">Fields</p><p className="mt-1 text-xs">{request.fields.join(' · ')}</p></div>
                  <div><p className="text-[9px] text-subtle">Mandate · expiry</p><p className="mt-1 font-mono text-[9px]">{request.mandate}</p><p className="mt-1 text-[9px] text-subtle">{request.expires}</p></div>
                  {role === 'custodian' && approvals < 2 ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setApprovalCounts((current) => ({ ...current, [request.id]: Math.min(2, approvals + 1) }))}
                    >
                      <UserCheck aria-hidden="true" />
                      Approve {approvals}/2
                    </Button>
                  ) : (
                    <span className={cn(
                      'w-fit rounded-full border px-2 py-1 text-[9px]',
                      approvals >= 2 ? 'border-success/25 text-success' : 'border-warning/25 text-warning',
                    )}>
                      {approvals >= 2 ? 'Grant ready 2/2' : `Pending ${approvals}/2`}
                    </span>
                  )}
                </article>
              )
            })}
            <div className="flex items-start gap-3 bg-background/35 px-5 py-5 text-[11px] leading-5 text-muted sm:px-7">
              <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              Production must verify institutional identity, mandate validity, field scope,
              threshold approval, and expiry on the server before any key release.
            </div>
          </div>
        )}

        {tab === 'access' && (
          <div role="tabpanel" className="p-5 sm:p-7">
            <div className="grid gap-3 md:grid-cols-2">
              {roles.map((item) => {
                const Icon = item.icon
                const permissions = {
                  compliance: ['See assigned metadata', 'Create scoped requests', 'Cannot approve or reveal'],
                  custodian: ['See request scopes', 'Record one threshold approval', 'Cannot reveal fields'],
                  auditor: ['See assigned metadata', 'Reveal fields after 2/2', 'Cannot approve own access'],
                  platform: ['Monitor service operations', 'Manage no disclosure keys', 'Cannot reveal fields'],
                }[item.id]
                return (
                  <article key={item.id} className={cn('rounded-3xl border p-5', role === item.id ? 'border-accent/35 bg-accent/[0.04]' : 'border-border bg-background/35')}>
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-surface-raised text-accent"><Icon aria-hidden="true" className="size-4" /></span>
                      <div><p className="text-xs font-semibold">{item.label}</p><p className="mt-1 text-[9px] text-subtle">{item.description}</p></div>
                    </div>
                    <div className="mt-5 space-y-2">
                      {permissions.map((permission) => (
                        <p key={permission} className="flex items-center gap-2 text-[10px] text-muted"><CheckCircle2 aria-hidden="true" className="size-3 text-accent" />{permission}</p>
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div role="tabpanel" className="divide-y divide-border">
            {auditEntries.map((entry) => (
              <article key={entry.authorization} className="grid gap-4 px-5 py-5 sm:px-7 lg:grid-cols-[1.2fr_1.4fr_1fr_1fr_120px] lg:items-center">
                <div><p className="text-[9px] text-subtle">Actor</p><p className="mt-1 text-xs">{entry.actor}</p></div>
                <div><p className="text-[9px] text-subtle">Action</p><p className="mt-1 text-xs">{entry.action}</p></div>
                <div><p className="text-[9px] text-subtle">Target</p><p className="mt-1 font-mono text-[10px]">{entry.target}</p></div>
                <div><p className="text-[9px] text-subtle">Time</p><p className="mt-1 text-xs">{entry.time}</p></div>
                <span className="font-mono text-[9px] text-subtle">{entry.authorization}</span>
              </article>
            ))}
            <div className="flex items-start gap-3 bg-background/35 px-5 py-5 text-[11px] leading-5 text-muted sm:px-7">
              <ClipboardList aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              Demo entries only. A production log must be server-side, append-only, and tamper-evident.
            </div>
          </div>
        )}
      </section>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setRevealed(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaction access</DialogTitle>
            <DialogDescription>
              Metadata is visible inside the assigned scope. Protected fields require a valid,
              approved, unexpired disclosure grant.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <>
              <div className="rounded-2xl border border-border bg-background/45 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div><p className="font-mono text-xs">{selected.reference}</p><p className="mt-1 text-[10px] text-subtle">{selected.institution}</p></div>
                  <NetworkRouteMark />
                </div>
                <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-[11px] sm:grid-cols-2">
                  <div><dt className="text-subtle">Date</dt><dd className="mt-1">{selected.date}</dd></div>
                  <div><dt className="text-subtle">Status</dt><dd className="mt-1">{selected.status}</dd></div>
                </dl>
              </div>

              <div className="rounded-2xl border border-border bg-background/45 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Protected fields</p>
                  <span className="text-[9px] text-subtle">{selectedApprovals}/2 approvals</span>
                </div>
                <div className="mt-4 space-y-3">
                  {selected.protectedFields.map((field) => (
                    <div key={field} className="flex items-center justify-between gap-4 text-[11px]">
                      <span className="text-subtle">{field}</span>
                      {revealed && canReveal ? (
                        <span className="font-mono text-right text-accent">
                          {field === 'Amount' ? '24,800 USDC · fixture' : field === 'Asset' ? 'USDC · fixture' : 'Authorized fixture value'}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 font-mono text-subtle"><EyeOff aria-hidden="true" className="size-3" />••••••••</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {canReveal ? (
                <Button variant={revealed ? 'secondary' : 'accent'} onClick={() => setRevealed((current) => !current)}>
                  {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  {revealed ? 'Hide fixture fields' : 'Preview authorized fixture fields'}
                </Button>
              ) : role === 'compliance' ? (
                <Button
                  variant="accent"
                  disabled={requestedTransactions.includes(selected.reference)}
                  onClick={() => requestAccess(selected)}
                >
                  <FileKey2 aria-hidden="true" />
                  {requestedTransactions.includes(selected.reference) ? 'Demo request created' : 'Create demo access request'}
                </Button>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
                  {selectedApprovals < 2 ? <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" /> : <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />}
                  {selectedApprovals < 2
                    ? 'This transaction does not have the required two approvals.'
                    : `${activeRole.label} is not allowed to reveal protected transaction fields.`}
                </div>
              )}

              {revealed && (
                <p className="text-[10px] leading-4 text-warning">
                  These values are static UI fixtures. No cryptographic decryption occurred.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { CompliancePage }
