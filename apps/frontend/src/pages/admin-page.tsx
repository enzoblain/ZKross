import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  KeyRound,
  LockKeyhole,
  Radio,
  ShieldAlert,
} from 'lucide-react'
import { useState } from 'react'

import { Switch } from '../components/ui/switch'

const operations = [
  { id: 'MX-1048', route: 'Stellar → Ethereum', amount: '12,500 USDC', status: 'Attesting', age: '18s' },
  { id: 'MX-1047', route: 'Ethereum → Stellar', amount: '8,200 USDC', status: 'Finalized', age: '2m' },
  { id: 'MX-1046', route: 'Stellar → Ethereum', amount: '2,750 USDC', status: 'Finalized', age: '4m' },
]

function AdminPage() {
  const [deposits, setDeposits] = useState(true)
  const [settlements, setSettlements] = useState(true)
  const [relayer, setRelayer] = useState(true)

  return (
    <div className="page-enter">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            <span className="h-px w-6 bg-accent/60" />
            Operations
          </div>
          <h1 className="text-[2.4rem] font-medium leading-[1.04] tracking-[-0.055em] text-foreground sm:text-5xl">Admin control plane.</h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted sm:text-[15px]">A restrained operating surface for bridge health, queues and safeguards. Controls below affect this browser demo only.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border border-success/20 bg-success/[0.055] px-3 py-1.5 text-[10px] font-medium text-success sm:self-end">
          <span className="size-1.5 rounded-full bg-success" />
          Mock services nominal
        </div>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Relayer heartbeat', value: '1.2s', detail: 'Mock latency', icon: Radio, tone: 'text-success' },
          { label: 'Pending intents', value: '04', detail: 'Local fixtures', icon: Clock3, tone: 'text-accent' },
          { label: 'Alert policy', value: 'Clear', detail: 'No active incidents', icon: ShieldAlert, tone: 'text-success' },
        ].map((metric) => {
          const Icon = metric.icon
          return (
            <article key={metric.label} className="rounded-3xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <Icon aria-hidden="true" className={`size-4 ${metric.tone}`} />
                <span className="text-[9px] uppercase tracking-wider text-subtle">Sandbox</span>
              </div>
              <p className="mt-6 text-[11px] text-subtle">{metric.label}</p>
              <p className="mt-1 text-2xl font-medium tracking-[-0.04em] text-foreground">{metric.value}</p>
              <p className="mt-1.5 text-[11px] text-subtle">{metric.detail}</p>
            </article>
          )
        })}
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="overflow-hidden rounded-3xl border border-border bg-surface-raised" aria-labelledby="queue-title">
          <div className="flex items-center justify-between border-b border-border px-5 py-5 sm:px-6">
            <div>
              <h2 id="queue-title" className="text-sm font-semibold text-foreground">Operation queue</h2>
              <p className="mt-1 text-[11px] text-subtle">Illustrative relayer events</p>
            </div>
            <Activity aria-hidden="true" className="size-4 text-accent" />
          </div>

          <div className="divide-y divide-border">
            {operations.map((operation) => (
              <article key={operation.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[80px_1fr_130px_90px_45px] sm:items-center sm:px-6">
                <span className="font-mono text-[11px] text-subtle">{operation.id}</span>
                <div>
                  <p className="text-xs font-medium text-foreground">{operation.route}</p>
                  <p className="mt-1 text-[10px] text-subtle sm:hidden">{operation.amount}</p>
                </div>
                <span className="hidden font-mono text-[11px] text-muted sm:block">{operation.amount}</span>
                <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-medium ${operation.status === 'Finalized' ? 'border-success/20 bg-success/[0.05] text-success' : 'border-accent/25 bg-accent/[0.06] text-accent'}`}>
                  {operation.status === 'Finalized' ? <CheckCircle2 aria-hidden="true" className="size-3" /> : <span className="dot-pulse size-1.5 rounded-full bg-accent" />}
                  {operation.status}
                </span>
                <span className="font-mono text-[10px] text-subtle">{operation.age}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="safeguards-title">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl border border-border bg-background/50 text-accent">
              <LockKeyhole aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">Sandbox only</p>
              <h2 id="safeguards-title" className="mt-1 text-sm font-semibold text-foreground">Safeguards</h2>
            </div>
          </div>

          <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-background/30 px-4">
            {[
              { label: 'Accept mock deposits', value: deposits, setter: setDeposits },
              { label: 'Simulate settlements', value: settlements, setter: setSettlements },
              { label: 'Relayer heartbeat', value: relayer, setter: setRelayer },
            ].map((control) => (
              <div key={control.label} className="flex items-center justify-between gap-4 py-4">
                <span className="text-xs text-muted">{control.label}</span>
                <Switch checked={control.value} onCheckedChange={control.setter} aria-label={control.label} />
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-warning/20 bg-warning/[0.05] p-4 text-[11px] leading-5 text-muted">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            These switches modify presentation state only. They are not connected to contracts, relayers or infrastructure.
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-3xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="access-title">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-foreground text-background">
              <KeyRound aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h2 id="access-title" className="text-sm font-semibold text-foreground">Production access is not configured</h2>
              <p className="mt-1.5 max-w-xl text-xs leading-5 text-muted">Role-based authentication, hardware-backed signing and an immutable action log are required before admin operations can be enabled.</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[10px] font-medium text-subtle">Read-only prototype</span>
        </div>
      </section>
    </div>
  )
}

export { AdminPage }
