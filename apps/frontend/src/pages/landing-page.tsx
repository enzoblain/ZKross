import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Fingerprint,
  KeyRound,
  Landmark,
  LockKeyhole,
  MoveRight,
  ScanLine,
  WalletMinimal,
} from 'lucide-react'

import type { PageId } from '../App'
import { Spotlight } from '../components/aceternity/spotlight'
import { BrandMark } from '../components/brand-mark'
import { NetworkLogo } from '../components/network-logo'
import { Button } from '../components/ui/button'

type LandingPageProps = {
  onNavigate: (page: PageId) => void
}

const steps = [
  {
    number: '01',
    label: 'Authorize',
    title: 'Connect the wallet that sends.',
    description: 'Only the source-chain wallet is required. The destination stays an address.',
    icon: WalletMinimal,
  },
  {
    number: '02',
    label: 'Route',
    title: 'Compose the transfer.',
    description: 'Choose direction, USDC amount, recipient, and the available privacy policy.',
    icon: MoveRight,
  },
  {
    number: '03',
    label: 'Settle',
    title: 'Verify before release.',
    description: 'The target flow verifies proof conditions before the destination reserve releases funds.',
    icon: BadgeCheck,
  },
]

const useCases = [
  {
    icon: Landmark,
    eyebrow: 'Treasury',
    title: 'Institutional settlement',
    description:
      'Route working capital between ecosystems while keeping disclosure bound to an explicit review mandate.',
  },
  {
    icon: ScanLine,
    eyebrow: 'Tokenized assets',
    title: 'Real-world asset movement',
    description:
      'Keep sensitive investor and asset context within a controlled workflow instead of a public operations screen.',
  },
  {
    icon: BriefcaseBusiness,
    eyebrow: 'Operations',
    title: 'Cross-border business payments',
    description:
      'Separate payment execution from the commercial context while retaining a path for authorized oversight.',
  },
]

const principles = [
  {
    icon: Fingerprint,
    index: 'P-01',
    title: 'Selective confidentiality',
    description: 'Sensitive fields are intended to stay outside unapproved views.',
  },
  {
    icon: LockKeyhole,
    index: 'P-02',
    title: 'Proof before release',
    description: 'Conditions can be verified without revealing their complete private inputs.',
  },
  {
    icon: KeyRound,
    index: 'P-03',
    title: 'Scoped oversight',
    description: 'A grant names who may inspect which fields, for which case, and until when.',
  },
]

function BridgeVisual() {
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[540px]"
      role="img"
      aria-label="Ethereum and Stellar connected through the planned Zkross privacy layer"
    >
      <div className="absolute inset-[8%] rounded-full border border-border" />
      <div className="absolute inset-[20%] rounded-full border border-border/70" />
      <div className="absolute inset-1/2 h-px -translate-x-1/2 bg-border" />
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 540 540" fill="none">
        <path d="M102 270C160 162 380 162 438 270" stroke="var(--border-strong)" />
        <path
          className="trace-line"
          d="M102 270C160 162 380 162 438 270"
          stroke="var(--accent)"
          strokeDasharray="5 11"
          strokeLinecap="round"
        />
        <path d="M102 270C160 378 380 378 438 270" stroke="var(--border)" />
      </svg>

      <div className="absolute left-[7%] top-1/2 -translate-y-1/2 text-center">
        <div className="hairline-card grid size-20 place-items-center rounded-[24px] border border-border bg-surface sm:size-24">
          <NetworkLogo network="ethereum" className="size-10 sm:size-12" />
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">Ethereum</p>
      </div>

      <div className="absolute right-[7%] top-1/2 -translate-y-1/2 text-center">
        <div className="hairline-card grid size-20 place-items-center rounded-[24px] border border-border bg-surface sm:size-24">
          <NetworkLogo network="stellar" className="size-10 sm:size-12" />
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">Stellar</p>
      </div>

      <div className="absolute left-1/2 top-1/2 grid size-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-accent/30 bg-background shadow-[0_0_70px_rgba(196,181,253,0.11)] sm:size-36">
        <div className="grid size-16 place-items-center rounded-2xl bg-accent text-[#0c0d11] sm:size-20">
          <LockKeyhole aria-hidden="true" className="size-6 sm:size-7" />
        </div>
        <span className="absolute -bottom-8 min-w-max text-[9px] font-medium uppercase tracking-[0.18em] text-accent">
          Privacy layer · planned
        </span>
      </div>
    </div>
  )
}

