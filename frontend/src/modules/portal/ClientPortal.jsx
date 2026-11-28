import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Car, ChevronRight, Compass, FileText, Gift, Headset, House, MessageCircle, Plus, Receipt, ShieldCheck, Star, User, Wallet, X } from 'lucide-react'
import { Button, Card, Chip, EmptyState, Field, Note, PageLoader, Pill, REQ_STATUS, SectionTitle, Select, Timeline, Toggle, cx, useToast } from '@/components/ui'
import SecureImage from '@/components/SecureImage'
import { categoryOf, DISPUTE_REASONS, DISTRICTS, IMG, REQ_LANGS, STATES } from '@/lib/catalog'
import { errText, publicApi, refreshUser, uploadForm, userApi, userFileUrl, userSession } from '@/lib/api'
import { closeLive, useLive } from '@/lib/live'
import { useGatewayPay } from '@/lib/pay'
import { inr } from '@/lib/money'
import { ago, dateShort, phonePretty, useTitle } from '@/lib/format'
import { BillRow } from '@/components/ui'
import { PageHead, PortalShell, TrustNote } from './common'
import LiveChat from './LiveChat'
import { Challan, ChallanOrder, Explore, HelpDesk, NewTicket, Ticket } from './services'
import { GstFilingPage, GstFilingDetailPage, Invoices, OffersPage, ReferPage, openInvoice, useBanners } from './growth'

/**
 * Client area of the website. SAME FLOW AS THE APP (mobile-app/src/screens/client.tsx).
 * On the real API: login, profile, categories, new request → submitted → my requests →
 * request detail → chat. Still sample data until their phases: payment, e-Challan, GST
 * filing, wallet, refer and offers: all on the API.
 */

const NAV = [
  { to: '/app', end: true, label: 'Home', icon: House, mobile: true },
  { to: '/app/explore', label: 'Explore', icon: Compass, mobile: true },
  { to: '/app/requests', label: 'My requests', short: 'Requests', icon: FileText, mobile: true },
  { to: '/app/challan', label: 'e-Challan', icon: Car },
  { to: '/app/gst', label: 'GST filing', icon: Receipt },
  { to: '/app/wallet', label: 'Wallet', icon: Wallet, mobile: true },
  { to: '/app/refer', label: 'Refer and earn', icon: Gift },
  { to: '/app/help', label: 'Help desk', icon: Headset },
  { to: '/app/profile', label: 'Profile', icon: User, mobile: true },
]

/** Catalog look (image, colours) + the admin's live name/description for a category. */
const catOf = (meta, key) => ({ ...categoryOf(key), ...meta?.categories.find((c) => c.key === key) })

export default function ClientPortal() {
  const loc = useLocation()
  const [acct, setAcct] = useState(undefined) // undefined: checking · null: signed out
  const [meta, setMeta] = useState(null)
  useTitle('My account')

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([userApi('/client/profile'), publicApi('/meta')])
      setMeta(m.data)
      setAcct(p.data)
    } catch (e) {
      if (e.code === 'ACCOUNT_BLOCKED') setAcct({ blocked: true })
      else if (e.status === 401 || e.status === 403) setAcct(null)
      else setAcct({ error: errText(e) })
    }
  }, [])

  useEffect(() => {
    userSession.onSignedOut(() => setAcct(null))
    refreshUser()
      .then((d) => (d.user?.role === 'client' ? load() : setAcct(null)))
      .catch((e) => setAcct(e.code === 'ACCOUNT_BLOCKED' ? { blocked: true } : null))
  }, [load])


  const logout = async () => {
    try {
      await userApi('/auth/logout', { method: 'POST' })
    } catch {
      /* already gone */
    }
    userSession.clear()
    closeLive('user')
    setAcct(null)
  }

  if (acct === null) return <Navigate to={'/login?role=client&next=' + encodeURIComponent(loc.pathname + loc.search)} replace />
  if (acct?.blocked) return <Blocked onLogout={logout} />
  if (acct?.error)
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="p-6 max-w-sm flex flex-col gap-3">
          <p className="font-bold">Could not load your account</p>
          <p className="text-[14px] text-muted">{acct.error}</p>
          <Button variant="line" onClick={load}>
            Try again
          </Button>
        </Card>
      </div>
    )
  if (acct === undefined || !meta) return <PageLoader />
  const me = { id: acct.user.id, name: acct.user.name, email: acct.user.email, city: acct.city, state: acct.state, phone: acct.user.phone }
  if (!acct.complete) return <Setup acct={acct} onSaved={setAcct} />
  const title = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label ?? 'My account'
  return (
    <PortalShell nav={NAV} user={me} userId={me.id} title={title} roleLabel="Client" onLogout={logout}>
      <Routes>
        <Route index element={<Home me={me} meta={meta} />} />
        <Route path="new" element={<NewRequest me={me} meta={meta} />} />
        <Route path="submitted/:id" element={<RequestSubmitted />} />
        <Route path="requests" element={<Requests meta={meta} />} />
        <Route path="requests/:id" element={<RequestDetail meta={meta} />} />
        <Route path="requests/:id/checkout" element={<Checkout meta={meta} />} />
        <Route path="requests/:id/paid" element={<PaymentDone />} />
        <Route path="requests/:id/confirm" element={<ConfirmPage />} />
        <Route path="requests/:id/dispute" element={<DisputePage />} />
        <Route path="explore" element={<Explore meta={meta} />} />
        <Route path="challan" element={<Challan meta={meta} />} />
        <Route path="challan/orders/:id" element={<ChallanOrder />} />
        <Route path="help" element={<HelpDesk base="/app/help" wa={meta.supportWhatsApp} />} />
        <Route path="help/new" element={<NewTicket base="/app/help" role="client" />} />
        <Route path="help/:id" element={<Ticket base="/app/help" />} />
        <Route path="gst" element={<GstFilingPage meta={meta} />} />
        <Route path="gst/:id" element={<GstFilingDetailPage />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="wallet" element={<ClientWallet />} />
        <Route path="refer" element={<ReferPage />} />
        <Route path="offers" element={<OffersPage />} />
        <Route path="profile" element={<Profile me={me} onSaved={setAcct} onLogout={logout} />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </PortalShell>
  )
}

function Blocked({ onLogout }) {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <Card className="p-6 max-w-sm text-center flex flex-col gap-3">
        <p className="text-[18px] font-bold">Your account is on hold</p>
        <p className="text-muted text-[14px]">Please contact Vakeel Bhai support.</p>
        <Button variant="line" onClick={onLogout}>
          Log out
        </Button>
      </Card>
    </div>
  )
}

