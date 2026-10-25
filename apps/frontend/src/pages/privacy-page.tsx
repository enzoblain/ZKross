import {
  ArrowRight,
  Braces,
  CircleDashed,
  Eye,
  EyeOff,
  FileKey2,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  Network,
  ShieldCheck,
  TimerReset,
} from 'lucide-react'

import { NetworkMark, NetworkRouteMark } from '../components/network-logo'

const protocolSteps = [
  {
    index: '01',
    visibility: 'Public on Ethereum',
    title: 'Deposit into the source pool',
    description: 'The sender address, USDC amount, pool, and time remain visible on-chain.',
    icon: Eye,
    tone: 'public',
  },
  {
    index: '02',
    visibility: 'Private user secret',
    title: 'Create a note commitment',
    description: 'A Poseidon2 commitment represents the note without publishing its secret contents.',
    icon: Fingerprint,
    tone: 'private',
  },
  {
    index: '03',
    visibility: 'Verified, not disclosed',
    title: 'Prove note ownership',
    description: 'Circom circuits produce Groth16 proofs that a note is valid and unspent without exposing it.',
    icon: FileKey2,
    tone: 'private',
  },
  {
    index: '04',
    visibility: 'Public on Stellar',
    title: 'Claim privately, withdraw publicly',
    description: 'The claim creates a private destination note. Its later withdrawal address, amount, pool, and time are public.',
    icon: Eye,
    tone: 'public',
  },
] as const

const protectedItems = [
  'Private note amounts, owners, blindings, and spending keys inside each pool.',
  'The direct public link from one bridge message to its destination claim nullifier.',
  'The destination note public key and claim secret contained in the bridge message.',
  'The cross-chain path from public deposit to public withdrawal, except for the Global View Key holder.',
]

const publicItems = [
  'USDC deposits and sender addresses on the source chain.',
  'USDC withdrawals and recipient addresses on the destination chain.',
  'Pool balances, commitments, nullifiers, posted roots, timestamps, and contract events.',
  'Patterns an observer may infer from matching amounts or timing.',
]

const laterLayers = [
  ['Larger anonymity sets', 'Many users sharing the same commitment set.'],
  ['Delayed or grouped exits', 'Withdrawals submitted outside a one-to-one timing window.'],
  ['Standard amounts and batches', 'Less distinctive value patterns across transfers.'],
  ['Temporary destinations', 'Fresh recipient addresses for individual payouts.'],
  ['Fee-paying relayers', 'A relayer submits the payout instead of the recipient.'],
  ['Encrypted note delivery', 'Recover notes from chain events without keeping secrets only in one browser.'],
]

