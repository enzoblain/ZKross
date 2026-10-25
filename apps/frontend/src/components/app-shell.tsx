import { Activity, ArrowLeftRight, Building2, Moon, Sun, WalletCards } from 'lucide-react'
import type { ReactNode } from 'react'

import type { PageId, Theme } from '../App'
import { cn } from '../lib/utils'
import { BrandMark } from './brand-mark'
import { Button } from './ui/button'

type AppShellProps = {
  activePage: PageId
  onNavigate: (page: PageId) => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  children: ReactNode
}

const appNavigation = [
  { id: 'bridge', label: 'Bridge', icon: ArrowLeftRight },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'institutional', label: 'Institutions', icon: Building2 },
] satisfies Array<{
  id: Exclude<PageId, 'landing'>
  label: string
  icon: typeof Activity
}>

function ThemeButton({
  theme,
  onThemeChange,
}: Pick<AppShellProps, 'theme' | 'onThemeChange'>) {
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className="focus-ring grid size-9 place-items-center rounded-xl border border-border bg-surface text-muted transition-colors hover:border-border-strong hover:text-foreground"
      onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Use light theme' : 'Use dark theme'}
      title={isDark ? 'Use light theme' : 'Use dark theme'}
    >
      {isDark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
    </button>
  )
}

function AppShell({
  activePage,
  onNavigate,
  theme,
  onThemeChange,
  children,
}: AppShellProps) {
  const isLanding = activePage === 'landing'

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border bg-background/82 px-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4">
          <button
            type="button"
            className="focus-ring flex items-center gap-2.5 rounded-xl"
            onClick={() => onNavigate('landing')}
            aria-label="Zkross home"
          >
            <BrandMark />
            <span className="text-sm font-semibold tracking-[-0.02em]">Zkross</span>
          </button>

          {isLanding ? (
            <nav aria-label="Landing page" className="hidden items-center gap-1 md:flex">
              {[
                ['how-it-works', 'How it works'],
                ['use-cases', 'Use cases'],
                ['security', 'Security'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="focus-ring rounded-lg px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-foreground"
                  onClick={() => scrollToSection(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          ) : (
            <nav aria-label="Application" className="hidden items-center gap-1 md:flex">
              {appNavigation.map((item) => {
                const Icon = item.icon
                const isActive = activePage === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => onNavigate(item.id)}
                    className={cn(
                      'focus-ring flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-surface-raised text-foreground'
                        : 'text-muted hover:bg-surface hover:text-foreground',
                    )}
                  >
                    <Icon aria-hidden="true" className={cn('size-3.5', isActive && 'text-accent')} />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          )}

          <div className="flex items-center gap-2">
            <ThemeButton theme={theme} onThemeChange={onThemeChange} />
            {isLanding ? (
              <Button variant="accent" size="sm" onClick={() => onNavigate('bridge')}>
                Launch app
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigate('bridge')}
                className="hidden sm:inline-flex"
              >
                <WalletCards aria-hidden="true" />
                Wallets · mock
              </Button>
            )}
          </div>
        </div>

        {!isLanding && (
          <nav aria-label="Mobile application" className="mx-auto flex max-w-[1240px] gap-1 overflow-x-auto pb-2 md:hidden">
            {appNavigation.map((item) => {
              const Icon = item.icon
              const isActive = activePage === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    'focus-ring flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium',
                    isActive ? 'bg-surface-raised text-foreground' : 'text-muted',
                  )}
                >
                  <Icon aria-hidden="true" className={cn('size-3.5', isActive && 'text-accent')} />
                  {item.label}
                </button>
              )
            })}
          </nav>
        )}
      </header>

      <main
        className={cn(
          isLanding
            ? 'min-h-[calc(100vh-4rem)]'
            : 'mx-auto min-h-[calc(100vh-4rem)] max-w-[1180px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8',
        )}
      >
        {children}
      </main>
    </div>
  )
}

export { AppShell }