/** The app's ClientSetup: name, email, city/state (referral code arrives with Refer and earn). */
function Setup({ acct, onSaved }) {
  const [f, setF] = useState({ name: acct.user.name || '', email: acct.user.email || '', city: acct.city || 'Indore', state: acct.state || 'Madhya Pradesh' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onSaved((await userApi('/client/profile', { method: 'PATCH', body: { ...f, name: f.name.trim(), email: f.email.trim() } })).data)
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="min-h-screen bg-page">
      <div className="bg-ink px-5 py-10">
        <div className="max-w-lg mx-auto">
          <p className="font-serif font-bold text-[28px] text-white">A few details</p>
          <p className="text-on-ink-muted mt-1">So the right advocate can help you. Takes 30 seconds.</p>
        </div>
      </div>
      <form className="max-w-lg mx-auto p-5 flex flex-col gap-4" onSubmit={save}>
        <Field label="Your name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} />
        <Field label="Email (for invoices)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={120} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="City / district" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} options={DISTRICTS} />
          <Select label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} options={STATES} />
        </div>
        {error ? <Note tone="orange">{error}</Note> : null}
        <Button type="submit" size="lg" loading={busy} disabled={f.name.trim().length < 2}>
          Continue
        </Button>
      </form>
    </div>
  )
}

/** My requests from the API, refreshed live. */
function useMyRequests(tab) {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setList((await userApi('/client/requests?tab=' + tab)).data)
      setError('')
    } catch (e) {
      setError(errText(e))
    }
  }, [tab])
  useEffect(() => {
    load()
  }, [load])
  useLive('user', { 'request:update': load, reconnect: load })
  return { list, error, reload: load }
}

/* ---------------- home ---------------- */

function Home({ me, meta }) {
  const nav = useNavigate()
  const { list } = useMyRequests('active')
  const banners = useBanners()
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % Math.max(1, banners.length)), 5000)
    return () => clearInterval(t)
  }, [banners.length])
  const b = banners[i % Math.max(1, banners.length)]
  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="text-[22px] font-bold">Namaste, {me.name.split(' ')[0]}</p>
        <p className="text-muted text-[14px]">{[me.city, me.state].filter(Boolean).join(', ')}</p>
      </div>
      {b ? (
        <button onClick={() => b.to && nav(b.to)} className="relative h-[190px] rounded-2xl overflow-hidden bg-ink text-left">
          {b.img ? <img src={b.img} alt="" className="absolute right-0 top-0 h-full w-[60%] object-cover" /> : null}
          <div className="absolute inset-0 bg-gradient-to-r from-ink from-45% via-ink/70 via-60% to-transparent" />
          <div className="relative p-6 flex flex-col gap-2.5 max-w-[60%]">
            <span className="self-start rounded-md bg-gold px-2 py-0.5 text-[11px] font-bold text-ink">{b.tag || 'Vakeel Bhai'}</span>
            <p className="font-serif font-bold text-[24px] leading-tight text-white">{b.title}</p>
            <p className="text-[13px] text-on-ink">{b.sub}</p>
          </div>
          <div className="absolute bottom-3 left-6 flex gap-1.5">
            {banners.map((x, k) => (
              <span key={x.id} className={cx('h-1.5 rounded-full', k === i % banners.length ? 'w-5 bg-gold' : 'w-1.5 bg-white/40')} />
            ))}
          </div>
        </button>
      ) : null}

      <section className="flex flex-col gap-3.5">
        <SectionTitle title="Legal services" />
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-x-2.5 gap-y-4">
          {meta.categories.map((mc) => {
            const c = catOf(meta, mc.key)
            return (
              <Link key={c.key} to={'/app/new?category=' + c.key} className="flex flex-col gap-1.5 text-center">
                <img src={c.image} alt="" className="aspect-square w-full rounded-[14px] object-cover" />
                <span className="text-[12px] font-semibold leading-tight">{c.short}</span>
              </Link>
            )
          })}
          <Link to="/app/challan" className="flex flex-col gap-1.5 text-center">
            <span className="relative">
              <img src={IMG.catChallan} alt="" className="aspect-square w-full rounded-[14px] object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded bg-gold px-1 text-[9.5px] font-bold">Pay</span>
            </span>
            <span className="text-[12px] font-semibold leading-tight">e-Challan</span>
          </Link>
        </div>
      </section>

      {list?.length ? (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Your active requests" action="See all" onAction={() => nav('/app/requests')} />
          {list.slice(0, 3).map((r) => (
            <RequestRow key={r.id} r={r} meta={meta} />
          ))}
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/app/challan" className="md:col-span-1 relative h-[130px] rounded-2xl overflow-hidden bg-ink text-white p-5 flex flex-col justify-center gap-1.5">
          <img src={IMG.bannerTraffic} alt="" className="absolute right-0 top-0 h-full w-[55%] object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink from-45% to-transparent" />
          <span className="relative font-bold text-[16px]">Check and pay e-Challan</span>
          <span className="relative text-[12px] text-on-ink">Add your vehicle. We pay the department for you.</span>
          <span className="relative text-[12px] font-bold text-gold">Pay now ›</span>
        </Link>
        <MiniCard to="/app/gst" icon={Receipt} title="GST filing" sub="Returns filed by our team, tracked here" />
        <MiniCard to="/app/refer" icon={Gift} title="Refer and earn" sub="Earn wallet cash when a friend's first case is paid" />
      </div>
      <TrustNote />
    </div>
  )
}

