import {
  ArrowRight,
  Check,
  Droplets,
  FlaskConical,
  Gauge,
  Info,
  Layers3,
  RotateCw,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'

const pools = [
  {
    route: 'Stellar → Ethereum',
    available: '$4.92M',
    target: '45–60%',
    utilisation: 54,
    status: 'Balanced',
  },
  {
    route: 'Ethereum → Stellar',
    available: '$3.32M',
    target: '35–55%',
    utilisation: 42,
    status: 'Balanced',
  },
]

function LiquidityPage() {
  const [allocation, setAllocation] = useState(40)
  const [amount, setAmount] = useState('10000')
  const [previewed, setPreviewed] = useState(false)
  const parsedAmount = Number.parseFloat(amount) || 0
  const split = useMemo(
    () => ({
      stellar: (parsedAmount * allocation) / 100,
      ethereum: (parsedAmount * (100 - allocation)) / 100,
    }),
    [allocation, parsedAmount],
  )

  return (
    <div className="page-enter">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            <span className="h-px w-6 bg-accent/60" />
            Liquidity
          </div>
          <h1 className="text-[2.4rem] font-medium leading-[1.04] tracking-[-0.055em] text-foreground sm:text-5xl">
            Capital without noise.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted sm:text-[15px]">
            Inspect route capacity and test allocation ideas without touching a pool.
            All figures on this screen are illustrative.
          </p>
        </div>
        <span className="self-start rounded-full border border-warning/25 bg-warning/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning sm:self-end">
          Simulated metrics
        </span>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Available capacity', value: '$8.24M', detail: 'Across both routes', icon: Droplets },
          { label: 'Mock 24h volume', value: '$1.82M', detail: 'Reference window', icon: RotateCw },
          { label: 'Target coverage', value: '2.8×', detail: 'Configured threshold', icon: Gauge },
        ].map((metric) => {
          const Icon = metric.icon
          return (
            <article key={metric.label} className="rounded-3xl border border-border bg-surface p-5 sm:p-6">
              <Icon aria-hidden="true" className="size-4 text-accent" strokeWidth={1.75} />
              <p className="mt-6 text-[11px] font-medium text-subtle">{metric.label}</p>
              <p className="mt-1 text-2xl font-medium tracking-[-0.04em] text-foreground">{metric.value}</p>
              <p className="mt-1.5 text-[11px] text-subtle">{metric.detail}</p>
            </article>
          )
        })}
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-border bg-surface-raised" aria-labelledby="route-liquidity-title">
          <div className="flex items-center justify-between border-b border-border px-5 py-5 sm:px-6">
            <div>
              <h2 id="route-liquidity-title" className="text-sm font-semibold text-foreground">Route liquidity</h2>
              <p className="mt-1 text-[11px] text-subtle">Mock pool state · refreshed locally</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Refresh mock liquidity">
              <RotateCw aria-hidden="true" />
            </Button>
          </div>

          <div className="divide-y divide-border">
            {pools.map((pool) => (
              <article key={pool.route} className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{pool.route}</p>
                    <p className="mt-1 text-[11px] text-subtle">USDC canonical route</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/[0.06] px-2.5 py-1 text-[10px] font-medium text-success">
                    <span className="size-1.5 rounded-full bg-success" />
                    {pool.status}
                  </span>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-subtle">Available</p>
                    <p className="mt-1.5 font-mono text-foreground">{pool.available}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-subtle">Target band</p>
                    <p className="mt-1.5 font-mono text-foreground">{pool.target}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-subtle">Utilisation</p>
                    <p className="mt-1.5 font-mono text-foreground">{pool.utilisation}%</p>
                  </div>
                </div>
                <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.05]" aria-hidden="true">
                  <div className="h-full rounded-full bg-accent/75" style={{ width: `${pool.utilisation}%` }} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="allocation-lab-title">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-background/55 text-accent">
              <FlaskConical aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h2 id="allocation-lab-title" className="text-sm font-semibold text-foreground">Allocation lab</h2>
              <p className="mt-1 text-[11px] leading-4 text-subtle">Preview a balanced deposit. Nothing is submitted.</p>
            </div>
          </div>

          <label htmlFor="liquidity-amount" className="mt-6 block text-xs font-medium text-muted">Mock deposit amount</label>
          <div className="mt-2.5 flex items-center rounded-2xl border border-border bg-background/45 px-4 focus-within:border-accent/50">
            <span className="mr-2 text-sm text-subtle">$</span>
            <input
              id="liquidity-amount"
              value={amount}
              inputMode="decimal"
              onChange={(event) => {
                setAmount(event.target.value.replace(/[^0-9.]/g, ''))
                setPreviewed(false)
              }}
              className="min-w-0 flex-1 bg-transparent py-3.5 font-mono text-sm text-foreground outline-none"
            />
            <span className="text-xs font-medium text-muted">USDC</span>
          </div>

          <div className="mt-6 flex items-center justify-between text-xs">
            <label htmlFor="allocation-range" className="font-medium text-muted">Stellar allocation</label>
            <span className="font-mono text-foreground">{allocation}%</span>
          </div>
          <input
            id="allocation-range"
            type="range"
            min="10"
            max="90"
            step="5"
            value={allocation}
            onChange={(event) => {
              setAllocation(Number(event.target.value))
              setPreviewed(false)
            }}
            className="mt-4 h-1.5 w-full cursor-pointer accent-[#C4B5FD]"
          />
          <div className="mt-3 flex justify-between text-[10px] text-subtle">
            <span>Stellar {allocation}%</span>
            <span>Ethereum {100 - allocation}%</span>
          </div>

          <div className={cn('mt-6 rounded-2xl border p-4 transition-colors', previewed ? 'border-accent/30 bg-accent/[0.05]' : 'border-border bg-background/35')}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-subtle">Stellar side</span>
              <span className="font-mono text-foreground">${split.stellar.toLocaleString()}</span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-subtle">Ethereum side</span>
              <span className="font-mono text-foreground">${split.ethereum.toLocaleString()}</span>
            </div>
            {previewed && (
              <div className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-[11px] leading-4 text-muted">
                <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success" />
                Preview calculated locally. No approval or deposit was requested.
              </div>
            )}
          </div>

          <Button variant="secondary" className="mt-4 w-full" onClick={() => setPreviewed(true)}>
            Preview allocation
            <ArrowRight aria-hidden="true" />
          </Button>

          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-border bg-background/30 p-3.5 text-[10px] leading-4 text-subtle">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            APY and reward claims are intentionally omitted until production economics are defined.
          </div>
        </section>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-3xl border border-border bg-surface px-5 py-4 text-xs text-muted sm:px-6">
        <Layers3 aria-hidden="true" className="size-4 shrink-0 text-accent" />
        Pool adapters are mocked behind the same interface intended for audited production integrations.
      </div>
    </div>
  )
}

export { LiquidityPage }
