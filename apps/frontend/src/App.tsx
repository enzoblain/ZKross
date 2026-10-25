import { useEffect, useState, type JSX } from 'react'

import { AppShell } from './components/app-shell'
import { ActivityPage } from './pages/activity-page'
import { BridgePage } from './pages/bridge-page'
import { InstitutionalPage } from './pages/institutional-page'
import { LandingPage } from './pages/landing-page'

export type PageId = 'landing' | 'bridge' | 'activity' | 'institutional'
export type Theme = 'dark' | 'light'

const pages: Record<Exclude<PageId, 'landing'>, () => JSX.Element> = {
  bridge: BridgePage,
  activity: ActivityPage,
  institutional: InstitutionalPage,
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
    <AppShell
      activePage={activePage}
      onNavigate={navigate}
      theme={theme}
      onThemeChange={setTheme}
    >
      {content}
    </AppShell>
  )
}

export default App