function MiniCard({ to, icon: Icon, title, sub }) {
  return (
    <Link to={to} className="card p-4 flex flex-col gap-2 hover:border-line-strong">
      <span className="grid size-10 place-items-center rounded-[10px] bg-gold-tint">
        <Icon className="size-5 text-gold-text" />
      </span>
      <span className="font-bold text-[14px]">{title}</span>
      <span className="text-[12.5px] text-muted">{sub}</span>
    </Link>
  )
}

/** The app's request card: category, number, time, status, issue, and the advocate once accepted. */
function RequestRow({ r, meta }) {
  const c = catOf(meta, r.category)
  const st = REQ_STATUS[r.status]
  return (
    <Link to={'/app/requests/' + r.id} className="card p-4 flex flex-col gap-2.5 hover:border-line-strong">
      <span className="flex items-center gap-3">
        <img src={c.image} alt="" className="size-[46px] rounded-[10px] object-cover" />
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-[14.5px]">{c.name}</span>
          <span className="block text-[12px] font-medium text-muted">
            {r.id} · {ago(new Date(r.createdAt).getTime())}
          </span>
        </span>
        <Pill tone={st.tone}>{st.label}</Pill>
        <ChevronRight className="size-4 text-muted hidden sm:block" />
      </span>
      <span className="text-[13px] text-text-2 line-clamp-2">{r.issue}</span>
      {r.advocate ? (
        <span className="flex items-center gap-2 text-[12.5px] font-semibold text-text-2">
          {r.advocate.hasPhoto ? <SecureImage load={userFileUrl} path={'/client/requests/' + r.id + '/advocate/photo'} alt="" className="size-6 rounded-full object-cover" /> : null}
          {r.advocate.name}
        </span>
      ) : null}
    </Link>
  )
}

/* ---------------- new request (app: RequestNew) ---------------- */

