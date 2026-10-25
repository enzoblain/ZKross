import {
  ArrowRight,
  CheckCircle2,
  Eye,
  FileCheck2,
  Landmark,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  WalletCards,
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
    title: 'Connect',
    description: 'Connect the source-chain wallet for the selected route.',
    icon: WalletCards,
  },
  {
    number: '02',
    title: 'Transfer',
    description: 'Initiate a cross-chain transfer through the Zkross privacy workflow.',
    icon: ArrowRight,
  },
  {
    number: '03',
    title: 'Verify',
    description: 'Verify the cryptographic proof and track the transaction.',
    icon: FileCheck2,
  },
]

const useCases = [
  {
    icon: Landmark,
    eyebrow: 'Institutional transfers',
    title: 'Move capital without exposing your strategy.',
    description:
      'Zkross aims to support confidential cross-chain settlement while preserving controlled access for authorized auditors and regulators.',
  },
  {
    icon: Layers3,
    eyebrow: 'Tokenized real-world assets',
    title: 'Private transfers for real-world finance.',
    description:
      'A workflow designed for sensitive asset and investor information, with verifiable compliance requirements and controlled disclosure.',
  },
  {
    icon: LockKeyhole,
    eyebrow: 'Business payments',
    title: 'Keep commercial relationships discreet.',
    description:
      'Reduce unnecessary exposure of payment patterns and counterparties while maintaining appropriate institutional oversight.',
  },
]

const principles = [
  {
    icon: LockKeyhole,
    title: 'Confidentiality',
    description:
      'The intended protocol protects sensitive details from observers who are not authorized to see them.',
  },
  {
    icon: ShieldCheck,
    title: 'Zero-knowledge verification',
    description:
      'Proofs can establish that conditions are satisfied without revealing the underlying private information.',
  },
  {
    icon: Eye,
    title: 'Authorized oversight',
    description:
      'Controlled disclosure is designed to reveal only approved information, subject to verified permissions.',
  },
]

