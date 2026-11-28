import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { PageLoader, ToastProvider } from '@/components/ui'

// Four separate bundles: website visitors never download the portals or the admin panel.
const Site = lazy(() => import('@/modules/site/Site'))
const Login = lazy(() => import('@/modules/portal/Login'))
const ClientPortal = lazy(() => import('@/modules/portal/ClientPortal'))
const AdvocatePortal = lazy(() => import('@/modules/portal/AdvocatePortal'))
const AdminApp = lazy(() => import('@/modules/admin/AdminApp'))

export default function App() {
  return (
    <BrowserRouter>
        <ToastProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/app/*" element={<ClientPortal />} />
              <Route path="/advocate/*" element={<AdvocatePortal />} />
              <Route path="/admin/*" element={<AdminApp />} />
              <Route path="/*" element={<Site />} />
            </Routes>
          </Suspense>
        </ToastProvider>
    </BrowserRouter>
  )
}
