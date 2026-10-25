import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  FileKey2,
  KeyRound,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { cn } from '../lib/utils'

type AdminRole = 'platform-admin' | 'compliance' | 'auditor' | 'custodian'
type AdminTab = 'requests' | 'roles' | 'access-log'

type DecryptionRequest = {
  id: string
  transaction: string
  institution: string
  fields: string[]
  approvals: number
  authorization: string
  expires: string
}

const roles: Array<{
  id: AdminRole
  label: string
  canRequest: boolean
  canApprove: boolean
  canReveal: boolean
}> = [
  { id: 'platform-admin', label: 'Platform administrator', canRequest: false, canApprove: false, canReveal: false },
  { id: 'compliance', label: 'Compliance officer', canRequest: true, canApprove: false, canReveal: false },
  { id: 'auditor', label: 'Authorized auditor', canRequest: false, canApprove: false, canReveal: true },
  { id: 'custodian', label: 'Key custodian', canRequest: false, canApprove: true, canReveal: false },
]

const requests: DecryptionRequest[] = [
  {
    id: 'DEC-DEMO-021',
    transaction: 'ZK-DEMO-4A81',
    institution: 'Example Financial Authority',
    fields: ['Amount', 'Asset'],
    approvals: 2,
    authorization: 'MANDATE-DEMO-A42',
    expires: 'Oct 26 · 18:00',
  },
  {
    id: 'DEC-DEMO-020',
    transaction: 'ZK-DEMO-3C20',
    institution: 'Example Bank Audit',
    fields: ['Verification metadata'],
    approvals: 1,
    authorization: 'MANDATE-DEMO-B18',
    expires: 'Oct 27 · 09:30',
  },
  {
    id: 'DEC-DEMO-019',
    transaction: 'ZK-DEMO-19B7',
    institution: 'Example Compliance Unit',
    fields: ['Amount', 'Source', 'Destination'],
    approvals: 0,
    authorization: 'MANDATE-DEMO-C07',
    expires: 'Oct 28 · 12:00',
  },
]

const accessLog = [
  {
    actor: 'Auditor demo profile',
    request: 'DEC-DEMO-018',
    action: 'Viewed authorized fixture fields',
    time: 'Oct 24 · 14:08',
  },
  {
    actor: 'Custodian demo profile',
    request: 'DEC-DEMO-020',
    action: 'Recorded demo approval 1/2',
    time: 'Oct 24 · 11:42',
  },
]

