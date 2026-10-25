import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Eye,
  EyeOff,
  FileKey2,
  KeyRound,
  LockKeyhole,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import { NetworkRouteMark } from '../components/network-logo'

const roles = [
  {
    icon: UserRound,
    label: 'Bridge user',
    access: 'Own wallet + local notes',
    can: ['Derive their note key from a wallet signature', 'Create proofs for notes they own', 'Export their local note backup'],
    cannot: 'Cannot decrypt another user’s notes or the global transaction graph.',
  },
  {
    icon: KeyRound,
    label: 'Pool administrator',
    access: 'Single Global View Key',
    can: ['Decrypt every input and output note', 'Link bridge-out secrets to destination claims', 'Export a complete trace for authorized review'],
    cannot: 'The private Global View Key must never be embedded in this frontend.',
  },
  {
    icon: RadioTower,
    label: 'Root poster + attester',
    access: 'Operational testnet authority',
    can: ['Post outbox roots between chains', 'Check whether a claim occurred', 'Sign finalize or refund attestations after deadlines'],
    cannot: 'Cannot alter a valid proof or spend a user note; it can still delay availability.',
  },
  {
    icon: ClipboardList,
    label: 'Auditor or regulator',
    access: 'Admin or user export',
    can: ['Review decrypted records supplied under an external mandate', 'Compare the trace with public explorer activity', 'Retain evidence in its own controlled system'],
    cannot: 'Has no native on-chain role, threshold vote, or automatic decryption right in the current contracts.',
  },
]

const flow = [
  ['01', 'Contracts enforce encryption', 'Every relevant proof uses the pool’s configured Global View Key public key.'],
  ['02', 'Ciphertexts stay public', 'Observers see commitments, nullifiers, roots, and encrypted note data—not plaintext note ownership.'],
  ['03', 'Admin decrypts off-app', 'The Global View Key holder uses the separate SPP audit/admin tooling in a controlled environment.'],
  ['04', 'Bridge legs are linked', 'The admin decrypts the claim secret, derives the claim nullifier, and finds the matching destination claim.'],
  ['05', 'Evidence is exported', 'An auditor receives the minimum required report through an external legal and access-control process.'],
]

const publicView = [
  'Pool deposits and withdrawals, with public wallet addresses and amounts',
  'Commitments, nullifiers, outbox roots, deadlines, and transaction timestamps',
  'The wallet paying claim and withdrawal fees until the relayer is used',
]

const adminView = [
  'Note public key, amount, blinding, and audit salt for encrypted notes',
  'Bridge amount, recipient note key, claim secret, and source-to-destination continuity',
  'Spent and newly created notes in traceable mode, allowing a complete funds path',
]