function BridgeVisual() {
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[540px]"
      role="img"
      aria-label="Abstract diagram of Ethereum and Stellar connected through a privacy layer"
    >
      <div className="absolute inset-[8%] rounded-full border border-border" />
      <div className="absolute inset-[20%] rounded-full border border-border/70" />
      <div className="absolute inset-1/2 h-px -translate-x-1/2 bg-border" />
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 540 540"
        fill="none"
      >
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

      <div className="absolute left-[9%] top-1/2 -translate-y-1/2">
        <div className="hairline-card grid size-20 place-items-center rounded-[24px] border border-border bg-surface text-2xl font-semibold sm:size-24">
          <NetworkLogo network="ethereum" className="size-10 text-accent sm:size-12" />
        </div>
        <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">
          Ethereum
        </p>
      </div>

      <div className="absolute right-[9%] top-1/2 -translate-y-1/2">
        <div className="hairline-card grid size-20 place-items-center rounded-[24px] border border-border bg-surface text-2xl font-semibold sm:size-24">
          <NetworkLogo network="stellar" className="size-10 sm:size-12" />
        </div>
        <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">
          Stellar
        </p>
      </div>

      <div className="absolute left-1/2 top-1/2 grid size-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-accent/35 bg-background shadow-[0_0_70px_rgba(115,87,255,0.18)] sm:size-36">
        <div className="grid size-16 place-items-center rounded-2xl bg-accent text-white sm:size-20">
          <LockKeyhole aria-hidden="true" className="size-6 sm:size-7" />
        </div>
        <span className="absolute -bottom-8 min-w-max text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
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
              Confidential cross-chain transfers between Ethereum and Stellar, powered by
              zero-knowledge technology and designed for verifiable compliance.
            </p>
            <p className="mt-3 max-w-xl text-xs leading-5 text-subtle">
              This is the target protocol experience. The current build is a UI prototype:
              wallet signing, bridge settlement, proofs, and disclosure controls are not connected.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button variant="accent" size="lg" onClick={() => onNavigate('bridge')}>
                Launch app
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() =>
                  document
                    .getElementById('how-it-works')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                How it works
              </Button>
            </div>
          </div>
          <BridgeVisual />
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-y border-border bg-surface/55 px-4 py-24 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-[1180px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            One private workflow
          </p>
          <h2 className="mt-4 text-balance text-3xl font-medium tracking-[-0.045em] sm:text-5xl">
            Private transfers. Made simple.
          </h2>
          <div className="mt-14 grid overflow-hidden rounded-3xl border border-border bg-background sm:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon
              return (
                <article
                  key={step.number}
                  className="border-b border-border p-7 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:p-9"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-subtle">{step.number}</span>
                    <span className="grid size-10 place-items-center rounded-xl border border-border bg-surface text-accent">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                  </div>
                  <h3 className="mt-12 text-lg font-semibold tracking-[-0.025em]">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">{step.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="use-cases" className="scroll-mt-24 px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
              Real-world utility
            </p>
            <h2 className="mt-4 text-balance text-3xl font-medium tracking-[-0.045em] sm:text-5xl">
              Built for transactions that require discretion.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-muted sm:text-base">
              Blockchain transparency shouldn't mean exposing every financial detail.
              Zkross is designed to combine interoperability, confidentiality, and
              verifiable compliance.
            </p>
          </div>
          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            {useCases.map((useCase) => {
              const Icon = useCase.icon
              return (
                <article
                  key={useCase.eyebrow}
                  className="group rounded-3xl border border-border bg-surface p-7 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-border-strong sm:p-8"
                >
                  <span className="grid size-11 place-items-center rounded-2xl border border-border bg-background text-accent">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <p className="mt-9 text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">
                    {useCase.eyebrow}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                    {useCase.title}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-muted">{useCase.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="security" className="scroll-mt-24 border-y border-border bg-surface/55 px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                Privacy & compliance
              </p>
              <h2 className="mt-4 text-balance text-3xl font-medium tracking-[-0.045em] sm:text-5xl">
                Private by design. Verifiable by principle.
              </h2>
              <p className="mt-5 text-sm leading-6 text-muted sm:text-base">
                Privacy for users. Transparency for those authorized to verify.
              </p>
            </div>

            <div className="space-y-3">
              {principles.map((principle) => {
                const Icon = principle.icon
                return (
                  <article
                    key={principle.title}
                    className="flex gap-5 rounded-3xl border border-border bg-background p-6 sm:p-7"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{principle.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted">{principle.description}</p>
                    </div>
                  </article>
                )
              })}
              <div className="flex items-start gap-3 rounded-3xl border border-warning/25 bg-warning/[0.055] p-6 text-xs leading-5 text-muted">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                These are intended protocol properties, not current guarantees. Zero-knowledge
                proofs do not by themselves hide data already published on Ethereum or Stellar.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-24 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-[1180px] rounded-[2rem] border border-accent/25 bg-surface p-8 sm:p-12 lg:flex lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
              Testnet interface
            </p>
            <h2 className="mt-4 text-3xl font-medium tracking-[-0.045em]">
              Complex cryptography. Simple experience.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted">
              Explore the product flow with local mock adapters. Nothing is signed,
              submitted, proven, or settled.
            </p>
          </div>
          <Button
            variant="accent"
            size="lg"
            className="mt-7 lg:mt-0"
            onClick={() => onNavigate('bridge')}
          >
            Launch prototype
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-border px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="text-sm font-semibold">Zkross</p>
              <p className="mt-0.5 text-[11px] text-subtle">
                Private by design. Verifiable by principle. Auditable by authorization.
              </p>
              <p className="mt-1 max-w-xl text-[9px] leading-4 text-subtle">
                Independent software; not affiliated with, sponsored, or endorsed by the
                Stellar Development Foundation. “Stellar” is an SDF trademark.
              </p>
            </div>
          </div>
          <div className="flex gap-5 text-xs text-muted">
            <button type="button" onClick={() => onNavigate('bridge')} className="focus-ring rounded-md hover:text-foreground">
              App
            </button>
            <button type="button" onClick={() => onNavigate('compliance')} className="focus-ring rounded-md hover:text-foreground">
              Compliance workspace
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

export { LandingPage }
