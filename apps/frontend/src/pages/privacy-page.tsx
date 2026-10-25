import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Eye,
  FileCheck2,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react'

const stages = [
  {
    icon: Fingerprint,
    label: 'Commit',
    description: 'Create a transfer commitment locally.',
  },
  {
    icon: LockKeyhole,
    label: 'Prove',
    description: 'Generate a circuit proof when the prover is integrated.',
  },
  {
    icon: FileCheck2,
    label: 'Verify',
    description: 'Verify constraints before destination release.',
  },
]

function PrivacyPage() {
  return (
    <div className="page-enter">
      <div className="max-w-3xl">
        <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          <span className="h-px w-6 bg-accent/60" />
          Privacy
        </div>
        <h1 className="text-[2.4rem] font-medium leading-[1.04] tracking-[-0.055em] text-foreground sm:text-5xl">
          Precise claims.<br />
          Verifiable boundaries.
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-muted sm:text-[15px]">
          Zkross is being designed around explicit circuit guarantees. Until those circuits
          are integrated and audited, privacy interactions remain labeled previews.
        </p>
      </div>

      <section className="mt-10 overflow-hidden rounded-3xl border border-border bg-surface-raised" aria-labelledby="privacy-model-title">
        <div className="border-b border-border px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">Proposed model</p>
              <h2 id="privacy-model-title" className="mt-2 text-lg font-semibold tracking-[-0.025em] text-foreground">Commit → prove → verify</h2>
            </div>
            <span className="self-start rounded-full border border-warning/25 bg-warning/[0.06] px-3 py-1.5 text-[10px] font-medium text-warning">
              Architecture preview
            </span>
          </div>
        </div>

        <div className="grid sm:grid-cols-3">
          {stages.map((stage, index) => {
            const Icon = stage.icon
            return (
              <article key={stage.label} className="relative border-b border-border p-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-2xl border border-border bg-background/55 text-accent">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="font-mono text-[10px] text-subtle">0{index + 1}</span>
                </div>
                <h3 className="mt-7 text-sm font-semibold text-foreground">{stage.label}</h3>
                <p className="mt-2 text-xs leading-5 text-subtle">{stage.description}</p>
              </article>
            )
          })}
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="disclosure-title">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-foreground text-background">
              <Eye aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">Current disclosure</p>
              <h2 id="disclosure-title" className="mt-1 text-sm font-semibold text-foreground">What the demo actually does</h2>
            </div>
          </div>

          <ul className="mt-6 space-y-4">
            {[
              'Keeps draft inputs inside the browser session.',
              'Calculates illustrative fees with a local adapter.',
              'Simulates bridge progress without network calls.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-xs leading-5 text-muted">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                {item}
              </li>
            ))}
          </ul>

          <div className="my-6 h-px bg-border" />

          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">Not implemented</p>
          <ul className="mt-4 space-y-4">
            {[
              'Zero-knowledge proof generation or verification.',
              'On-chain confidentiality or metadata protection.',
              'Audited privacy guarantees of any kind.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-xs leading-5 text-muted">
                <CircleDashed aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="readiness-title">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">Readiness ledger</p>
              <h2 id="readiness-title" className="mt-2 text-sm font-semibold text-foreground">Privacy integration gates</h2>
            </div>
            <ShieldCheck aria-hidden="true" className="size-5 text-accent" />
          </div>

          <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-background/30">
            {[
              { item: 'Threat model documented', owner: 'Protocol', status: 'In review' },
              { item: 'Circuit constraints finalized', owner: 'Circuits', status: 'Pending' },
              { item: 'Browser prover connected', owner: 'Frontend', status: 'Pending' },
              { item: 'Independent circuit audit', owner: 'Security', status: 'Required' },
            ].map((row) => (
              <div key={row.item} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_90px_80px] sm:items-center">
                <span className="text-xs font-medium text-foreground">{row.item}</span>
                <span className="text-[11px] text-subtle">{row.owner}</span>
                <span className="justify-self-start rounded-full border border-border px-2 py-1 text-[9px] font-medium text-muted sm:justify-self-end">
                  {row.status}
                </span>
              </div>
            ))}
          </div>

          <button type="button" className="focus-ring mt-5 flex items-center gap-2 rounded-lg text-xs font-medium text-accent hover:text-accent-strong">
            Read the architecture notes
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </button>
        </section>
      </div>

      <div className="mt-5 rounded-3xl border border-accent/20 bg-accent/[0.04] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-medium text-foreground">Privacy copy follows implementation state.</p>
              <p className="mt-1 text-xs leading-5 text-muted">Production claims must be tied to audited circuit behavior, not product intent.</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-accent/20 px-3 py-1.5 text-[10px] font-medium text-accent">Policy enforced in UI</span>
        </div>
      </div>
    </div>
  )
}

export { PrivacyPage }
