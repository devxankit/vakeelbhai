/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, Lock, LogOut, Paperclip, Send, ShieldCheck } from 'lucide-react'
import { Avatar, Button, Field, Modal, Wordmark, cx } from '@/components/ui'
import { IMG } from '@/lib/catalog'
import { act, fileToDataUrl, useStore } from '@/lib/store'
import { inr } from '@/lib/money'
import { ago, dateShort, phonePretty, time } from '@/lib/format'

/* ---------------- login (mobile OTP only) ---------------- */

export function PortalLogin({ role }) {
  const { update } = useStore()
  const [step, setStep] = useState('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const ok = /^[6-9]\d{9}$/.test(phone)
  const isClient = role === 'client'
  const verify = (c = code) => {
    if (c.length !== 6) return
    update((s) => (isClient ? act.loginClient(s, phone) : act.loginAdvocate(s, phone)))
  }
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-page">
      <div className="hidden lg:flex flex-col justify-between bg-ink p-12 text-white">
        <Link to="/">
          <Wordmark className="h-9" />
        </Link>
        <div className="flex flex-col gap-5 max-w-md">
          <img src={IMG.emblem} alt="" className="w-28" />
          <p className="font-serif font-bold text-[34px] leading-tight">{isClient ? 'Legal help from a verified advocate.' : 'Grow your practice with verified client requests.'}</p>
          <p className="text-on-ink">{isClient ? 'Private chat, safe payments, released only when you confirm.' : 'Get verified once, receive requests in your district, and get paid to your wallet.'}</p>
        </div>
        <p className="text-[12px] text-on-ink-muted">Demo build · sample data</p>
      </div>
      <div className="flex flex-col">
        <div className="lg:hidden bg-ink px-5 py-5">
          <Link to="/">
            <Wordmark className="h-8" />
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <img src={isClient ? IMG.clientAnanya : IMG.advRohan} alt="" className="size-7 rounded-full object-cover" />
              <span className="text-[13px] font-semibold text-gold-text">{isClient ? 'Client' : 'Advocate'}</span>
              <Link to={isClient ? '/advocate' : '/app'} className="ml-auto text-[13px] font-semibold text-muted hover:text-text">
                {isClient ? 'I am an advocate' : 'I am a client'} →
              </Link>
            </div>
            {step === 'phone' ? (
              <>
                <div>
                  <h1 className="font-serif font-bold text-[30px]">Log in</h1>
                  <p className="text-muted text-[14px] mt-1">Use your mobile number. New here? The same step creates your account.</p>
                </div>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (ok) setStep('otp')
                  }}>
                  <Field label="Mobile number" prefix="+91" inputMode="tel" autoFocus maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile number" hint="We'll send a 6-digit code by SMS. No password needed." />
                  <Button type="submit" size="lg" disabled={!ok}>
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
                  hint="Demo build: any 6-digit code works"
                />
                <Button size="lg" disabled={code.length !== 6} onClick={() => verify()}>
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

export function PortalShell({ nav, user, userId, title, onLogout, children, roleLabel }) {
  const { s, update } = useStore()
  const [bell, setBell] = useState(false)
  const notices = s.notices[userId] ?? []
  const unread = notices.some((n) => !n.read)
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
              <button onClick={() => { setBell(true); update((x) => act.readNotices(x, userId)) }} aria-label="Notifications" className="relative grid size-10 place-items-center rounded-xl border border-line">
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
                <p className="text-[11px] text-muted mt-0.5">{ago(n.at)}</p>
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

/* ---------------- chat ---------------- */

export function ChatPanel({ reqId, me, closed, onPay, headerSlot }) {
  const { s, update } = useStore()
  const msgs = s.chats[reqId] ?? []
  const [text, setText] = useState('')
  const end = useRef(null)
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [msgs.length])
  const send = () => {
    if (!text.trim()) return
    update((x) => act.sendMessage(x, reqId, me, { text: text.trim() }))
    setText('')
  }
  return (
    <div className="card overflow-hidden flex flex-col h-[560px] max-h-[75vh]">
      {headerSlot}
      <div className="flex-1 overflow-y-auto thin-scroll bg-chat p-4 flex flex-col gap-2">
        <p className="self-center flex items-center gap-1.5 text-[12px] font-medium text-[#5F5B53] mb-1">
          <Lock className="size-3.5" /> Private chat. Phone numbers are never shared.
        </p>
        {msgs.map((m) => {
          if (m.from === 'system')
            return (
              <p key={m.id} className="self-center text-center max-w-[92%] rounded-full bg-[#E9E5DC] px-3 py-1.5 text-[12px] font-semibold text-[#5F5B53]">
                {m.text}
              </p>
            )
          const mine = m.from === me
          if (m.kind === 'quote')
            return (
              <div key={m.id} className={cx('w-[300px] max-w-full rounded-2xl border-[1.5px] border-ink bg-white overflow-hidden', mine ? 'self-end' : 'self-start')}>
                <div className="bg-ink px-4 py-2.5 flex justify-between">
                  <span className="text-[13px] font-bold text-gold">Fee quote</span>
                  <span className="text-[11px] text-on-ink-muted">Valid till {dateShort(m.quote.validTill)}</span>
                </div>
                <div className="p-4 flex flex-col gap-2.5">
                  <p className="text-[26px] font-extrabold">{inr(m.quote.fee)}</p>
                  <p className="text-[13px] leading-relaxed text-text-2">{m.quote.scope}</p>
                  {onPay ? (
                    <Button size="sm" onClick={onPay}>
                      Accept and pay
                    </Button>
                  ) : (
                    <p className="text-[12px] font-semibold text-muted border-t border-line pt-2.5">{me === 'advocate' ? 'Sent to the client' : 'GST and offers shown at checkout'}</p>
                  )}
                </div>
              </div>
            )
          return (
            <div key={m.id} className={cx('max-w-[80%]', mine ? 'self-end' : 'self-start')}>
              <div className={cx('px-3 py-2 text-[14px] leading-relaxed', mine ? 'bg-ink text-white rounded-2xl rounded-tr-md' : 'bg-white border border-line rounded-2xl rounded-tl-md')}>
                {m.src ? <img src={m.src} alt="Shared document" className="max-w-[220px] rounded-lg mb-1" /> : null}
                {m.text}
              </div>
              <p className={cx('text-[10.5px] text-[#8A857A] mt-0.5', mine && 'text-right')}>{time(m.at)}</p>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      {closed ? (
        <p className="border-t border-line p-4 text-center text-[13px] text-muted">This case is closed. Contact support if you need help.</p>
      ) : (
        <form
          className="border-t border-line p-3 flex items-end gap-2 bg-white"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}>
          <label className="grid size-11 place-items-center rounded-xl bg-chat cursor-pointer shrink-0" aria-label="Attach a photo">
            <Paperclip className="size-5" />
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const src = await fileToDataUrl(f, 800)
                update((x) => act.sendMessage(x, reqId, me, { kind: 'image', src, text: '' }))
                e.target.value = ''
              }}
            />
          </label>
          <textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Type a message"
            aria-label="Message"
            className="flex-1 min-h-11 max-h-32 resize-none rounded-[22px] border border-line-strong px-4 py-2.5 text-[14px] outline-none focus:border-ink"
          />
          <button type="submit" disabled={!text.trim()} aria-label="Send" className="grid size-11 place-items-center rounded-full bg-ink text-gold disabled:bg-surface-2 disabled:text-faint shrink-0">
            <Send className="size-5" />
          </button>
        </form>
      )}
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
