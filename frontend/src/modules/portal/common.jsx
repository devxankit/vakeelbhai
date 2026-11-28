/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, ChevronRight, LogOut, ShieldCheck } from 'lucide-react'
import { Avatar, Button, Field, Modal, Note, Wordmark, cx } from '@/components/ui'
import { errText, userApi, userSession } from '@/lib/api'
import { IMG } from '@/lib/catalog'
import { useLive } from '@/lib/live'
import { ago, phonePretty } from '@/lib/format'

/* ---------------- login (mobile OTP only) ---------------- */

const publicPost = (path, body) => userApi(path, { method: 'POST', body })

/**
 * One login for the website, like the app: choose "I am a Client" or "I am an Advocate"
 * (skipped when `role` is given), then mobile number and OTP. `onDone(role)` runs after login.
 */
export function PortalLogin({ role: initialRole, onDone }) {
  const [role, setRole] = useState(initialRole ?? null)
  const [step, setStep] = useState(initialRole ? 'phone' : 'role')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ok = /^[6-9]\d{9}$/.test(phone)
  const isClient = role === 'client'
  const sendCode = async () => {
    if (!ok) return
    setError('')
    setBusy(true)
    try {
      await publicPost('/auth/otp/send', { phone, role })
      setStep('otp')
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const verify = async (c = code) => {
    if (c.length !== 6 || busy) return
    setBusy(true)
    setError('')
    try {
      const j = await userApi('/auth/otp/verify', { method: 'POST', body: { phone, role, otp: c } })
      userSession.set(j.data.accessToken)
      onDone?.(role)
    } catch (e) {
      setError(errText(e))
      setCode('')
    } finally {
      setBusy(false)
    }
  }
  const pick = (r) => {
    setRole(r)
    setStep('phone')
    setCode('')
    setError('')
  }
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-page">
      <div className="hidden lg:flex flex-col justify-between bg-ink p-12 text-white">
        <Link to="/">
          <Wordmark className="h-9" />
        </Link>
        <div className="flex flex-col gap-5 max-w-md">
          <img src={IMG.emblem} alt="" className="w-28" />
          <p className="font-serif font-bold text-[34px] leading-tight">{!role ? 'Verified advocates. Safe payments.' : isClient ? 'Legal help from a verified advocate.' : 'Grow your practice with verified client requests.'}</p>
          <p className="text-on-ink">{!role ? 'One account for clients and advocates. Log in with your mobile number.' : isClient ? 'Private chat, safe payments, released only when you confirm.' : 'Get verified once, receive requests in your district, and get paid to your wallet.'}</p>
        </div>
        <p className="text-[12px] text-on-ink-muted">Your number is never shown to anyone.</p>
      </div>
      <div className="flex flex-col">
        <div className="lg:hidden bg-ink px-5 py-5">
          <Link to="/">
            <Wordmark className="h-8" />
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm flex flex-col gap-5">
            {step === 'role' ? (
              <>
                <div>
                  <h1 className="font-serif font-bold text-[30px]">Log in or sign up</h1>
                  <p className="text-muted text-[14px] mt-1">How do you use Vakeel Bhai?</p>
                </div>
                {[
                  { key: 'client', img: IMG.clientAnanya, title: 'I am a Client', sub: 'Get legal help from a verified advocate' },
                  { key: 'advocate', img: IMG.advRohan, title: 'I am an Advocate', sub: 'Receive client requests and grow your practice' },
                ].map((r) => (
                  <button key={r.key} type="button" onClick={() => pick(r.key)} className="card p-4 flex items-center gap-4 text-left hover:border-ink transition">
                    <img src={r.img} alt="" className="size-14 rounded-full object-cover shrink-0" />
                    <span className="flex-1">
                      <span className="block text-[16px] font-bold">{r.title}</span>
                      <span className="block text-[13px] text-muted">{r.sub}</span>
                    </span>
                    <ChevronRight className="size-5 text-muted" />
                  </button>
                ))}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <img src={isClient ? IMG.clientAnanya : IMG.advRohan} alt="" className="size-7 rounded-full object-cover" />
                <span className="text-[13px] font-semibold text-gold-text">{isClient ? 'Client' : 'Advocate'}</span>
                <button type="button" onClick={() => pick(isClient ? 'advocate' : 'client')} className="ml-auto text-[13px] font-semibold text-muted hover:text-text">
                  {isClient ? 'I am an advocate' : 'I am a client'} →
                </button>
              </div>
            )}
            {step === 'role' ? null : step === 'phone' ? (
              <>
                <div>
                  <h1 className="font-serif font-bold text-[30px]">Log in</h1>
                  <p className="text-muted text-[14px] mt-1">Use your mobile number. New here? The same step creates your account.</p>
                </div>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    sendCode()
                  }}>
                  <Field label="Mobile number" prefix="+91" inputMode="tel" autoFocus maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile number" hint="We'll send a 6-digit code by SMS. No password needed." />
                  {error ? <Note tone="orange">{error}</Note> : null}
                  <Button type="submit" size="lg" disabled={!ok} loading={busy}>
                    Get OTP
                  </Button>
                </form>
              </>
            ) : (
              <>
                <div>
                  <button onClick={() => setStep('phone')} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted mb-3">
                    <ArrowLeft className="size-4" /> Change number
                  </button>
                  <h1 className="font-serif font-bold text-[30px]">Enter the code</h1>
                  <p className="text-muted text-[14px] mt-1">Sent to +91 {phonePretty(phone)}</p>
                </div>
                <Field
                  label="6-digit code"
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    const c = e.target.value.replace(/\D/g, '')
                    setCode(c)
                    if (c.length === 6) verify(c)
                  }}
                  hint={import.meta.env.DEV ? 'Development: the code is printed in the API server log' : undefined}
                />
                {error ? <Note tone="orange">{error}</Note> : null}
                <Button size="lg" disabled={code.length !== 6} loading={busy} onClick={() => verify()}>
                  Verify and continue
                </Button>
              </>
            )}
            <p className="text-[12px] text-muted">By continuing you agree to our <Link className="underline" to="/legal/terms">Terms</Link> and <Link className="underline" to="/legal/privacy">Privacy Policy</Link>.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- shell ---------------- */

