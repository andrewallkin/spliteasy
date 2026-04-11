import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { ToastViewport } from '@/components/ui/ToastViewport'
import { AddExpensePage } from '@/pages/AddExpensePage'
import { GroupDetailPage } from '@/pages/GroupDetailPage'
import { GroupListPage } from '@/pages/GroupListPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { JoinGroupPage } from '@/pages/JoinGroupPage'
import { LoginPage } from '@/pages/LoginPage'
import { ManualEntryPage } from '@/pages/ManualEntryPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { ReceiptUploadPage } from '@/pages/ReceiptUploadPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { SettlePage } from '@/pages/SettlePage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/join/:groupId', element: <JoinGroupPage /> },
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <GroupListPage /> },
          { path: '/groups', element: <Navigate to="/" replace /> },
          { path: '/groups/:id', element: <GroupDetailPage /> },
          { path: '/groups/:id/upload', element: <ReceiptUploadPage /> },
          { path: '/groups/:id/manual', element: <ManualEntryPage /> },
          { path: '/groups/:id/history', element: <HistoryPage /> },
          { path: '/groups/:id/settle', element: <SettlePage /> },
          { path: '/history', element: <HistoryPage /> },
          { path: '/add', element: <AddExpensePage /> },
          { path: '/profile', element: <ProfilePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

export function AppRouter() {
  return (
    <>
      <RouterProvider router={router} />
      <ToastViewport />
    </>
  )
}
