import {
  ArrowLeftRight,
  Droplets,
  LifeBuoy,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import type { ReactNode } from 'react'

import type { PageId } from '../App'
import { cn } from '../lib/utils'
import { BrandMark } from './brand-mark'
import { Button } from './ui/button'

const navigation = [
  { id: 'bridge', label: 'Bridge', icon: ArrowLeftRight },
  { id: 'liquidity', label: 'Liquidity', icon: Droplets },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'admin', label: 'Admin', icon: SlidersHorizontal },
] satisfies Array<{ id: PageId; label: string; icon: typeof ArrowLeftRight }>

type AppShellProps = {
  activePage: PageId
  onNavigate: (page: PageId) => void
  children: ReactNode
}

function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  const navigate = (page: PageId) => {
    onNavigate(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="hidden min-h-screen border-r border-border bg-background/95 px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <button
          type="button"
          className="focus-ring flex items-center gap-3 rounded-xl px-2 py-1.5 text-left"
          onClick={() => navigate('bridge')}
          aria-label="NØCT home"
        >
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-[0.18em]">NØCT</span>
        </button>

        <nav aria-label="Primary navigation" className="mt-10 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = activePage === item.id

            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'focus-ring group flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm transition-colors',
                  isActive
                    ? 'bg-white/[0.06] text-foreground'
                    : 'text-muted hover:bg-white/[0.035] hover:text-foreground',
                )}
                onClick={() => navigate(item.id)}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    'size-4',
                    isActive ? 'text-accent' : 'text-subtle group-hover:text-muted',
                  )}
                  strokeWidth={1.75}
                />
                {item.label}
                {item.id === 'privacy' && (
                  <span className="ml-auto rounded-md border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-subtle">
                    Lab
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-2xl border border-border bg-surface px-3.5 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span className="size-1.5 rounded-full bg-warning" />
              Sandbox mode
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-subtle">
              Mock adapters only. No assets move.
            </p>
          </div>
          <Button variant="ghost" className="w-full justify-start" size="sm">
            <LifeBuoy aria-hidden="true" />
            Documentation
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4">
            <button
              type="button"
              className="focus-ring flex items-center gap-2.5 rounded-xl lg:hidden"
              onClick={() => navigate('bridge')}
              aria-label="NØCT home"
            >
              <BrandMark className="size-8" />
              <span className="text-sm font-semibold tracking-[0.16em]">NØCT</span>
            </button>

            <div className="hidden items-center gap-2 text-xs text-subtle lg:flex">
              <LockKeyhole aria-hidden="true" className="size-3.5" />
              Auditable bridge interface
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-muted sm:inline-flex">
                <span className="size-1.5 rounded-full bg-warning" />
                Test environment
              </span>
              <Button variant="secondary" size="sm" onClick={() => navigate('bridge')}>
                Open bridge
              </Button>
            </div>
          </div>
        </header>

        <nav
          aria-label="Mobile navigation"
          className="sticky top-16 z-30 overflow-x-auto border-b border-border bg-background/90 px-3 py-2 backdrop-blur-xl lg:hidden"
        >
          <div className="mx-auto flex min-w-max gap-1">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = activePage === item.id

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'focus-ring flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-white/[0.07] text-foreground'
                      : 'text-muted hover:text-foreground',
                  )}
                  onClick={() => navigate(item.id)}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn('size-3.5', isActive && 'text-accent')}
                  />
                  {item.label}
                </button>
              )
            })}
          </div>
        </nav>

        <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-[1280px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10 lg:py-16">
          {children}
        </main>
      </div>
    </div>
  )
}

export { AppShell }
