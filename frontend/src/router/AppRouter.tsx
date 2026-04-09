import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

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

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/join/:groupId" element={<JoinGroupPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<GroupListPage />} />
            <Route path="/groups" element={<Navigate to="/" replace />} />
            <Route path="/groups/:id" element={<GroupDetailPage />} />
            <Route path="/groups/:id/upload" element={<ReceiptUploadPage />} />
            <Route path="/groups/:id/manual" element={<ManualEntryPage />} />
            <Route path="/groups/:id/history" element={<HistoryPage />} />
            <Route path="/groups/:id/settle" element={<SettlePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/add" element={<AddExpensePage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ToastViewport />
    </BrowserRouter>
  )
}