function AdminPage() {
  const [enteredDemo, setEnteredDemo] = useState(false)
  const [role, setRole] = useState<AdminRole>('platform-admin')
  const [tab, setTab] = useState<AdminTab>('requests')
  const [selected, setSelected] = useState<DecryptionRequest | null>(null)
  const [revealed, setRevealed] = useState(false)

  const activeRole = roles.find((item) => item.id === role) ?? roles[0]
  const canRevealSelected =
    activeRole.canReveal && Boolean(selected && selected.approvals >= 2)

  if (!enteredDemo) {
    return (
      <div className="page-enter mx-auto grid min-h-[calc(100vh-11rem)] max-w-[920px] place-items-center py-4">
        <section className="grid overflow-hidden rounded-[2rem] border border-border bg-surface lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-border bg-background/40 p-7 lg:border-b-0 lg:border-r lg:p-10">
            <span className="grid size-12 place-items-center rounded-2xl bg-accent text-white">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
              Administration
            </p>
            <h1 className="mt-4 text-3xl font-medium tracking-[-0.045em]">
              Operations without universal access.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted">
              Platform administration, approval custody, and confidential disclosure are
              separate responsibilities. No role receives every permission.
            </p>
          </div>

          <div className="p-7 lg:p-10">
            <p className="text-sm font-semibold">Role-gated administration</p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Production requires institutional identity, MFA, server-side RBAC, scoped key
              release, and an immutable audit log.
            </p>
            <div className="mt-7 space-y-3">
              {[
                'Platform admins cannot view confidential transaction fields.',
                'Decryption is granted per transaction and per field.',
                'Threshold approval is required before an auditor can view data.',
                'Every access event must be written to a protected audit log.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 text-xs leading-5 text-muted">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  {item}
                </div>
              ))}
            </div>
            <Button variant="accent" size="lg" className="mt-8 w-full" onClick={() => setEnteredDemo(true)}>
              <KeyRound aria-hidden="true" />
              Open RBAC interface demo
            </Button>
            <p className="mt-3 text-center text-[10px] text-subtle">
              No authentication or cryptographic key is created.
            </p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page-enter">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            Regulated administration
          </p>
          <h1 className="mt-4 text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
            Least privilege, transaction by transaction.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted">
            A control-plane prototype for role separation, threshold approval, and
            field-scoped transaction disclosure.
          </p>
        </div>
        <div className="w-full rounded-2xl border border-border bg-surface p-3 lg:w-72">
          <label htmlFor="role-simulator" className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">
            Demo role
          </label>
          <select
            id="role-simulator"
            value={role}
            onChange={(event) => {
              setRole(event.target.value as AdminRole)
              setRevealed(false)
            }}
            className="mt-2 w-full bg-transparent text-xs font-medium outline-none"
          >
            {roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-8 flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>
          <strong className="font-semibold text-foreground">Policy simulation only.</strong>{' '}
          Controls on this page run in browser state. They do not authenticate users,
          approve mandates, release keys, decrypt transactions, or write immutable logs.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Can manage platform', value: role === 'platform-admin' ? 'Yes' : 'No', icon: UsersRound },
          { label: 'Can request disclosure', value: activeRole.canRequest ? 'Yes' : 'No', icon: FileKey2 },
          { label: 'Can approve key release', value: activeRole.canApprove ? 'Yes' : 'No', icon: UserCheck },
          { label: 'Can view granted fields', value: activeRole.canReveal ? 'Scoped' : 'No', icon: Eye },
        ].map((item) => {
          const Icon = item.icon
          return (
            <article key={item.label} className="rounded-3xl border border-border bg-surface p-5">
              <Icon aria-hidden="true" className="size-4 text-accent" />
              <p className="mt-6 text-[10px] text-subtle">{item.label}</p>
              <p className="mt-1 text-xl font-medium tracking-[-0.035em]">{item.value}</p>
            </article>
          )
        })}
      </div>

      <section className="mt-5 overflow-hidden rounded-[2rem] border border-border bg-surface">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div role="tablist" aria-label="Administration sections" className="flex w-fit rounded-xl border border-border bg-background p-1">
            {[
              ['requests', 'Decryption requests'],
              ['roles', 'Role matrix'],
              ['access-log', 'Access log'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id as AdminTab)}
                className={cn(
                  'focus-ring rounded-lg px-3 py-2 text-[10px] font-medium',
                  tab === id ? 'bg-surface-raised text-foreground' : 'text-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-subtle">
            Viewing as <strong className="font-medium text-foreground">{activeRole.label}</strong>
          </span>
        </div>

        {tab === 'requests' && (
          <div role="tabpanel" className="divide-y divide-border">
            {requests.map((request) => (
              <article
                key={request.id}
                className="grid gap-4 px-5 py-5 sm:px-7 lg:grid-cols-[120px_1fr_1fr_100px_115px_40px] lg:items-center"
              >
                <div>
                  <p className="font-mono text-[10px] text-subtle">{request.id}</p>
                  <p className="mt-1 font-mono text-[10px]">{request.transaction}</p>
                </div>
                <div>
                  <p className="text-[9px] text-subtle">Institution</p>
                  <p className="mt-1 text-xs">{request.institution}</p>
                </div>
                <div>
                  <p className="text-[9px] text-subtle">Field scope</p>
                  <p className="mt-1 text-xs">{request.fields.join(' · ')}</p>
                </div>
                <div>
                  <p className="text-[9px] text-subtle">Approvals</p>
                  <p className={cn('mt-1 text-xs', request.approvals >= 2 ? 'text-success' : 'text-warning')}>
                    {request.approvals}/2
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-subtle">Grant expiry</p>
                  <p className="mt-1 text-xs">{request.expires}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(request)
                    setRevealed(false)
                  }}
                  className="focus-ring grid size-9 place-items-center rounded-lg text-subtle hover:bg-background hover:text-foreground"
                  aria-label={'Review ' + request.id}
                >
                  <ArrowRight aria-hidden="true" className="size-4" />
                </button>
              </article>
            ))}
          </div>
        )}

        {tab === 'roles' && (
          <div role="tabpanel" className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">
                  <th className="px-7 py-4">Role</th>
                  <th className="px-5 py-4">Platform management</th>
                  <th className="px-5 py-4">Request disclosure</th>
                  <th className="px-5 py-4">Approve release</th>
                  <th className="px-7 py-4">View granted fields</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-b-0 text-xs">
                    <td className="px-7 py-5 font-medium">{item.label}</td>
                    <td className="px-5 py-5 text-muted">{item.id === 'platform-admin' ? 'Yes' : 'No'}</td>
                    <td className="px-5 py-5 text-muted">{item.canRequest ? 'Yes' : 'No'}</td>
                    <td className="px-5 py-5 text-muted">{item.canApprove ? 'Yes' : 'No'}</td>
                    <td className="px-7 py-5 text-muted">{item.canReveal ? 'Scoped grants only' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'access-log' && (
          <div role="tabpanel" className="divide-y divide-border">
            {accessLog.map((entry) => (
              <article key={entry.request + entry.time} className="grid gap-4 px-5 py-5 sm:px-7 lg:grid-cols-[1fr_130px_1.2fr_130px] lg:items-center">
                <div><p className="text-[9px] text-subtle">Actor</p><p className="mt-1 text-xs">{entry.actor}</p></div>
                <div><p className="text-[9px] text-subtle">Request</p><p className="mt-1 font-mono text-[10px]">{entry.request}</p></div>
                <div><p className="text-[9px] text-subtle">Action</p><p className="mt-1 text-xs">{entry.action}</p></div>
                <div><p className="text-[9px] text-subtle">Time</p><p className="mt-1 text-xs">{entry.time}</p></div>
              </article>
            ))}
            <div className="flex items-start gap-3 bg-background/35 px-5 py-5 text-[11px] leading-5 text-muted sm:px-7">
              <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              Local fixtures only. Production logs must be append-only, integrity-protected,
              and unavailable for administrator modification.
            </div>
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
            setRevealed(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaction decryption grant</DialogTitle>
            <DialogDescription>
              Every grant is limited to one transaction, one institution, approved fields,
              and a short validity window.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <>
              <dl className="divide-y divide-border rounded-2xl border border-border bg-background/50 px-4 text-xs">
                {[
                  ['Request', selected.id],
                  ['Transaction', selected.transaction],
                  ['Institution', selected.institution],
                  ['Authorized fields', selected.fields.join(', ')],
                  ['Threshold approvals', selected.approvals + '/2'],
                  ['Authorization', selected.authorization],
                  ['Expires', selected.expires],
                  ['Current role', activeRole.label],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-5 py-3">
                    <dt className="text-subtle">{label}</dt>
                    <dd className="text-right text-muted">{value}</dd>
                  </div>
                ))}
              </dl>

              {revealed ? (
                <div className="rounded-2xl border border-accent/25 bg-accent/[0.055] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-semibold">Authorized fixture fields</p>
                    <span className="rounded-md border border-warning/25 px-2 py-1 text-[8px] font-semibold uppercase tracking-wider text-warning">
                      Demo values
                    </span>
                  </div>
                  <dl className="mt-4 space-y-3 text-xs">
                    {selected.fields.map((field) => (
                      <div key={field} className="flex justify-between gap-4">
                        <dt className="text-subtle">{field}</dt>
                        <dd className="font-mono">
                          {field === 'Amount'
                            ? '125,000.00'
                            : field === 'Asset'
                              ? 'USDC'
                              : 'Example fixture value'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 text-[10px] leading-4 text-muted">
                    These values are static UI fixtures. No ciphertext or transaction data was decrypted.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl border border-border p-4 text-[11px] leading-5 text-muted">
                  <EyeOff aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-subtle" />
                  Confidential fields remain hidden until role, scope, approval threshold,
                  authorization reference, and expiry all pass server-side validation.
                </div>
              )}

              {role === 'platform-admin' && (
                <div className="rounded-2xl border border-danger/20 bg-danger/[0.05] p-4 text-[11px] leading-5 text-muted">
                  Platform administrators cannot request, approve, or view decrypted transaction fields.
                </div>
              )}

              {role === 'compliance' && (
                <Button variant="secondary" disabled={!activeRole.canRequest} className="w-full">
                  <FileKey2 aria-hidden="true" />
                  Request already staged · demo
                </Button>
              )}

              {role === 'custodian' && (
                <Button variant="secondary" disabled={!activeRole.canApprove} className="w-full">
                  <UserCheck aria-hidden="true" />
                  Approval recording requires backend
                </Button>
              )}

              {role === 'auditor' && (
                <Button
                  variant={canRevealSelected ? 'accent' : 'secondary'}
                  disabled={!canRevealSelected}
                  className="w-full"
                  onClick={() => setRevealed((current) => !current)}
                >
                  {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  {canRevealSelected
                    ? revealed
                      ? 'Hide authorized fixture fields'
                      : 'Preview authorized fixture fields'
                    : 'Waiting for 2/2 approvals'}
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { AdminPage }
