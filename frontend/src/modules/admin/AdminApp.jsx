import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { BadgeCheck, BarChart3, Car, Contact, FileText, Headset, Receipt, Tag, Inbox, IndianRupee, Landmark, CreditCard, FolderTree, History, LayoutDashboard, LogOut, Menu, Settings as SettingsIcon, UserCog, Users, X } from 'lucide-react'
import { Button, Field, Note, PageLoader, Wordmark, cx } from '@/components/ui'
import { IMG } from '@/lib/catalog'
import { useTitle } from '@/lib/format'
import { adminApi, adminSession, ApiError, refreshAdmin } from '@/lib/api'
import { AdminCtx, useAdmin } from './context'
import { Account, AuditLogPage, Categories, Dashboard, SettingsPage, Team } from './pages'
import { AdvocateDetail, Advocates, Clients, Plans } from './people'
import { RequestDetail, Requests } from './requests'
import { Payments, Withdrawals } from './money'
import { ChallanDetail, Challans, HelpDesk, HelpDeskTicket } from './service'
import { ContentPage, GstFilingDetail, GstFilings, OffersPage, Reports } from './growth'

/**
 * Admin panel at /admin. Unlike the portals (still on the demo store), every screen here
 * talks to the real API. Modules are added as their backend endpoints are built.
 */

const NAV = [
  { to: '/admin', end: true, label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/requests', label: 'Request queue', icon: Inbox },
  { to: '/admin/advocates', label: 'Advocates', icon: BadgeCheck },
  { to: '/admin/clients', label: 'Clients', icon: Contact },
  { to: '/admin/payments', label: 'Payments', icon: IndianRupee },
  { to: '/admin/withdrawals', label: 'Withdrawals', icon: Landmark },
  { to: '/admin/challans', label: 'e-Challan', icon: Car },
  { to: '/admin/support', label: 'Help desk', icon: Headset },
  { to: '/admin/gst-filings', label: 'GST filing', icon: Receipt },
  { to: '/admin/offers', label: 'Offers & banners', icon: Tag },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/content', label: 'Content', icon: FileText },
  { to: '/admin/plans', label: 'Membership plans', icon: CreditCard },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree },
  { to: '/admin/settings', label: 'Commission & settings', icon: SettingsIcon },
  { to: '/admin/team', label: 'Admin team', icon: Users, superOnly: true },
  { to: '/admin/audit', label: 'Audit log', icon: History },
  { to: '/admin/account', label: 'My account', icon: UserCog },
]