/** The bell: notifications from the API, live. */
function useNotices() {
  const [list, setList] = useState([])
  const [unread, setUnread] = useState(0)
  const load = useCallback(() => {
    userApi('/notifications')
      .then((j) => (setList(j.data), setUnread(j.meta?.unread ?? 0)))
      .catch(() => {})
  }, [])
  useEffect(load, [load])
  useLive('user', { notification: load, reconnect: load })
  const markRead = () => {
    if (!unread) return
    userApi('/notifications/read', { method: 'POST', body: {} })
      .then((j) => (setUnread(j.data.unread), setList((l) => l.map((n) => ({ ...n, read: true })))))
      .catch(() => {})
  }
  return { list, unread, markRead }
}

export function PortalShell({ nav, user, title, onLogout, children, roleLabel }) {
  const [bell, setBell] = useState(false)
  const { list: notices, unread, markRead } = useNotices()
  return (
    <div className="min-h-screen bg-page lg:flex">
      <aside className="hidden lg:flex w-[248px] shrink-0 flex-col bg-ink text-white sticky top-0 h-screen p-4 gap-1">
        <Link to="/" className="px-2 mb-6 mt-2">
          <Wordmark className="h-7" />
        </Link>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex items-center gap-3 h-10 px-3 rounded-lg text-[14px] font-medium', isActive ? 'bg-gold text-ink font-bold' : 'text-on-ink hover:bg-ink-2')}>
            <n.icon className="size-[18px]" />
            {n.label}
            {n.badge ? <span className="ml-auto rounded-full bg-ink-line px-2 text-[11px] font-bold">{n.badge}</span> : null}
          </NavLink>
        ))}
        <div className="mt-auto border-t border-ink-line pt-4 flex items-center gap-3 px-1">
          <Avatar photo={user.photo} size={36} ring />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold truncate">{user.name || 'New user'}</p>
            <p className="text-[11px] text-on-ink-muted">{roleLabel}</p>
          </div>
          <button onClick={onLogout} aria-label="Log out" className="grid size-9 place-items-center rounded-lg hover:bg-ink-2">
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col pb-[72px] lg:pb-0">
        <header className="sticky top-0 z-30 bg-white border-b border-line">
          <div className="flex items-center gap-3 h-16 px-4 sm:px-6">
            <Link to="/" className="lg:hidden">
              <Wordmark dark={false} className="h-7" />
            </Link>
            <h1 className="hidden lg:block text-[18px] font-bold">{title}</h1>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => { setBell(true); markRead() }} aria-label="Notifications" className="relative grid size-10 place-items-center rounded-xl border border-line">
                <Bell className="size-5" />
                {unread ? <span className="absolute top-2 right-2.5 size-2.5 rounded-full bg-gold ring-2 ring-white" /> : null}
              </button>
              <Avatar photo={user.photo} size={36} className="lg:hidden" />
            </div>
          </div>
        </header>
        <main className="flex-1 w-full max-w-[1120px] mx-auto p-4 sm:p-6">{children}</main>
      </div>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-line flex">
        {nav.filter((n) => n.mobile).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('relative flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-3 text-[11px]', isActive ? 'text-ink font-bold' : 'text-muted font-medium')}>
            {({ isActive }) => (
              <>
                {isActive ? <span className="absolute top-0 h-[3px] w-7 rounded-b bg-gold" /> : null}
                <n.icon className="size-[22px]" />
                {n.short ?? n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <Modal open={bell} onClose={() => setBell(false)} title="Notifications">
        {notices.length === 0 ? (
          <p className="text-muted text-[14px] py-6 text-center">No notifications yet.</p>
        ) : (
          notices.map((n) => (
            <div key={n.id} className="flex gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-ink shrink-0">
                <Bell className="size-4 text-gold" />
              </span>
              <div>
                <p className="text-[14px] font-bold">{n.title}</p>
                <p className="text-[13px] text-text-2">{n.body}</p>
                <p className="text-[11px] text-muted mt-0.5">{ago(new Date(n.at).getTime())}</p>
              </div>
            </div>
          ))
        )}
      </Modal>
    </div>
  )
}

export function PageHead({ title, sub, back, right }) {
  const nav = useNavigate()
  return (
    <div className="flex flex-wrap items-start gap-3 mb-5">
      {back ? (
        <button onClick={() => nav(back === true ? -1 : back)} aria-label="Back" className="grid size-10 place-items-center rounded-xl border border-line bg-white">
          <ArrowLeft className="size-5" />
        </button>
      ) : null}
      <div className="flex-1 min-w-0">
        <h1 className="text-[22px] font-bold leading-tight">{title}</h1>
        {sub ? <p className="text-[13.5px] text-muted mt-0.5">{sub}</p> : null}
      </div>
      {right}
    </div>
  )
}

export function TrustNote() {
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-muted">
      <ShieldCheck className="size-4 text-green shrink-0" /> Every advocate's Bar Council documents are checked by our team. Payments are released only after the client confirms.
    </p>
  )
}