function NewRequest({ me, meta }) {
  const nav = useNavigate()
  const toast = useToast()
  const [q] = useSearchParams()
  const first = meta.categories.some((c) => c.key === q.get('category')) ? q.get('category') : meta.categories.find((c) => c.key === 'other')?.key ?? meta.categories[0]?.key
  const [cat, setCat] = useState(first)
  const [pickCat, setPickCat] = useState(false)
  const [issue, setIssue] = useState('')
  const [district, setDistrict] = useState(q.get('district') || me.city || 'Indore')
  const [lang, setLang] = useState('Hindi')
  const [docs, setDocs] = useState([]) // { file, url }
  const [busy, setBusy] = useState(false)
  const c = catOf(meta, cat)
  const ok = issue.trim().length >= 15
  useEffect(() => () => docs.forEach((d) => URL.revokeObjectURL(d.url)), [docs])

  const addDoc = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 5 * 1024 * 1024) return toast('Choose a JPG, PNG or WebP photo up to 5 MB', 'red')
    if (docs.length >= 5) return toast('You can add up to 5 documents', 'red')
    setDocs([...docs, { file: f, url: URL.createObjectURL(f) }])
  }

  const submit = async () => {
    setBusy(true)
    try {
      const r = (await userApi('/client/requests', { method: 'POST', body: { category: cat, issue: issue.trim(), district, language: lang } })).data
      for (const d of docs) {
        try {
          await userApi('/client/requests/' + r.id + '/attachments', { method: 'POST', body: uploadForm(d.file) })
        } catch (e) {
          toast('A document could not be uploaded: ' + errText(e), 'red')
        }
      }
      nav('/app/submitted/' + r.id, { replace: true })
    } catch (e) {
      toast(errText(e), 'red')
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5">
        <PageHead title="Request an advocate" back />
        <div className="flex items-center gap-4 rounded-2xl p-3" style={{ background: c.tone.bg }}>
          <img src={c.image} alt="" className="size-[52px] rounded-xl object-cover" />
          <div className="flex-1">
            <p className="font-bold text-[16px]" style={{ color: c.tone.fg }}>
              {c.name}
            </p>
            <p className="text-[12.5px]" style={{ color: c.tone.fg }}>
              {c.covers}
            </p>
          </div>
          <button onClick={() => setPickCat(!pickCat)} className="text-[13px] font-semibold px-2" style={{ color: c.tone.fg }}>
            {pickCat ? 'Done' : 'Change'}
          </button>
        </div>
        {pickCat ? (
          <div className="flex flex-wrap gap-2">
            {meta.categories.map((k) => (
              <Chip key={k.key} active={k.key === cat} onClick={() => (setCat(k.key), setPickCat(false))}>
                {k.short}
              </Chip>
            ))}
          </div>
        ) : null}
        <Field label="Tell us what happened" as="textarea" maxLength={1000} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Describe your problem in your own words. Mention dates, places and what you want to achieve." hint={issue.length + ' / 1000'} />
        <Select label="District" value={district} onChange={(e) => setDistrict(e.target.value)} options={DISTRICTS.includes(district) ? DISTRICTS : [district, ...DISTRICTS]} />
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-text-2">Preferred language</span>
          <div className="flex flex-wrap gap-2">
            {REQ_LANGS.slice(0, 5).map((l) => (
              <Chip key={l} active={lang === l} onClick={() => setLang(l)}>
                {l}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-text-2">Documents (optional)</span>
          <div className="flex flex-wrap gap-2.5">
            {docs.map((d, i) => (
              <span key={d.url} className="relative">
                <img src={d.url} alt="" className="size-[76px] rounded-xl object-cover bg-surface-2" />
                <button type="button" aria-label="Remove" onClick={() => setDocs(docs.filter((_, k) => k !== i))} className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-ink text-white">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            {docs.length < 5 ? (
              <label className="grid size-[76px] place-items-center rounded-xl border-[1.5px] border-dashed border-[#B8B0A0] cursor-pointer" aria-label="Add document">
                <Plus className="size-[22px] text-muted" />
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={addDoc} />
              </label>
            ) : null}
          </div>
        </div>
        <Button size="lg" disabled={!ok} loading={busy} onClick={submit}>
          Submit request
        </Button>
        {!ok ? <p className="text-[12px] text-muted -mt-2 text-center">Write at least a sentence about your problem</p> : null}
      </div>
      <Card className="p-5 flex flex-col gap-3 h-fit">
        <p className="font-bold text-[14px]">What happens next</p>
        {['Our team reviews your request and assigns a verified advocate in your district.', 'The advocate chats with you here and sends a fee quote. Your number stays private.', 'You pay in the app. We release it to the advocate only after you confirm the work is done.'].map((t, i) => (
          <div key={t} className="flex gap-3">
            <span className="grid size-6 place-items-center rounded-full bg-ink text-gold text-[12px] font-bold shrink-0">{i + 1}</span>
            <p className="text-[13px] text-text-2">{t}</p>
          </div>
        ))}
      </Card>
    </div>
  )
}

/** The app's RequestSubmitted screen. */
function RequestSubmitted() {
  const { id } = useParams()
  const nav = useNavigate()
  return (
    <div className="rounded-2xl bg-ink p-8 sm:p-12 flex flex-col gap-5 max-w-xl">
      <span className="grid size-[72px] place-items-center rounded-full bg-gold">
        <FileText className="size-[34px] text-ink" />
      </span>
      <h1 className="font-serif font-bold text-[28px] text-white">Request submitted</h1>
      <p className="text-[15px] leading-relaxed text-on-ink">Request {id} is with our team. We will assign a verified advocate and notify you. You can chat with them here.</p>
      <div className="flex flex-col gap-2.5 mt-2">
        <Button size="lg" onClick={() => nav('/app/requests/' + id, { replace: true })}>
          Track my request
        </Button>
        <Button size="lg" variant="line" onClick={() => nav('/app', { replace: true })}>
          Back to home
        </Button>
      </div>
    </div>
  )
}

/* ---------------- requests (app: Requests) ---------------- */

function Requests({ meta }) {
  const nav = useNavigate()
  const [tab, setTab] = useState('active')
  const { list, error, reload } = useMyRequests(tab)
  return (
    <div className="flex flex-col gap-4">
      <PageHead
        title="My requests"
        right={
          <Button icon={Plus} size="sm" onClick={() => nav('/app/new')}>
            New request
          </Button>
        }
      />
      <div className="flex border-b border-line">
        {[
          ['active', 'Active'],
          ['completed', 'Completed'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('flex-1 h-[46px] text-[14px] font-semibold border-b-[3px]', tab === k ? 'border-gold text-ink' : 'border-transparent text-muted')}>
            {l}
          </button>
        ))}
      </div>
      {error ? (
        <Card className="p-5 flex items-center justify-between gap-3">
          <span className="text-[14px] text-muted">{error}</span>
          <Button size="sm" variant="line" onClick={reload}>
            Try again
          </Button>
        </Card>
      ) : list === null ? (
        <PageLoader />
      ) : list.length ? (
        list.map((r) => <RequestRow key={r.id} r={r} meta={meta} />)
      ) : (
        <EmptyState icon={FileText} title={tab === 'active' ? 'No active requests' : 'Nothing completed yet'} sub="Pick a legal service and describe your problem. A verified advocate will contact you here." action="Request an advocate" onAction={() => nav('/app/new')} />
      )}
    </div>
  )
}

/* ---------------- request detail (app: RequestDetail + Chat) ---------------- */

/** One request from the API, refreshed live. */
function useClientRequest(id) {
  const [r, setR] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setR((await userApi('/client/requests/' + id)).data)
      setError('')
    } catch (e) {
      setError(e.status === 404 ? 'notfound' : errText(e))
    }
  }, [id])
  useEffect(() => {
    load()
  }, [load])
  useLive('user', { 'request:update': (p) => p.number === id && load(), reconnect: load })
  return { r, error, load }
}

function LoadFail({ error, onRetry }) {
  return (
    <Card className="p-6 flex flex-col items-start gap-3">
      <p className="font-bold">Could not load this request</p>
      <p className="text-[14px] text-muted">{error}</p>
      <Button size="sm" variant="line" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  )
}

