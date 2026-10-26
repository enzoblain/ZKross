import { useEffect, useState, type JSX } from 'react'

import { AppShell } from './components/app-shell'
import { WalletProvider } from './components/wallet-provider'
import { CctpActivityPage as ActivityPage } from './pages/cctp-activity-page'
import { CctpBridgePage as BridgePage } from './pages/cctp-bridge-page'
import { CctpCompliancePage as CompliancePage } from './pages/cctp-compliance-page'
import { LandingPage } from './pages/landing-page'
import { PrivateBalancePage } from './pages/private-balance-page'
import { CctpPrivacyPage as PrivacyPage } from './pages/cctp-privacy-page'

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
