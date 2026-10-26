import { useEffect, useState, type JSX } from 'react'

import { AppShell } from './components/app-shell'
import { WalletProvider } from './components/wallet-provider'
import { experimentalPages, readExperimental, writeExperimental } from './lib/experimental'
import { ActivityPage } from './pages/activity-page'
import { BridgePage } from './pages/bridge-page'
import { CctpActivityPage } from './pages/cctp-activity-page'
import { CctpBridgePage } from './pages/cctp-bridge-page'
import { CctpCompliancePage } from './pages/cctp-compliance-page'
import { CctpPrivacyPage } from './pages/cctp-privacy-page'
import { CompliancePage } from './pages/compliance-page'
import { LandingPage } from './pages/landing-page'
import { LiquidityPage } from './pages/liquidity-page'
import { PrivacyPage } from './pages/privacy-page'
import { PrivateBalancePage } from './pages/private-balance-page'

export type PageId =
  | 'landing'
  | 'bridge'
  | 'liquidity'
  | 'activity'
  | 'privacy'
  | 'compliance'
  | 'cctp-bridge'
  | 'private-balance'
  | 'cctp-activity'
  | 'cctp-privacy'
  | 'cctp-compliance'
export type Theme = 'dark' | 'light'

// The main path is the liquidity bridge; the CCTP pages (experimental) only
// show when the experimental setting is on.
const pages: Record<Exclude<PageId, 'landing'>, () => JSX.Element> = {
  bridge: BridgePage,
  liquidity: LiquidityPage,
  activity: ActivityPage,
  privacy: PrivacyPage,
  compliance: CompliancePage,
  'cctp-bridge': CctpBridgePage,
  'private-balance': PrivateBalancePage,
  'cctp-activity': CctpActivityPage,
  'cctp-privacy': CctpPrivacyPage,
  'cctp-compliance': CctpCompliancePage,
}

function App() {
  const [activePage, setActivePage] = useState<PageId>('landing')
  const [experimental, setExperimental] = useState(readExperimental)
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

  const changeExperimental = (enabled: boolean) => {
    writeExperimental(enabled)
    setExperimental(enabled)
    if (!enabled && experimentalPages.includes(activePage)) setActivePage('bridge')
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
        experimental={experimental}
        onExperimentalChange={changeExperimental}
      >
        {content}
      </AppShell>
    </WalletProvider>
  )
}

export default App
