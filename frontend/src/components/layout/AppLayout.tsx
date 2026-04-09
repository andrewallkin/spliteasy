import { Link, Outlet, useLocation } from 'react-router-dom'

import { ToastViewport } from '@/components/ui/ToastViewport'

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
    <div className="mx-auto min-h-screen w-full max-w-[768px] pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-white/40 glass px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-pastel-purple to-pastel-purple-deep">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-ink">SplitEasy</h1>
        </div>
      </header>
      <main id="main-content" className="px-4 py-5" aria-live="polite">
        <Outlet />
      </main>
      <nav
        aria-label="Main navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/40 glass pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto grid max-w-[768px] grid-cols-4">
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
      <ToastViewport />
    </div>
  )
}