export default function AdminApp() {
  const [admin, setAdmin] = useState(null)
  const [checking, setChecking] = useState(true)
  useTitle('Admin')

  useEffect(() => {
    adminSession.onSignedOut(() => setAdmin(null))
    refreshAdmin()
      .then((d) => setAdmin(d.admin))
      .catch(() => setAdmin(null))
      .finally(() => setChecking(false))
  }, [])

  const logout = useCallback(async () => {
    try {
      await adminApi('/admin/auth/logout', { method: 'POST' })
    } catch {
      /* the session may already be gone */
    }
    adminSession.clear()
    setAdmin(null)
  }, [])

  if (checking) return <PageLoader />
  if (!admin) return <AdminLogin onIn={setAdmin} />
  const isSuper = admin.role === 'super_admin'
  return (
    <AdminCtx.Provider value={{ admin, isSuper, setAdmin, logout }}>
      <AdminShell>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="requests" element={<Requests />} />
          <Route path="requests/:id" element={<RequestDetail />} />
          <Route path="advocates" element={<Advocates />} />
          <Route path="advocates/:id" element={<AdvocateDetail />} />
          <Route path="clients" element={<Clients />} />
          <Route path="plans" element={<Plans />} />
          <Route path="payments" element={<Payments />} />
          <Route path="withdrawals" element={<Withdrawals />} />
          <Route path="challans" element={<Challans />} />
          <Route path="challans/:id" element={<ChallanDetail />} />
          <Route path="support" element={<HelpDesk />} />
          <Route path="support/:id" element={<HelpDeskTicket />} />
          <Route path="gst-filings" element={<GstFilings />} />
          <Route path="gst-filings/:id" element={<GstFilingDetail />} />
          <Route path="offers" element={<OffersPage />} />
          <Route path="reports" element={<Reports />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="categories" element={<Categories />} />
          <Route path="settings" element={<SettingsPage />} />
          {isSuper ? <Route path="team" element={<Team />} /> : null}
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="account" element={<Account />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AdminShell>
    </AdminCtx.Provider>
  )
}

/* ---------------- login ---------------- */

function AdminLogin({ onIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const j = await adminApi('/admin/auth/login', { method: 'POST', body: { email, password } })
      adminSession.set(j.data.accessToken)
      onIn(j.data.admin)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-page">
      <div className="hidden lg:flex flex-col justify-between bg-ink p-12 text-white">
        <Link to="/">
          <Wordmark className="h-9" />
        </Link>
        <div className="flex flex-col gap-5 max-w-md">
          <img src={IMG.emblem} alt="" className="w-28" />
          <p className="font-serif font-bold text-[34px] leading-tight">Admin panel</p>
          <p className="text-on-ink">Verify advocates, assign requests and manage payments, commission and content.</p>
        </div>
        <p className="text-[12px] text-on-ink-muted">Staff only. Every action is recorded.</p>
      </div>
      <div className="flex flex-col">
        <div className="lg:hidden bg-ink px-5 py-5">
          <Wordmark className="h-8" />
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-4">
            <div>
              <h1 className="font-serif font-bold text-[30px]">Admin log in</h1>
              <p className="text-muted text-[14px] mt-1">Use the email and password your super admin gave you.</p>
            </div>
            <Field label="Email" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            {error ? <Note tone="orange">{error}</Note> : null}
            <Button type="submit" size="lg" loading={busy} disabled={!email || !password}>
              Log in
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

/* ---------------- shell ---------------- */

function AdminShell({ children }) {
  const { admin, isSuper, logout } = useAdmin()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const nav = NAV.filter((n) => !n.superOnly || isSuper)
  const title = nav.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label ?? 'Admin'
  useEffect(() => setOpen(false), [loc.pathname])

  const side = (
    <>
      <Link to="/admin" className="px-2 mb-6 mt-2 flex items-center gap-2">
        <Wordmark className="h-7" />
        <span className="rounded-md bg-ink-line px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">Admin</span>
      </Link>
      {nav.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex items-center gap-3 h-10 px-3 rounded-lg text-[14px] font-medium', isActive ? 'bg-gold text-ink font-bold' : 'text-on-ink hover:bg-ink-2')}>
          <n.icon className="size-[18px]" />
          {n.label}
        </NavLink>
      ))}
      <div className="mt-auto border-t border-ink-line pt-4 flex items-center gap-3 px-1">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold truncate">{admin.name}</p>
          <p className="text-[11px] text-on-ink-muted">{isSuper ? 'Super admin' : 'Staff'}</p>
        </div>
        <button onClick={logout} aria-label="Log out" className="grid size-9 place-items-center rounded-lg hover:bg-ink-2">
          <LogOut className="size-[18px]" />
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-page lg:flex">
      <aside className="hidden lg:flex w-[248px] shrink-0 flex-col bg-ink text-white sticky top-0 h-screen p-4 gap-1">{side}</aside>
      {open ? (
        <div className="lg:hidden fixed inset-0 z-50 flex bg-ink/50" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <aside className="w-[260px] flex flex-col bg-ink text-white p-4 gap-1">{side}</aside>
        </div>
      ) : null}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-white border-b border-line">
          <div className="flex items-center gap-3 h-16 px-4 sm:px-6">
            <button onClick={() => setOpen(!open)} aria-label="Menu" className="lg:hidden grid size-10 place-items-center rounded-xl border border-line">
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <h1 className="text-[18px] font-bold">{title}</h1>
          </div>
        </header>
        <main className="flex-1 w-full max-w-[1120px] mx-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}