function CompliancePage() {
  return (
    <div className="page-enter">
      <div className="grid gap-10 lg:grid-cols-[1fr_0.72fr] lg:items-end">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent"><NetworkRouteMark />Global View Key</p>
          <h1 className="mt-5 text-balance text-4xl font-medium tracking-[-0.055em] sm:text-6xl">Private to the public. Traceable by one authority.</h1>
          <p className="mt-6 max-w-2xl text-sm leading-6 text-muted sm:text-base sm:leading-7">Zkross uses SPP’s traceable Global View Key model. Zero-knowledge proofs hide notes from public observers while enforcing encryption to one configured administrator key.</p>
        </div>
        <div className="border-l border-warning/35 pl-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warning">Current trust model</p>
          <p className="mt-3 text-sm leading-6 text-muted">There is no threshold key, on-chain role approval, or field-scoped decryption in the MVP. The administrator key can decrypt every note.</p>
        </div>
      </div>

      <div className="mt-10 flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.045] p-4 text-[11px] leading-5 text-muted">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <p><strong className="text-foreground">This page never decrypts transaction data.</strong> No Global View Key private material is loaded into the Zkross frontend. Administrative decryption belongs in a separate, access-controlled audit environment.</p>
      </div>

      <section className="mt-12 overflow-hidden border-y border-border" aria-labelledby="visibility-title">
        <div className="grid lg:grid-cols-[0.38fr_0.62fr]">
          <div className="border-b border-border py-7 lg:border-b-0 lg:border-r lg:pr-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Visibility boundary</p>
            <h2 id="visibility-title" className="mt-3 text-2xl font-medium tracking-[-0.04em]">Same transactions. Two views.</h2>
            <p className="mt-4 text-xs leading-5 text-muted">The Global View Key does not make public events disappear. It adds a private, traceable view for the configured authority.</p>
          </div>
          <div className="grid sm:grid-cols-2">
            <article className="border-b border-border py-7 sm:border-b-0 sm:border-r sm:px-8">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl border border-border bg-surface text-muted"><EyeOff aria-hidden="true" className="size-4" /></span><div><p className="text-[9px] uppercase tracking-[0.14em] text-subtle">Outside observer</p><h3 className="mt-1 text-sm font-semibold">Public chain data</h3></div></div>
              <ul className="mt-6 space-y-3">{publicView.map((item) => <li key={item} className="flex gap-2.5 text-[11px] leading-5 text-muted"><EyeOff aria-hidden="true" className="mt-1 size-3 shrink-0 text-subtle" />{item}</li>)}</ul>
            </article>
            <article className="py-7 sm:pl-8">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl border border-accent/30 bg-accent/[0.08] text-accent"><Eye aria-hidden="true" className="size-4" /></span><div><p className="text-[9px] uppercase tracking-[0.14em] text-accent">GVK administrator</p><h3 className="mt-1 text-sm font-semibold">Decrypted note graph</h3></div></div>
              <ul className="mt-6 space-y-3">{adminView.map((item) => <li key={item} className="flex gap-2.5 text-[11px] leading-5 text-muted"><CheckCircle2 aria-hidden="true" className="mt-1 size-3 shrink-0 text-accent" />{item}</li>)}</ul>
            </article>
          </div>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="roles-title">
        <div className="max-w-2xl"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Real MVP roles</p><h2 id="roles-title" className="mt-3 text-3xl font-medium tracking-[-0.045em]">Who can do what.</h2><p className="mt-4 text-sm leading-6 text-muted">These are protocol capabilities—not job titles invented by the interface.</p></div>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {roles.map((role) => {
            const Icon = role.icon
            return (
              <article key={role.label} className="rounded-3xl border border-border bg-surface p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-2xl bg-accent/10 text-accent"><Icon aria-hidden="true" className="size-4" /></span><span className="rounded-full border border-border px-2.5 py-1 text-[9px] text-subtle">{role.access}</span></div>
                <h3 className="mt-6 text-base font-semibold">{role.label}</h3>
                <ul className="mt-4 space-y-2">{role.can.map((item) => <li key={item} className="flex gap-2 text-[11px] leading-5 text-muted"><CheckCircle2 aria-hidden="true" className="mt-1 size-3 shrink-0 text-success" />{item}</li>)}</ul>
                <p className="mt-5 border-t border-border pt-4 text-[10px] leading-4 text-subtle"><span className="font-medium text-foreground">Boundary:</span> {role.cannot}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="mt-14 rounded-[2rem] border border-border bg-surface p-6 sm:p-8 lg:p-10" aria-labelledby="audit-flow-title">
        <div className="grid gap-10 lg:grid-cols-[0.37fr_0.63fr]">
          <div>
            <span className="grid size-11 place-items-center rounded-2xl border border-accent/30 bg-accent/[0.08] text-accent"><FileKey2 aria-hidden="true" className="size-4" /></span>
            <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Decryption path</p>
            <h2 id="audit-flow-title" className="mt-3 text-2xl font-medium tracking-[-0.04em]">From ciphertext to review evidence.</h2>
          </div>
          <ol className="divide-y divide-border border-y border-border">
            {flow.map(([number, title, description]) => <li key={number} className="grid gap-2 py-4 sm:grid-cols-[42px_170px_1fr] sm:items-start"><span className="font-mono text-[9px] text-subtle">{number}</span><p className="text-xs font-medium">{title}</p><p className="text-[11px] leading-5 text-muted">{description}</p></li>)}
          </ol>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.72fr]">
        <div className="rounded-3xl border border-border bg-background/35 p-6">
          <div className="flex items-start gap-3"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" /><div><h2 className="text-sm font-semibold">What is not implemented</h2><p className="mt-2 text-[11px] leading-5 text-muted">ASP allowlists or blocklists, threshold custody, institutional authentication, mandate validation, scoped field grants, and an immutable access log are outside the current MVP. The pools run an open policy.</p></div></div>
        </div>
        <a href="https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/docs/src/global_view_key.md" target="_blank" rel="noreferrer" className="focus-ring group flex items-center justify-between gap-5 rounded-3xl border border-accent/25 bg-accent/[0.055] p-6">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">SPP reference</p><p className="mt-2 text-sm font-semibold">Read the Global View Key design</p><p className="mt-2 text-[10px] leading-4 text-muted">The separate SPP admin tooling is the base for future Zkross audit operations.</p></div><ExternalLink aria-hidden="true" className="size-4 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
        </a>
      </section>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-background/35 p-4 text-[11px] leading-5 text-muted"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" /><p>Cryptographic traceability provides evidence; it does not identify a legal person by itself or make a transfer compliant with a jurisdiction. Identity mapping, authorization, retention, and due process remain external responsibilities.</p><ArrowRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-subtle" /></div>
    </div>
  )
}

export { CompliancePage }