function RequestDetail({ meta }) {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { r, error, load } = useClientRequest(id)

  if (error === 'notfound') return <Navigate to="/app/requests" replace />
  if (error) return <LoadFail error={error} onRetry={load} />
  if (!r) return <PageLoader />

  const c = catOf(meta, r.category)
  const adv = r.advocate
  const st = REQ_STATUS[r.status] ?? { label: r.status, tone: 'neutral' }
  const order = ['submitted', 'assigned', 'quoted', 'paid', 'done', 'completed']
  const at = r.status === 'disputed' || r.status === 'refunded' ? 4 : order.indexOf(r.status)
  const step = (i) => (i < at || r.status === 'completed' ? 'done' : i === at ? 'now' : 'todo')
  const advPhoto = (cls) => (adv?.hasPhoto ? <SecureImage load={userFileUrl} path={'/client/requests/' + r.id + '/advocate/photo'} alt="" className={cls} /> : <span className={cx(cls, 'bg-surface-2')} />)
  const toCheckout = () => nav('/app/requests/' + r.id + '/checkout')

  return (
    <div className="flex flex-col gap-4">
      <PageHead title={c.name} sub={r.id} back="/app/requests" right={<Pill tone={st.tone}>{st.label}</Pill>} />
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="flex flex-col gap-4">
          {adv ? (
            <Card className="p-4 flex items-center gap-3">
              {advPhoto('size-12 rounded-full object-cover')}
              <div className="flex-1 min-w-0">
                <p className="font-bold">
                  {adv.name} {adv.verified ? <ShieldCheck className="inline size-4 text-green" aria-label="Verified" /> : null}
                </p>
                <p className="text-[12.5px] text-muted">{[adv.years != null ? adv.years + ' yrs' : null, adv.court].filter(Boolean).join(' · ')}</p>
                <p className="text-[12px] text-muted">{adv.practice.map((k) => catOf(meta, k).short).join(', ')}</p>
              </div>
            </Card>
          ) : (
            <Note tone="neutral" icon={ShieldCheck}>
              Our team is choosing a verified advocate for you. You will get a notification.
            </Note>
          )}

          {r.status === 'quoted' && r.quote ? (
            <Card className="p-4 border-[1.5px] border-ink flex flex-col gap-2.5">
              <div className="flex justify-between">
                <span className="text-[13px] font-bold text-gold-text">Fee quote</span>
                <span className="text-[12px] text-muted">Valid till {dateShort(new Date(r.quote.validTill).getTime())}</span>
              </div>
              <p className="text-[26px] font-extrabold">{inr(r.quote.fee)}</p>
              <p className="text-[13px] text-text-2">{r.quote.scope}</p>
              <Button onClick={toCheckout}>Accept and pay</Button>
            </Card>
          ) : null}

          {r.status === 'done' ? (
            <Card className="p-4 border-orange flex flex-col gap-2.5">
              <p className="font-bold text-[15px]">Is the work done?</p>
              <p className="text-[13px] text-text-2">
                Confirm to release the payment to your advocate. If you do nothing, it confirms automatically{r.autoConfirmAt ? ' on ' + dateShort(new Date(r.autoConfirmAt).getTime()) : ''}.
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => nav('/app/requests/' + r.id + '/confirm')}>
                  Confirm
                </Button>
                <Button variant="danger" onClick={() => nav('/app/requests/' + r.id + '/dispute')}>
                  Raise a dispute
                </Button>
              </div>
            </Card>
          ) : null}
          {r.status === 'paid' ? (
            <button onClick={() => nav('/app/requests/' + r.id + '/dispute')} className="self-start text-[13px] font-semibold text-red">
              Problem with the work? Raise a dispute
            </button>
          ) : null}
          {r.status === 'disputed' ? <Note tone="orange">Dispute raised: {r.dispute?.reason}. The payment is on hold while our team reviews it.</Note> : null}
          {r.status === 'refunded' ? (
            <Note tone="neutral">
              Refunded{r.dispute?.note ? ': ' + r.dispute.note : ''}. {r.paid?.refund === 'processed' ? 'The money is on its way back to you.' : 'Our team is processing it.'}
            </Note>
          ) : null}

          <Card className="p-4">
            <Timeline
              steps={[
                { title: 'Request submitted', sub: dateShort(new Date(r.createdAt).getTime()), state: step(0) },
                { title: 'Advocate assigned', sub: adv?.name, state: step(1) },
                { title: 'Fee quote', sub: r.quote ? inr(r.quote.fee) : undefined, state: step(2) },
                { title: 'Paid', sub: r.paid ? inr(r.paid.total) + ' · held safely' : undefined, state: step(3) },
                { title: r.status === 'disputed' ? 'Disputed' : r.status === 'refunded' ? 'Refunded' : 'Work done', sub: r.status === 'disputed' ? 'Our team is reviewing' : undefined, state: step(4) },
                { title: 'Confirmed', state: step(5) },
              ]}
            />
          </Card>

          <Card className="p-4 flex flex-col gap-2">
            <p className="font-bold text-[14px]">Your request</p>
            <p className="text-[13.5px] text-text-2 leading-relaxed">{r.issue}</p>
            <p className="text-[12px] text-muted">
              {r.district} · {r.lang}
              {r.docs.length ? ' · ' + r.docs.length + ' documents' : ''}
            </p>
            {r.docs.length ? (
              <div className="flex flex-wrap gap-2 mt-1">
                {r.docs.map((d) => (
                  <SecureImage key={d.id} load={userFileUrl} path={'/client/requests/' + r.id + '/attachments/' + d.id} alt="Document" className="size-16 rounded-lg object-cover" />
                ))}
              </div>
            ) : null}
          </Card>

          {r.paid ? (
            <Card className="p-4 flex flex-col gap-2">
              <p className="font-bold text-[14px]">Payment</p>
              <BillRow label="Advocate's fee" value={inr(r.paid.fee)} />
              {r.paid.discount ? <BillRow label="Offer" value={'−' + inr(r.paid.discount)} tone="green" /> : null}
              <BillRow label="GST" value={inr(r.paid.gst)} />
              {r.paid.wallet ? <BillRow label="Wallet" value={'−' + inr(r.paid.wallet)} tone="green" /> : null}
              <span className="h-px bg-line" />
              <BillRow label="Paid" value={inr(r.paid.total)} strong />
              <p className="text-[12px] text-muted">
                {r.paid.id} · {dateShort(new Date(r.paid.at).getTime())}
              </p>
              <button onClick={() => openInvoice(r.paid.id).catch((e) => toast(errText(e), 'red'))} className="self-start text-[13px] font-semibold text-gold-text">
                Download GST invoice ›
              </button>
            </Card>
          ) : null}

          {r.rating ? (
            <Card className="p-4 flex items-center gap-2">
              <span className="text-[14px] font-semibold">Your rating</span>
              <span className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((k) => (
                  <Star key={k} className={cx('size-4 text-gold', k <= r.rating && 'fill-gold')} />
                ))}
              </span>
            </Card>
          ) : null}
        </div>

        {adv ? (
          <LiveChat
            number={r.id}
            side="client"
            status={r.status}
            closed={['completed', 'refunded'].includes(r.status)}
            onPay={toCheckout}
            headerSlot={
              <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
                {advPhoto('size-9 rounded-full object-cover')}
                <div>
                  <p className="font-bold text-[14px]">{adv.name}</p>
                  <p className="text-[12px] text-muted">{adv.years != null ? adv.years + ' yrs · ' : ''}Verified advocate</p>
                </div>
                <MessageCircle className="size-5 text-muted ml-auto" />
              </div>
            }
          />
        ) : (
          <Card className="p-8 grid place-items-center text-center">
            <div className="flex flex-col items-center gap-3 max-w-sm">
              <img src={c.image} alt="" className="size-20 rounded-2xl object-cover" />
              <p className="font-bold text-[17px]">Chat opens when an advocate accepts</p>
              <p className="text-[13.5px] text-muted">You can talk privately here and share documents. Your phone number is never shared.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

/* ---------------- checkout (app: Checkout) ---------------- */

function Checkout({ meta }) {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { r, error, load } = useClientRequest(id)
  const [useWallet, setUseWallet] = useState(true)
  const [bill, setBill] = useState(null)
  const [billError, setBillError] = useState('')
  const [paying, setPaying] = useState(false)
  const [typed, setTyped] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const { pay, dialog } = useGatewayPay()

  useEffect(() => {
    let live = true
    userApi('/client/requests/' + id + '/checkout?useWallet=' + (useWallet ? 1 : 0) + (code ? '&code=' + encodeURIComponent(code) : ''))
      .then((j) => live && (setBill(j.data), setBillError(''), setCodeError('')))
      .catch((e) => {
        if (!live) return
        // A bad coupon: say why, and go back to the bill without it.
        if (code) {
          setCodeError(errText(e))
          setCode('')
        } else setBillError(errText(e))
      })
    return () => {
      live = false
    }
  }, [id, useWallet, code])

  if (error === 'notfound') return <Navigate to="/app/requests" replace />
  if (error) return <LoadFail error={error} onRetry={load} />
  if (!r) return <PageLoader />
  if (r.status !== 'quoted') return <Navigate to={'/app/requests/' + id} replace />
  const c = catOf(meta, r.category)

  const go = async () => {
    setPaying(true)
    try {
      const co = (await userApi('/client/requests/' + id + '/checkout', { method: 'POST', body: { useWallet: useWallet && bill.walletBalance > 0, ...(code ? { code } : {}) } })).data
      const paid = await pay(co, { description: c.name + ' · ' + id })
      nav('/app/requests/' + id + '/paid?total=' + (paid.total + paid.wallet), { replace: true })
    } catch (e) {
      if (e.code !== 'CANCELLED') toast(errText(e), 'red')
      setPaying(false)
    }
  }

  return (
    <div className="flex flex-col gap-3.5 max-w-xl">
      <PageHead title="Checkout" back />
      <Card className="p-4 flex items-center gap-3">
        {r.advocate?.hasPhoto ? <SecureImage load={userFileUrl} path={'/client/requests/' + id + '/advocate/photo'} alt="" className="size-12 rounded-xl object-cover" /> : null}
        <div>
          <p className="font-bold text-[14px]">{c.name}</p>
          <p className="text-[12px] font-medium text-muted">
            {r.advocate?.name} · Request {id}
          </p>
        </div>
      </Card>
      <Card className="p-4 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-[10px] bg-ink">
          <Wallet className="size-5 text-gold" />
        </span>
        <div className="flex-1">
          <p className="font-bold text-[14px]">Use wallet balance</p>
          <p className="text-[12px] font-medium text-muted">{bill ? inr(bill.walletBalance) + ' available' : '…'}</p>
        </div>
        <Toggle checked={useWallet && (bill?.walletBalance ?? 0) > 0} onChange={(v) => (bill?.walletBalance ?? 0) > 0 && setUseWallet(v)} label="Use wallet" />
      </Card>
      <Card className="p-4 flex flex-col gap-2">
        <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), setCode(typed.trim().toUpperCase()))}>
          <input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={20} placeholder="Coupon code" aria-label="Coupon code" className="flex-1 h-11 rounded-xl border border-line-strong px-3 text-[14px] font-semibold tracking-wide outline-none focus:border-ink" />
          {code ? (
            <Button type="button" variant="line" onClick={() => (setCode(''), setTyped(''))}>Remove</Button>
          ) : (
            <Button type="submit" variant="line" disabled={typed.length < 3}>Apply</Button>
          )}
        </form>
        {codeError ? <p className="text-[12.5px] text-red">{codeError}</p> : null}
        {bill?.offer ? (
          <p className="text-[12.5px] font-semibold text-green">
            {bill.offer.code ? bill.offer.code + ' · ' : 'Applied automatically · '}
            {bill.offer.title}
            {bill.offer.cashback ? ' · ' + inr(bill.offer.cashback) + ' cashback to your wallet after you confirm the work' : ''}
          </p>
        ) : (
          <Link to="/app/offers" className="text-[12.5px] font-semibold text-gold-text self-start">See offers ›</Link>
        )}
      </Card>
      {billError ? <Note tone="orange">{billError}</Note> : null}
      {bill ? (
        <Card className="p-4 flex flex-col gap-2.5">
          <p className="font-bold text-[15px]">Bill details</p>
          <BillRow label="Advocate's fee" value={inr(bill.fee)} />
          {bill.discount ? <BillRow label={'Offer' + (bill.offer?.code ? ' ' + bill.offer.code : '')} value={'−' + inr(bill.discount)} tone="green" /> : null}
          <BillRow label={bill.gstOnService ? 'GST ' + bill.gstPercent + '% on ' + inr(bill.base) : 'GST (not charged on this service)'} value={inr(bill.gst)} />
          {bill.wallet ? <BillRow label="Wallet" value={'−' + inr(bill.wallet)} tone="green" /> : null}
          <span className="h-px bg-line" />
          <BillRow label="To pay" value={inr(bill.total)} strong />
        </Card>
      ) : null}
      <Note icon={ShieldCheck}>Vakeel Bhai holds this payment. It goes to your advocate only after you confirm the work is done.</Note>
      <div className="flex items-center gap-4 mt-1">
        <div>
          <p className="text-[19px] font-extrabold">{bill ? inr(bill.total) : '—'}</p>
          <p className="text-[11.5px] font-medium text-muted">UPI, cards, netbanking</p>
        </div>
        <Button size="lg" className="flex-1" loading={paying} disabled={!bill || !!billError} onClick={go}>
          {paying ? 'Processing…' : 'Pay securely'}
        </Button>
      </div>
      {dialog}
    </div>
  )
}

