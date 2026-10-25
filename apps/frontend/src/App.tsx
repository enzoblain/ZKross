import { useState, type JSX } from 'react'

import { AppShell } from './components/app-shell'
import { AdminPage } from './pages/admin-page'
import { BridgePage } from './pages/bridge-page'
import { LiquidityPage } from './pages/liquidity-page'
import { PrivacyPage } from './pages/privacy-page'

export type PageId = 'bridge' | 'liquidity' | 'privacy' | 'admin'

const pages: Record<PageId, () => JSX.Element> = {
  bridge: BridgePage,
  liquidity: LiquidityPage,
  privacy: PrivacyPage,
  admin: AdminPage,
}

function App() {
  const [activePage, setActivePage] = useState<PageId>('bridge')
  const ActivePage = pages[activePage]

  return (
    <AppShell activePage={activePage} onNavigate={setActivePage}>
      <ActivePage key={activePage} />
    </AppShell>
  )
}

export default App
