import { Link, Outlet, useLocation } from 'react-router-dom'

const tabs = [
  {
    to: '/groups',
    label: 'Home',
    icon: (active: boolean) => (
      <svg className={`h-6 w-6 ${active ? 'text-pastel-purple-deep' : 'text-ink-tertiary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    to: '/history',
    label: 'History',
    icon: (active: boolean) => (
      <svg className={`h-6 w-6 ${active ? 'text-pastel-purple-deep' : 'text-ink-tertiary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: '/add',
    label: 'Add',
    icon: (active: boolean) => (
      <svg className={`h-6 w-6 ${active ? 'text-pastel-purple-deep' : 'text-ink-tertiary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (active: boolean) => (
      <svg className={`h-6 w-6 ${active ? 'text-pastel-purple-deep' : 'text-ink-tertiary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
]

function tabActive(pathname: string, tabTo: string): boolean {
  if (tabTo === '/groups') {
    return (
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
  return pathname.startsWith(tabTo)
}

export function AppLayout() {
  const location = useLocation()
  return (
    <div className="mx-auto min-h-screen w-full max-w-[768px] lg:max-w-[1200px] xl:max-w-[1360px] pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-white/40 glass px-5 py-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 overflow-hidden rounded-xl ring-1 ring-ink-faint/15">
            <img src="/spliteasy-icon.jpeg" alt="" className="h-full w-full object-cover" width={32} height={32} />
          </div>
          <h1 className="text-lg font-bold text-ink">SplitEasy</h1>
        </div>
      </header>
      <main id="main-content" className="px-4 py-5 md:px-6 lg:px-8" aria-live="polite">
        <Outlet />
      </main>
      <nav
        aria-label="Main navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/40 glass pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto grid max-w-[768px] lg:max-w-[1200px] xl:max-w-[1360px] grid-cols-4">
          {tabs.map((tab) => {
            const active = tabActive(location.pathname, tab.to)
            return (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  aria-current={active ? 'page' : undefined}
                  className="flex h-16 flex-col items-center justify-center gap-0.5 transition-all duration-200"
                >
                  {tab.icon(active)}
                  <span className={`text-[10px] font-medium ${active ? 'text-pastel-purple-deep' : 'text-ink-tertiary'}`}>
                    {tab.label}
                  </span>
                  {active && (
                    <div className="h-0.5 w-4 rounded-full bg-pastel-purple-deep" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