/** The app's PaymentDone screen. */
function PaymentDone() {
  const { id } = useParams()
  const [q] = useSearchParams()
  const nav = useNavigate()
  return (
    <div className="rounded-2xl bg-ink p-8 sm:p-12 flex flex-col gap-5 max-w-xl">
      <span className="grid size-[72px] place-items-center rounded-full bg-green">
        <ShieldCheck className="size-9 text-white" />
      </span>
      <h1 className="font-serif font-bold text-[28px] text-white">Payment successful</h1>
      {q.get('total') ? <p className="text-[32px] font-extrabold text-gold">{inr(Number(q.get('total')))}</p> : null}
      <p className="text-[15px] leading-relaxed text-on-ink">Your money is held safely. Your advocate starts the work now, and it is released only when you confirm.</p>
      <div className="flex flex-col gap-2.5 mt-2">
        <Button size="lg" onClick={() => nav('/app/requests/' + id, { replace: true })}>
          Back to my request
        </Button>
        <Button size="lg" variant="line" onClick={() => nav('/app', { replace: true })}>
          Go home
        </Button>
      </div>
    </div>
  )
}

/* ---------------- confirm & dispute (app: Confirm, Dispute) ---------------- */

function ConfirmPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { r, error } = useClientRequest(id)
  const [stars, setStars] = useState(5)
  const [review, setReview] = useState('')
  const [busy, setBusy] = useState(false)
  if (error) return <Navigate to={'/app/requests/' + id} replace />
  if (!r) return <PageLoader />
  if (r.status !== 'done') return <Navigate to={'/app/requests/' + id} replace />
  const confirm = async () => {
    setBusy(true)
    try {
      await userApi('/client/requests/' + id + '/confirm', { method: 'POST', body: { rating: stars, ...(review.trim() ? { review: review.trim() } : {}) } })
      toast('Thank you. The payment was released to your advocate.', 'green')
      nav('/app/requests/' + id, { replace: true })
    } catch (e) {
      toast(errText(e), 'red')
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <PageHead title="Confirm and rate" back />
      {r.advocate ? (
        <Card className="p-4 flex items-center gap-3">
          {r.advocate.hasPhoto ? <SecureImage load={userFileUrl} path={'/client/requests/' + id + '/advocate/photo'} alt="" className="size-11 rounded-full object-cover" /> : null}
          <p className="font-bold">
            {r.advocate.name} <ShieldCheck className="inline size-4 text-green" />
          </p>
        </Card>
      ) : null}
      <p className="text-[17px] font-bold text-center">How was your experience?</p>
      <div className="flex justify-center gap-2.5">
        {[1, 2, 3, 4, 5].map((k) => (
          <button key={k} onClick={() => setStars(k)} aria-label={k + ' stars'}>
            <Star className={cx('size-[38px] text-gold', k <= stars && 'fill-gold')} />
          </button>
        ))}
      </div>
      <Field label="Review (optional)" as="textarea" value={review} onChange={(e) => setReview(e.target.value)} maxLength={1000} placeholder="What went well? Your review helps other clients." />
      <Note icon={ShieldCheck}>Confirming releases the payment to the advocate. Do this only when the work you agreed on is done.</Note>
      <Button size="lg" loading={busy} onClick={confirm}>
        Confirm work is done
      </Button>
    </div>
  )
}