function PrivacyPage() {
  return (
    <div className="page-enter">
      <div className="grid gap-10 lg:grid-cols-[1fr_0.75fr] lg:items-end">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            <NetworkRouteMark />
            Privacy model
          </p>
          <h1 className="mt-5 text-balance text-4xl font-medium tracking-[-0.055em] sm:text-6xl">
            Public actions.<br />Private connection.
          </h1>
          <p className="mt-6 max-w-2xl text-sm leading-6 text-muted sm:text-base sm:leading-7">
            Zkross protects the link between public on-chain actions and encrypts note data for
            traceable administrative review. Pool deposits and withdrawals remain public.
          </p>
        </div>

        <div className="border-l border-accent/35 pl-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">MVP boundary</p>
          <p className="mt-3 text-sm leading-6 text-muted">
            A zero-knowledge proof can hide the note used for authorization. It cannot erase
            data already published by Ethereum or Stellar.
          </p>
        </div>
      </div>

      <section className="mt-14 overflow-hidden border-y border-border" aria-labelledby="privacy-flow-title">
        <div className="flex flex-col justify-between gap-4 border-b border-border py-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Transfer anatomy</p>
            <h2 id="privacy-flow-title" className="mt-2 text-xl font-semibold tracking-[-0.03em]">What the protocol changes — and what it does not</h2>
          </div>
          <span className="w-fit rounded-full border border-warning/25 bg-warning/[0.055] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-warning">
            Circuits active · Sepolia deployment pending
          </span>
        </div>

        <ol className="grid lg:grid-cols-4">
          {protocolSteps.map((step, index) => {
            const Icon = step.icon
            const isPrivate = step.tone === 'private'
            return (
              <li
                key={step.index}
                className={`relative py-8 lg:px-6 ${index > 0 ? 'border-t border-border lg:border-l lg:border-t-0' : ''} ${index === 0 ? 'lg:pl-0' : ''} ${index === protocolSteps.length - 1 ? 'lg:pr-0' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`grid size-10 place-items-center rounded-full border ${isPrivate ? 'border-accent/35 bg-accent/[0.08] text-accent' : 'border-border bg-surface text-muted'}`}>
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="font-mono text-[9px] text-subtle">{step.index}</span>
                </div>
                <p className={`mt-7 text-[9px] font-semibold uppercase tracking-[0.13em] ${isPrivate ? 'text-accent' : 'text-subtle'}`}>
                  {step.visibility}
                </p>
                <h3 className="mt-2 text-sm font-semibold tracking-[-0.02em]">{step.title}</h3>
                <p className="mt-3 text-xs leading-5 text-muted">{step.description}</p>
                {index < protocolSteps.length - 1 && (
                  <ArrowRight aria-hidden="true" className="absolute -right-2.5 top-11 z-10 hidden size-5 rounded-full bg-background p-1 text-subtle lg:block" />
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <section aria-labelledby="public-title">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl border border-border bg-surface text-muted">
              <Eye aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-subtle">Visible by design</p>
              <h2 id="public-title" className="mt-1 text-lg font-semibold">The public settlement layer</h2>
            </div>
          </div>
          <ul className="mt-7 divide-y divide-border border-y border-border">
            {publicItems.map((item) => (
              <li key={item} className="flex gap-3 py-4 text-xs leading-5 text-muted">
                <Eye aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-subtle" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="protected-title">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl border border-accent/30 bg-accent/[0.08] text-accent">
              <EyeOff aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-accent">Protected by the implemented circuits</p>
              <h2 id="protected-title" className="mt-1 text-lg font-semibold">The confidential relationship layer</h2>
            </div>
          </div>
          <ul className="mt-7 divide-y divide-border border-y border-border">
            {protectedItems.map((item) => (
              <li key={item} className="flex gap-3 py-4 text-xs leading-5 text-muted">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-accent" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-16 rounded-[2rem] border border-border bg-surface" aria-labelledby="building-blocks-title">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[0.72fr_1.28fr] lg:p-10">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Testnet building blocks</p>
            <h2 id="building-blocks-title" className="mt-3 text-2xl font-medium tracking-[-0.04em]">What the protocol verifies now.</h2>
            <p className="mt-4 text-xs leading-5 text-muted">
              The circuits and verifiers are implemented for testnet. They remain unaudited and are not approved for mainnet funds.
            </p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {[
              [Fingerprint, 'Poseidon2 commitment', 'Binds the note fields without publishing their secret values.'],
              [FileKey2, 'Circom + Groth16 proof', 'Shows that the claimant owns a valid note under the SPP-derived circuit rules.'],
              [Braces, 'Nullifier', 'Marks a note as spent without revealing the note itself.'],
              [KeyRound, 'Traceable Global View Key', 'Encrypts every note to one configured administrator key so the admin can reconstruct flows.'],
            ].map(([Icon, title, description]) => {
              const ItemIcon = Icon as typeof Fingerprint
              return (
                <article key={title as string} className="bg-background/65 p-5">
                  <ItemIcon aria-hidden="true" className="size-4 text-accent" />
                  <h3 className="mt-5 text-xs font-semibold">{title as string}</h3>
                  <p className="mt-2 text-[11px] leading-5 text-muted">{description as string}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-[2rem] border border-border bg-background/30" aria-labelledby="later-title">
        <div className="grid lg:grid-cols-[0.38fr_0.62fr]">
          <div className="border-b border-border p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <span className="grid size-11 place-items-center rounded-2xl border border-border bg-surface text-subtle">
              <TimerReset aria-hidden="true" className="size-4" />
            </span>
            <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Later hardening</p>
            <h2 id="later-title" className="mt-3 text-xl font-semibold tracking-[-0.03em]">Stronger anonymity needs more than a circuit.</h2>
            <p className="mt-4 text-xs leading-5 text-muted">
              These techniques reduce timing, amount, and address correlation. They are deliberately outside the current MVP.
            </p>
          </div>
          <div className="divide-y divide-border">
            {laterLayers.map(([title, description], index) => (
              <div key={title} className="grid gap-2 px-6 py-4 sm:grid-cols-[26px_170px_1fr] sm:items-center sm:px-8">
                <span className="font-mono text-[9px] text-subtle">{String(index + 1).padStart(2, '0')}</span>
                <p className="text-xs font-medium">{title}</p>
                <p className="text-[11px] leading-5 text-muted">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-warning/20 bg-warning/[0.045] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="text-xs font-semibold">Testnet privacy, with explicit limits.</p>
            <p className="mt-1 text-[11px] leading-5 text-muted">Browser proof generation and on-chain verification are wired. A complete transfer still awaits the Sepolia pool deployment; the protocol is unaudited.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-subtle">
          <Network aria-hidden="true" className="size-3.5" />
          <NetworkMark network="ethereum" className="size-6" />
          <ArrowRight aria-hidden="true" className="size-3" />
          <NetworkMark network="stellar" className="size-6" />
          <CircleDashed aria-hidden="true" className="ml-1 size-3.5 text-warning" />
        </div>
      </div>
    </div>
  )
}

export { PrivacyPage }
