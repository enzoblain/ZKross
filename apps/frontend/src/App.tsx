import { useEffect, useState, type JSX } from 'react'

import { AppShell } from './components/app-shell'
import { WalletProvider } from './components/wallet-provider'
import { ActivityPage } from './pages/activity-page'
import { BridgePage } from './pages/bridge-page'
import { CompliancePage } from './pages/compliance-page'
import { LandingPage } from './pages/landing-page'
import { PrivateBalancePage } from './pages/private-balance-page'
import { PrivacyPage } from './pages/privacy-page'

export type PageId =
  | 'landing'
  | 'bridge'
  | 'private-balance'
  | 'activity'
  | 'privacy'
  | 'compliance'
export type Theme = 'dark' | 'light'

const pages: Record<Exclude<PageId, 'landing'>, () => JSX.Element> = {
  bridge: BridgePage,
  'private-balance': PrivateBalancePage,
  activity: ActivityPage,
  privacy: PrivacyPage,
  compliance: CompliancePage,
}

function App() {
  const [activePage, setActivePage] = useState<PageId>('landing')
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = window.localStorage.getItem('zkross-theme')
    return storedTheme === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('zkross-theme', theme)
  }, [theme])

  const navigate = (page: PageId) => {
    setActivePage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const content =
    activePage === 'landing' ? (
      <LandingPage onNavigate={navigate} />
    ) : (
      (() => {
        const ActivePage = pages[activePage]
        return <ActivePage key={activePage} />
      })()
    )

  return (
    <WalletProvider>
      <AppShell
        activePage={activePage}
        onNavigate={navigate}
        theme={theme}
        onThemeChange={setTheme}
      >
        {content}
      </AppShell>
    </WalletProvider>
  )
}

export default App