function DisputePage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [reason, setReason] = useState(DISPUTE_REASONS[0])
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      await userApi('/client/requests/' + id + '/dispute', { method: 'POST', body: { reason: reason + ': ' + detail.trim() } })
      toast('Dispute raised. Our team will reply in your chat.', 'green')
      nav('/app/requests/' + id, { replace: true })
    } catch (e) {
      toast(errText(e), 'red')
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <PageHead title="Raise a dispute" back />
      <Note tone="orange">The payment stays on hold while our team reviews. We reply in your request chat within 24 hours.</Note>
      <div className="flex flex-wrap gap-2">
        {DISPUTE_REASONS.map((x) => (
          <Chip key={x} active={reason === x} onClick={() => setReason(x)}>
            {x}
          </Chip>
        ))}
      </div>
      <Field label="Tell us more" as="textarea" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={900} placeholder="What happened?" />
      <Button size="lg" variant="ink" loading={busy} disabled={detail.trim().length < 10} onClick={submit}>
        Submit dispute
      </Button>
    </div>
  )
}

/* ---------------- wallet, refer, offers, profile ---------------- */

/** The app's ClientWallet, from the API. */
function ClientWallet() {
  const [w, setW] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setW((await userApi('/client/wallet')).data)
      setError('')
    } catch (e) {
      setError(errText(e))
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])
  useLive('user', { 'request:update': load, reconnect: load })
  if (error) return <LoadFail error={error} onRetry={load} />
  if (!w) return <PageLoader />
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <PageHead title="Wallet" />
      <div className="rounded-2xl bg-ink p-6 flex flex-col gap-3">
        <span className="text-[12px] text-on-ink-muted">Wallet balance</span>
        <span className="text-[32px] font-extrabold text-white">{inr(w.balance)}</span>
        <span className="text-[13px] text-on-ink">Use it at checkout. Referral rewards and cashback land here. Wallet money cannot be withdrawn.</span>
        <Link to="/app/refer" className="self-start h-10 px-4 inline-flex items-center gap-2 rounded-[10px] bg-gold font-bold text-[14px]">
          <Gift className="size-4" /> Refer and earn
        </Link>
      </div>
      <SectionTitle title="History" />
      {w.tx.length ? (
        w.tx.map((t) => (
          <Card key={t.id} className="p-4 flex items-center gap-3">
            <span className={cx('grid size-10 place-items-center rounded-[10px]', t.amount >= 0 ? 'bg-green-soft' : 'bg-surface-2')}>{t.amount >= 0 ? <Gift className="size-5 text-green" /> : <Receipt className="size-5" />}</span>
            <div className="flex-1">
              <p className="font-bold text-[14px]">{t.title}</p>
              <p className="text-[12px] text-muted">{(t.sub ? t.sub + ' · ' : '') + dateShort(new Date(t.at).getTime())}</p>
            </div>
            <span className={cx('font-extrabold', t.amount >= 0 && 'text-green')}>{(t.amount >= 0 ? '+' : '') + inr(t.amount)}</span>
          </Card>
        ))
      ) : (
        <EmptyState title="No transactions yet" />
      )}
    </div>
  )
}

