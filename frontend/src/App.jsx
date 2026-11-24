import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { PageLoader, ToastProvider } from '@/components/ui'
import { StoreProvider } from '@/lib/store'

// Four separate bundles: website visitors never download the portals or the admin panel.
const Site = lazy(() => import('@/modules/site/Site'))
const ClientPortal = lazy(() => import('@/modules/portal/ClientPortal'))
const AdvocatePortal = lazy(() => import('@/modules/portal/AdvocatePortal'))
const AdminApp = lazy(() => import('@/modules/admin/AdminApp'))

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <ToastProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/app/*" element={<ClientPortal />} />
              <Route path="/advocate/*" element={<AdvocatePortal />} />
              <Route path="/admin/*" element={<AdminApp />} />
              <Route path="/*" element={<Site />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </StoreProvider>
    </BrowserRouter>
  )
}
