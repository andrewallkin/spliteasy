import type { ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import { ClockIcon, HomeIcon, PlusCircleIcon, UserIcon } from '@/components/ui/icons'
import { TAB_THEMES } from '@/lib/theme'

const FOCUSED_FLOW = /^\/groups\/[^/]+\/(upload|manual|settle)$/

const tabs: { to: string; label: string; theme: (typeof TAB_THEMES)[keyof typeof TAB_THEMES]; icon: (className: string) => ReactNode }[] = [
  { to: '/', label: 'Home', theme: TAB_THEMES.home, icon: (c) => <HomeIcon className={c} /> },
  { to: '/history', label: 'History', theme: TAB_THEMES.history, icon: (c) => <ClockIcon className={c} /> },
  { to: '/add', label: 'Add', theme: TAB_THEMES.add, icon: (c) => <PlusCircleIcon className={c} /> },
  { to: '/profile', label: 'Profile', theme: TAB_THEMES.profile, icon: (c) => <UserIcon className={c} /> },
]

function tabActive(pathname: string, tabTo: string): boolean {
  if (tabTo === '/') {
    return (
      pathname === '/' ||
      pathname === '/groups' ||
      /^\/groups\/[^/]+$/.test(pathname) ||
      /^\/groups\/[^/]+\/settle$/.test(pathname)
    )
  }
  if (tabTo === '/history') {
    return pathname === '/history' || pathname.startsWith('/history/') || /\/groups\/[^/]+\/history$/.test(pathname)
  }
  if (tabTo === '/add') {
    return pathname === '/add' || /\/groups\/[^/]+\/(upload|manual)$/.test(pathname)
  }
  if (tabTo === '/profile') {
    return pathname.startsWith('/profile')
  }
  return pathname === tabTo || pathname.startsWith(`${tabTo}/`)
}

export function AppLayout() {
  const location = useLocation()
  const isFocusedFlow = FOCUSED_FLOW.test(location.pathname)
  return (
    <div className={`min-h-screen w-full bg-surface-warm ${isFocusedFlow ? 'pb-32' : 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]'}`}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:shadow-float">
        Skip to content
      </a>
      <div className="mx-auto w-full max-w-[768px]">
        <main id="main-content" aria-live="polite">
          <Outlet />
        </main>
      </div>
      {!isFocusedFlow && (
        <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 rounded-t-[28px] bg-white shadow-nav pb-[env(safe-area-inset-bottom)]">
          <ul className="mx-auto grid h-[72px] max-w-[768px] grid-cols-4 items-center px-2">
            {tabs.map((tab) => {
              const active = tabActive(location.pathname, tab.to)
              return (
                <li key={tab.to} className="flex justify-center">
                  <Link
                    to={tab.to}
                    aria-current={active ? 'page' : undefined}
                    className={`flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-2xl px-3.5 text-xs font-bold transition-all duration-200 ${
                      active ? tab.theme.navActive : 'text-ink-tertiary hover:text-ink-secondary'
                    }`}
                  >
                    {tab.icon('h-6 w-6')}
                    <span className={active ? '' : 'sr-only'}>{tab.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </div>
  )
}