function Profile({ me, onSaved, onLogout }) {
  const toast = useToast()
  const [f, setF] = useState({ name: me.name, email: me.email, city: me.city || 'Indore', state: me.state || 'Madhya Pradesh' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      onSaved((await userApi('/client/profile', { method: 'PATCH', body: { ...f, name: f.name.trim(), email: f.email.trim() } })).data)
      toast('Saved', 'green')
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <PageHead title="Profile" />
      <Card className="p-5 flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-full bg-surface-2">
          <User className="size-7 text-[#4A4740]" />
        </span>
        <div>
          <p className="font-bold text-[17px]">{me.name}</p>
          <p className="text-[13px] text-muted">+91 {phonePretty(me.phone)}</p>
        </div>
      </Card>
      <Card className="p-5 flex flex-col gap-4">
        <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} />
        <Field label="Email (for invoices)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={120} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="City / district" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} options={DISTRICTS.includes(f.city) ? DISTRICTS : [f.city, ...DISTRICTS]} />
          <Select label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} options={STATES.includes(f.state) ? STATES : [f.state, ...STATES]} />
        </div>
        <Button loading={busy} disabled={f.name.trim().length < 2} onClick={save}>
          Save
        </Button>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Link to="/app/offers" className="h-10 px-4 inline-flex items-center rounded-[10px] border border-line-strong bg-white font-semibold text-[14px]">
          Offers
        </Link>
        <Link to="/app/invoices" className="h-10 px-4 inline-flex items-center rounded-[10px] border border-line-strong bg-white font-semibold text-[14px]">
          My invoices
        </Link>
        <Link to="/help" className="h-10 px-4 inline-flex items-center rounded-[10px] border border-line-strong bg-white font-semibold text-[14px]">
          Help
        </Link>
        <Button variant="danger" onClick={onLogout}>
          Log out
        </Button>
      </div>
    </div>
  )
}