function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="page-enter overflow-hidden">
      <section className="relative px-4 pb-24 pt-20 sm:px-6 sm:pb-32 sm:pt-28">
        <Spotlight className="-right-24 -top-28" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-16 lg:grid-cols-[1.03fr_0.97fr]">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-warning/25 bg-warning/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-warning">
              <span className="size-1.5 rounded-full bg-warning" />
              Testnet prototype · no asset movement
            </div>
            <h1 className="text-balance max-w-3xl text-[3.2rem] font-medium leading-[0.98] tracking-[-0.065em] text-foreground sm:text-6xl lg:text-[4.6rem]">
              Privacy across chains. Trust without compromise.
            </h1>
            <p className="mt-7 max-w-2xl text-balance text-base leading-7 text-muted sm:text-lg">
              A focused settlement interface for moving USDC between Ethereum and Stellar,
              designed around verifiable conditions and controlled disclosure.
            </p>
            <p className="mt-3 max-w-xl text-xs leading-5 text-subtle">
              Product prototype. Signing, settlement, proofs, and disclosure controls are not connected.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button variant="accent" size="lg" onClick={() => onNavigate('bridge')}>
                Launch app
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Explore the flow
              </Button>
            </div>
          </div>
          <BridgeVisual />
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-y border-border bg-surface/45 px-4 py-24 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Transfer anatomy</p>
              <h2 className="mt-4 text-balance text-3xl font-medium tracking-[-0.045em] sm:text-5xl">Three decisions. One clear route.</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted lg:justify-self-end">
              Zkross keeps the transaction flow legible: authorize the sender, define the route,
              then verify the settlement conditions.
            </p>
          </div>

          <ol className="relative mt-16 grid gap-10 sm:grid-cols-3 sm:gap-0">
            <span aria-hidden="true" className="absolute left-[16.6%] right-[16.6%] top-6 hidden h-px bg-border sm:block" />
            {steps.map((step, index) => {
              const Icon = step.icon
              return (
                <li key={step.number} className="relative sm:px-7 first:sm:pl-0 last:sm:pr-0">
                  <div className="flex items-center gap-4 sm:block">
                    <span className="relative z-10 grid size-12 shrink-0 place-items-center rounded-full border border-border-strong bg-background text-accent sm:mx-auto">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <div className="sm:mt-8 sm:text-center">
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-subtle">{step.number} · {step.label}</p>
                      <h3 className="mt-2 text-base font-semibold tracking-[-0.025em]">{step.title}</h3>
                      <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-muted">{step.description}</p>
                    </div>
                  </div>
                  {index < steps.length - 1 && <span aria-hidden="true" className="ml-6 mt-5 block h-6 w-px bg-border sm:hidden" />}
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      <section id="use-cases" className="scroll-mt-24 px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto grid max-w-[1180px] gap-16 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="max-w-md lg:sticky lg:top-28 lg:self-start">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Where it fits</p>
            <h2 className="mt-4 text-balance text-3xl font-medium tracking-[-0.045em] sm:text-5xl">Built for capital that needs context.</h2>
            <p className="mt-5 text-sm leading-6 text-muted sm:text-base">
              The product separates public settlement rails from the sensitive business information
              that gives a transaction meaning.
            </p>
          </div>

          <div className="border-t border-border">
            {useCases.map((useCase, index) => {
              const Icon = useCase.icon
              return (
                <article key={useCase.eyebrow} className="group grid gap-5 border-b border-border py-9 sm:grid-cols-[72px_1fr_auto] sm:items-start sm:py-11">
                  <span className="font-mono text-[10px] text-subtle">0{index + 1}</span>
                  <div>
                    <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">
                      <Icon aria-hidden="true" className="size-3.5 text-accent" />
                      {useCase.eyebrow}
                    </p>
                    <h3 className="mt-3 text-xl font-semibold tracking-[-0.035em] sm:text-2xl">{useCase.title}</h3>
                    <p className="mt-4 max-w-xl text-sm leading-6 text-muted">{useCase.description}</p>
                  </div>
                  <ArrowRight aria-hidden="true" className="hidden size-4 text-subtle transition-transform group-hover:translate-x-1 sm:mt-1 sm:block" />
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="security" className="scroll-mt-24 border-y border-border bg-surface/45 px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Protocol principles</p>
            <h2 className="mt-4 text-balance text-3xl font-medium tracking-[-0.045em] sm:text-5xl">Confidential where required. Accountable where authorized.</h2>
          </div>

          <div className="mt-14 grid border-y border-border sm:grid-cols-3">
            {principles.map((principle, index) => {
              const Icon = principle.icon
              return (
                <article
                  key={principle.title}
                  className={`py-8 sm:px-8 sm:py-10 ${index > 0 ? 'border-t border-border sm:border-l sm:border-t-0' : ''} ${index === 0 ? 'sm:pl-0' : ''} ${index === principles.length - 1 ? 'sm:pr-0' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <Icon aria-hidden="true" className="size-5 text-accent" />
                    <span className="font-mono text-[9px] text-subtle">{principle.index}</span>
                  </div>
                  <h3 className="mt-9 text-base font-semibold tracking-[-0.02em]">{principle.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">{principle.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-24 sm:px-6 sm:py-28">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-8 border-y border-border py-10 sm:flex-row sm:items-center sm:justify-between sm:py-12">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Interactive prototype</p>
            <h2 className="mt-4 text-3xl font-medium tracking-[-0.045em]">See the route before it becomes a transaction.</h2>
          </div>
          <Button variant="accent" size="lg" onClick={() => onNavigate('bridge')}>
            Open Bridge
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-border px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-[1180px]">
          <BrandMark className="text-4xl sm:text-5xl" />
        </div>
      </footer>
    </div>
  )
}

export { LandingPage }
