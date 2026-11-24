import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Car, ChevronRight, CircleCheck, Copy, FileText, Gift, House, Plus, Receipt, ShieldCheck, Star, Tag, User, Wallet, X } from 'lucide-react'
import { Avatar, BillRow, Button, Card, CategoryTag, CheckBox, Chip, EmptyState, Field, Modal, Note, Pill, REQ_STATUS, SectionTitle, Select, Timeline, Toggle, cx, useToast } from '@/components/ui'
import { CATEGORIES, categoryOf, CHALLANS, DISPUTE_REASONS, DISTRICTS, GST_RETURNS, IMG, REQ_LANGS, STATES } from '@/lib/catalog'
import { act, advById, fileToDataUrl, ratesFor, useStore } from '@/lib/store'
import { clientBill, inr, offerDiscount } from '@/lib/money'
import { ago, dateShort, phonePretty, useTitle } from '@/lib/format'
import { ChatPanel, PageHead, PortalLogin, PortalShell, TrustNote } from './common'

const NAV = [
  { to: '/app', end: true, label: 'Home', icon: House, mobile: true },
  { to: '/app/requests', label: 'My requests', short: 'Requests', icon: FileText, mobile: true },
  { to: '/app/challan', label: 'e-Challan', icon: Car },
  { to: '/app/gst', label: 'GST filing', icon: Receipt },
  { to: '/app/wallet', label: 'Wallet', icon: Wallet, mobile: true },
  { to: '/app/refer', label: 'Refer and earn', icon: Gift },
  { to: '/app/profile', label: 'Profile', icon: User, mobile: true },
]

export default function ClientPortal() {
  const { s, update } = useStore()
  const loc = useLocation()
  const me = s.clients.find((c) => c.id === s.session.client)
  useTitle('My account')
  if (!me) return <PortalLogin role="client" />
  if (me.blocked) return <Blocked onLogout={() => update((x) => act.logout(x, 'client'))} />
  if (!me.name) return <Setup me={me} />
  const title = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label ?? 'My account'
  return (
    <PortalShell nav={NAV} user={me} userId={me.id} title={title} roleLabel="Client" onLogout={() => update((x) => act.logout(x, 'client'))}>
      <Routes>
        <Route index element={<Home me={me} />} />
        <Route path="new" element={<NewRequest me={me} />} />
        <Route path="requests" element={<Requests me={me} />} />
        <Route path="requests/:id" element={<RequestDetail me={me} />} />
        <Route path="challan" element={<Challan me={me} />} />
        <Route path="gst" element={<Gst me={me} />} />
        <Route path="wallet" element={<ClientWallet me={me} />} />
        <Route path="refer" element={<Refer me={me} />} />
        <Route path="offers" element={<Offers me={me} />} />
        <Route path="profile" element={<Profile me={me} />} />
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

function Setup({ me }) {
  const { update } = useStore()
  const [f, setF] = useState({ name: '', email: '', city: 'Indore', state: 'Madhya Pradesh', referredBy: '' })
  return (
    <div className="min-h-screen bg-page">
      <div className="bg-ink px-5 py-10">
        <div className="max-w-lg mx-auto">
          <p className="font-serif font-bold text-[28px] text-white">A few details</p>
          <p className="text-on-ink-muted mt-1">So the right advocate can help you. Takes 30 seconds.</p>
        </div>
      </div>
      <form
        className="max-w-lg mx-auto p-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          update((s) => act.saveClient(s, me.id, f))
        }}>
        <Field label="Your name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label="Email (for invoices)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="City / district" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} options={DISTRICTS} />
          <Select label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} options={STATES} />
        </div>
        <Field label="Referral code (optional)" value={f.referredBy} onChange={(e) => setF({ ...f, referredBy: e.target.value.toUpperCase() })} />
        <Button type="submit" size="lg" disabled={f.name.trim().length < 2}>
          Continue
        </Button>
      </form>
    </div>
  )
}

/* ---------------- home ---------------- */

function Home({ me }) {
  const { s } = useStore()
  const nav = useNavigate()
  const banners = s.settings.banners.filter((b) => b.active)
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % Math.max(1, banners.length)), 5000)
    return () => clearInterval(t)
  }, [banners.length])
  const b = banners[i % Math.max(1, banners.length)]
  const active = s.requests.filter((r) => r.clientId === me.id && r.status !== 'completed')
  const paid = me.paidChallans.map((p) => p.id)
  const pending = CHALLANS.filter((c) => me.vehicles.some((v) => v.number === c.vehicle) && !paid.includes(c.id)).length
  const cats = CATEGORIES.filter((c) => s.settings.categories.find((x) => x.key === c.key)?.active !== false)
  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="text-[22px] font-bold">Namaste, {me.name.split(' ')[0]}</p>
        <p className="text-muted text-[14px]">{me.city}, {me.state}</p>
      </div>
      {b ? (
        <button onClick={() => nav(b.image === 'bannerTraffic' ? '/app/challan' : b.image === 'bannerGavel' ? '/app/offers' : '/app/new')} className="relative h-[190px] rounded-2xl overflow-hidden bg-ink text-left">
          <img src={IMG[b.image]} alt="" className="absolute right-0 top-0 h-full w-[60%] object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink from-45% via-ink/70 via-60% to-transparent" />
          <div className="relative p-6 flex flex-col gap-2.5 max-w-[60%]">
            <span className="self-start rounded-md bg-gold px-2 py-0.5 text-[11px] font-bold text-ink">{b.tag}</span>
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
          {cats.map((c) => (
            <Link key={c.key} to={'/app/new?category=' + c.key} className="flex flex-col gap-1.5 text-center">
              <img src={c.image} alt="" className="aspect-square w-full rounded-[14px] object-cover" />
              <span className="text-[12px] font-semibold leading-tight">{c.short}</span>
            </Link>
          ))}
          <Link to="/app/challan" className="flex flex-col gap-1.5 text-center">
            <span className="relative">
              <img src={IMG.catChallan} alt="" className="aspect-square w-full rounded-[14px] object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded bg-gold px-1 text-[9.5px] font-bold">Pay</span>
            </span>
            <span className="text-[12px] font-semibold leading-tight">e-Challan</span>
          </Link>
        </div>
      </section>

      {active.length ? (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Your active requests" action="See all" onAction={() => nav('/app/requests')} />
          {active.slice(0, 3).map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/app/challan" className="md:col-span-1 relative h-[130px] rounded-2xl overflow-hidden bg-ink text-white p-5 flex flex-col justify-center gap-1.5">
          <img src={IMG.bannerTraffic} alt="" className="absolute right-0 top-0 h-full w-[55%] object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink from-45% to-transparent" />
          <span className="relative font-bold text-[16px]">Check and pay e-Challan</span>
          <span className="relative text-[12px] text-on-ink">{pending ? pending + ' pending on your vehicles' : 'No pending challans'}</span>
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

function RequestRow({ r }) {
  const { s } = useStore()
  const c = categoryOf(r.category)
  const a = advById(s, r.advocateId)
  const st = REQ_STATUS[r.status]
  const advVisible = a && !['submitted', 'assigned'].includes(r.status)
  return (
    <Link to={'/app/requests/' + r.id} className="card p-4 flex items-center gap-3.5 hover:border-line-strong">
      <img src={c.image} alt="" className="size-12 rounded-[10px] object-cover" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[14.5px]">{c.name}</p>
        <p className="text-[12.5px] text-muted truncate">
          {r.id} · {advVisible ? 'Adv. ' + a.name : 'Finding your advocate'} · {ago(r.createdAt)}
        </p>
      </div>
      <Pill tone={st.tone}>{st.label}</Pill>
      <ChevronRight className="size-4 text-muted hidden sm:block" />
    </Link>
  )
}

/* ---------------- new request ---------------- */

function NewRequest({ me }) {
  const { update } = useStore()
  const nav = useNavigate()
  const [q] = useSearchParams()
  const [cat, setCat] = useState(q.get('category') || 'other')
  const [issue, setIssue] = useState('')
  const [district, setDistrict] = useState(q.get('district') || me.city)
  const [lang, setLang] = useState('Hindi')
  const [docs, setDocs] = useState([])
  const c = categoryOf(cat)
  const ok = issue.trim().length >= 15
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5">
        <PageHead title="Request an advocate" back />
        <div className="flex items-center gap-4 rounded-2xl p-3" style={{ background: c.tone.bg }}>
          <img src={c.image} alt="" className="size-16 rounded-xl object-cover" />
          <div className="flex-1">
            <p className="font-bold text-[16px]" style={{ color: c.tone.fg }}>
              {c.name}
            </p>
            <p className="text-[12.5px]" style={{ color: c.tone.fg }}>
              {c.covers}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((k) => (
            <Chip key={k.key} active={k.key === cat} onClick={() => setCat(k.key)}>
              {k.short}
            </Chip>
          ))}
        </div>
        <Field label="Tell us what happened" as="textarea" maxLength={1000} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Describe your problem in your own words. Mention dates, places and what you want to achieve." hint={issue.length + ' / 1000'} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="District" value={district} onChange={(e) => setDistrict(e.target.value)} options={DISTRICTS} />
          <Select label="Preferred language" value={lang} onChange={(e) => setLang(e.target.value)} options={REQ_LANGS} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-text-2">Documents (optional)</span>
          <div className="flex flex-wrap gap-2.5">
            {docs.map((d, i) => (
              <span key={i} className="relative">
                <img src={d} alt="" className="size-20 rounded-xl object-cover" />
                <button type="button" aria-label="Remove" onClick={() => setDocs(docs.filter((_, k) => k !== i))} className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-ink text-white">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            <label className="grid size-20 place-items-center rounded-xl border-[1.5px] border-dashed border-[#B8B0A0] cursor-pointer" aria-label="Add document">
              <Plus className="size-6 text-muted" />
              <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setDocs([...docs, await fileToDataUrl(f, 900)]); e.target.value = '' }} />
            </label>
          </div>
        </div>
        <Button
          size="lg"
          disabled={!ok}
          onClick={() => {
            let id
            update((s) => {
              const n = act.submitRequest(s, me.id, { category: cat, issue: issue.trim(), district, lang, docs })
              id = n.requests[0].id
              return n
            })
            nav('/app/requests/' + id)
          }}>
          Submit request
        </Button>
        {!ok ? <p className="text-[12px] text-muted -mt-2">Write at least a sentence about your problem.</p> : null}
      </div>
      <Card className="p-5 flex flex-col gap-3 h-fit">
        <p className="font-bold">What happens next</p>
        {['Our team reviews your request and assigns a verified advocate in your district.', 'The advocate chats with you here and sends a fee quote. Your number stays private.', 'You pay online. We release it to the advocate only after you confirm the work is done.'].map((t, i) => (
          <div key={t} className="flex gap-3">
            <span className="grid size-6 place-items-center rounded-full bg-ink text-gold text-[12px] font-bold shrink-0">{i + 1}</span>
            <p className="text-[13px] text-text-2">{t}</p>
          </div>
        ))}
        <Note tone="gold">Demo: the admin panel assigns requests (/admin). If nobody does, a sample advocate is assigned after about 15 seconds.</Note>
      </Card>
    </div>
  )
}

/* ---------------- requests ---------------- */

function Requests({ me }) {
  const { s } = useStore()
  const nav = useNavigate()
  const [tab, setTab] = useState('active')
  const mine = s.requests.filter((r) => r.clientId === me.id)
  const list = mine.filter((r) => (tab === 'active' ? r.status !== 'completed' : r.status === 'completed'))
  return (
    <div className="flex flex-col gap-4">
      <PageHead title="My requests" right={<Button icon={Plus} size="sm" onClick={() => nav('/app/new')}>New request</Button>} />
      <div className="flex gap-2">
        <Chip active={tab === 'active'} onClick={() => setTab('active')}>Active</Chip>
        <Chip active={tab === 'done'} onClick={() => setTab('done')}>Completed</Chip>
      </div>
      {list.length ? list.map((r) => <RequestRow key={r.id} r={r} />) : <EmptyState icon={FileText} title={tab === 'active' ? 'No active requests' : 'Nothing completed yet'} sub="Pick a legal service and describe your problem. A verified advocate will contact you here." action="Request an advocate" onAction={() => nav('/app/new')} />}
    </div>
  )
}

function RequestDetail({ me }) {
  const { id } = useParams()
  const { s, update } = useStore()
  const toast = useToast()
  const r = s.requests.find((x) => x.id === id && x.clientId === me.id)
  const [pay, setPay] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [dispute, setDispute] = useState(false)
  if (!r) return <Navigate to="/app/requests" replace />
  const c = categoryOf(r.category)
  const a = advById(s, r.advocateId)
  const advVisible = a && !['submitted', 'assigned'].includes(r.status)
  const st = REQ_STATUS[r.status]
  const order = ['submitted', 'assigned', 'quoted', 'paid', 'done', 'completed']
  const at = r.status === 'accepted' ? 1 : r.status === 'disputed' ? 4 : order.indexOf(r.status)
  const step = (i) => (r.status === 'completed' || i < at ? 'done' : i === at ? 'now' : 'todo')
  return (
    <div className="flex flex-col gap-4">
      <PageHead title={c.name} sub={r.id + ' · ' + r.district} back="/app/requests" right={<Pill tone={st.tone}>{st.label}</Pill>} />
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="flex flex-col gap-4">
          {advVisible ? (
            <Card className="p-4 flex items-center gap-3">
              <Avatar photo={a.photo} size={48} />
              <div className="flex-1 min-w-0">
                <p className="font-bold">Adv. {a.name} <ShieldCheck className="inline size-4 text-green" /></p>
                <p className="text-[12.5px] text-muted">
                  <Star className="inline size-3 fill-gold text-gold" /> {a.rating || 'New'} · {a.years} yrs · {a.courts}
                </p>
              </div>
            </Card>
          ) : (
            <Note tone="neutral" icon={ShieldCheck}>
              Our team is choosing a verified advocate for you. You will get a notification.
            </Note>
          )}
          {r.status === 'quoted' ? (
            <Card className="p-4 border-[1.5px] border-ink flex flex-col gap-2.5">
              <div className="flex justify-between">
                <span className="text-[13px] font-bold text-gold-text">Fee quote</span>
                <span className="text-[12px] text-muted">Valid till {dateShort(r.quote.validTill)}</span>
              </div>
              <p className="text-[26px] font-extrabold">{inr(r.quote.fee)}</p>
              <p className="text-[13px] text-text-2">{r.quote.scope}</p>
              <Button onClick={() => setPay(true)}>Accept and pay</Button>
            </Card>
          ) : null}
          {r.status === 'done' ? (
            <Card className="p-4 border-orange flex flex-col gap-2.5">
              <p className="font-bold">Is the work done?</p>
              <p className="text-[13px] text-text-2">Confirm to release the payment. If you do nothing, it confirms automatically in {s.settings.autoConfirmDays} days.</p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => setConfirm(true)}>Confirm</Button>
                <Button variant="danger" onClick={() => setDispute(true)}>Raise a dispute</Button>
              </div>
            </Card>
          ) : null}
          {r.status === 'disputed' ? <Note tone="orange">Dispute raised: {r.dispute?.reason}. The payment is on hold while our team reviews it.</Note> : null}
          <Card className="p-4">
            <Timeline
              steps={[
                { title: 'Request submitted', sub: dateShort(r.createdAt), state: step(0) },
                { title: 'Advocate assigned', sub: advVisible ? 'Adv. ' + a.name : undefined, state: step(1) },
                { title: 'Fee quote', sub: r.quote ? inr(r.quote.fee) : undefined, state: step(2) },
                { title: 'Paid', sub: r.paid ? inr(r.paid.total) + ' · held safely' : undefined, state: step(3) },
                { title: r.status === 'disputed' ? 'Disputed' : 'Work done', state: step(4) },
                { title: 'Confirmed', state: step(5) },
              ]}
            />
          </Card>
          <Card className="p-4 flex flex-col gap-2">
            <p className="font-bold text-[14px]">Your request</p>
            <p className="text-[13.5px] text-text-2 leading-relaxed">{r.issue}</p>
            <p className="text-[12px] text-muted">{r.district} · {r.lang}{r.docs?.length ? ' · ' + r.docs.length + ' documents' : ''}</p>
          </Card>
          {r.paid ? (
            <Card className="p-4 flex flex-col gap-2">
              <p className="font-bold text-[14px]">Payment</p>
              <BillRow label="Advocate's fee" value={inr(r.paid.fee)} />
              {r.paid.discount ? <BillRow label={'Offer ' + (r.paid.offer ?? '')} value={'−' + inr(r.paid.discount)} tone="green" /> : null}
              <BillRow label="GST" value={inr(r.paid.gst)} />
              {r.paid.wallet ? <BillRow label="Wallet" value={'−' + inr(r.paid.wallet)} tone="green" /> : null}
              <BillRow label="Paid" value={inr(r.paid.total)} strong />
              <button onClick={() => toast('GST invoices are emailed once the payment gateway is connected.')} className="self-start text-[13px] font-semibold text-gold-text">
                GST invoice (PDF)
              </button>
            </Card>
          ) : null}
        </div>
        {advVisible ? (
          <ChatPanel
            reqId={r.id}
            me="client"
            closed={r.status === 'completed'}
            onPay={r.status === 'quoted' ? () => setPay(true) : undefined}
            headerSlot={
              <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
                <Avatar photo={a.photo} size={36} />
                <div>
                  <p className="font-bold text-[14px]">Adv. {a.name}</p>
                  <p className="text-[12px] text-muted">{a.years} yrs · {a.languages}</p>
                </div>
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
      <Checkout open={pay} onClose={() => setPay(false)} r={r} me={me} />
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} r={r} />
      <DisputeModal open={dispute} onClose={() => setDispute(false)} r={r} />
    </div>
  )
}

function Checkout({ open, onClose, r, me }) {
  const { s, update } = useStore()
  const toast = useToast()
  const offerOk = !me.usedFirst10
  const [useOffer, setUseOffer] = useState(offerOk)
  const [useWallet, setUseWallet] = useState(me.wallet > 0)
  const [busy, setBusy] = useState(false)
  const bill = useMemo(() => {
    if (!r.quote) return null
    const discount = useOffer && offerOk ? offerDiscount(r.quote.fee, { percent: 10, max: 500 }) : 0
    return clientBill(r.quote.fee, { discount, gstOnService: categoryOf(r.category).gstOnService, wallet: useWallet ? me.wallet : 0, rates: ratesFor(s, r.category) })
  }, [r, useOffer, offerOk, useWallet, me.wallet, s])
  if (!bill) return null
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Checkout"
      footer={
        <>
          <span className="mr-auto self-center text-[19px] font-extrabold">{inr(bill.total)}</span>
          <Button
            loading={busy}
            onClick={() => {
              setBusy(true)
              setTimeout(() => {
                update((x) => act.payRequest(x, r.id, { useOffer: useOffer && offerOk, useWallet }))
                setBusy(false)
                onClose()
                toast('Payment successful. Your money is held safely.', 'green')
              }, 1200)
            }}>
            Pay securely
          </Button>
        </>
      }>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-[10px] bg-gold-tint">
          <Tag className="size-5 text-gold-text" />
        </span>
        <div className="flex-1">
          <p className="font-bold text-[14px]">FIRST10</p>
          <p className={cx('text-[12px]', useOffer && offerOk ? 'text-green' : 'text-muted')}>{!offerOk ? 'Already used on your first consultation' : useOffer ? 'Applied · 10% off, up to ₹500' : 'Tap to apply · 10% off up to ₹500'}</p>
        </div>
        {offerOk ? <Toggle checked={useOffer} onChange={setUseOffer} label="Apply offer" /> : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-[10px] bg-ink">
          <Wallet className="size-5 text-gold" />
        </span>
        <div className="flex-1">
          <p className="font-bold text-[14px]">Use wallet balance</p>
          <p className="text-[12px] text-muted">{inr(me.wallet)} available</p>
        </div>
        <Toggle checked={useWallet && me.wallet > 0} onChange={(v) => me.wallet > 0 && setUseWallet(v)} label="Use wallet" />
      </div>
      <div className="rounded-xl border border-line p-4 flex flex-col gap-2.5">
        <BillRow label="Advocate's fee" value={inr(bill.fee)} />
        {bill.discount ? <BillRow label="Offer FIRST10 (10%)" value={'−' + inr(bill.discount)} tone="green" /> : null}
        <BillRow label={categoryOf(r.category).gstOnService ? 'GST ' + Math.round(s.settings.gst * 100) + '% on ' + inr(bill.base) : 'GST (not charged on this service)'} value={inr(bill.gst)} />
        {bill.wallet ? <BillRow label="Wallet" value={'−' + inr(bill.wallet)} tone="green" /> : null}
        <BillRow label="To pay" value={inr(bill.total)} strong />
      </div>
      <Note icon={ShieldCheck}>Vakeel Bhai holds this payment. It goes to your advocate only after you confirm the work is done.</Note>
      <Note tone="gold">Demo: no real payment is taken. Razorpay (UPI, cards, netbanking) is connected in the backend phase.</Note>
    </Modal>
  )
}

function ConfirmModal({ open, onClose, r }) {
  const { update } = useStore()
  const [stars, setStars] = useState(5)
  const [review, setReview] = useState('')
  return (
    <Modal open={open} onClose={onClose} title="Confirm and rate" footer={<Button onClick={() => { update((x) => act.confirmRequest(x, r.id, stars, review)); onClose() }}>Confirm work is done</Button>}>
      <p className="font-bold text-center">How was your experience?</p>
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((k) => (
          <button key={k} onClick={() => setStars(k)} aria-label={k + ' stars'}>
            <Star className={cx('size-9 text-gold', k <= stars && 'fill-gold')} />
          </button>
        ))}
      </div>
      <Field label="Review (optional)" as="textarea" value={review} onChange={(e) => setReview(e.target.value)} />
      <Note icon={ShieldCheck}>Confirming releases the payment to the advocate. Do this only when the agreed work is done.</Note>
    </Modal>
  )
}

function DisputeModal({ open, onClose, r }) {
  const { update } = useStore()
  const [reason, setReason] = useState(DISPUTE_REASONS[0])
  const [detail, setDetail] = useState('')
  return (
    <Modal open={open} onClose={onClose} title="Raise a dispute" footer={<Button variant="ink" disabled={detail.trim().length < 10} onClick={() => { update((x) => act.disputeRequest(x, r.id, reason + ': ' + detail.trim())); onClose() }}>Submit dispute</Button>}>
      <Note tone="orange">The payment stays on hold while our team reviews. We reply in your request chat within 24 hours.</Note>
      <div className="flex flex-wrap gap-2">
        {DISPUTE_REASONS.map((x) => (
          <Chip key={x} active={reason === x} onClick={() => setReason(x)}>
            {x}
          </Chip>
        ))}
      </div>
      <Field label="Tell us more" as="textarea" value={detail} onChange={(e) => setDetail(e.target.value)} />
    </Modal>
  )
}

/* ---------------- e-Challan ---------------- */

function Challan({ me }) {
  const { update } = useStore()
  const [q] = useSearchParams()
  const qv = q.get('vehicle')
  useEffect(() => {
    if (qv && qv.replace(/\s/g, '').length >= 8 && !me.vehicles.some((v) => v.number.replace(/\s/g, '') === qv.replace(/\s/g, ''))) update((x) => act.addVehicle(x, me.id, qv))
  }, [qv, me.id, me.vehicles, update])
  const vehicles = me.vehicles.length ? me.vehicles : [{ number: 'MP 09 AB 1234', model: 'Hyundai i20 · Petrol' }]
  const [vi, setVi] = useState(0)
  const v = vehicles[Math.min(vi, vehicles.length - 1)]
  const [tab, setTab] = useState('pending')
  const [sel, setSel] = useState([])
  const [adding, setAdding] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [busy, setBusy] = useState(false)
  const paidIds = me.paidChallans.map((p) => p.id)
  const pending = CHALLANS.filter((c) => c.vehicle === v.number && !paidIds.includes(c.id))
  const paid = me.paidChallans.filter((p) => p.vehicle === v.number)
  const chosen = pending.filter((c) => sel.includes(c.id))
  const total = chosen.reduce((a, c) => a + c.amount, 0)
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <PageHead title="e-Challan" sub="Check and pay traffic challans for your vehicles" />
      <div className="flex flex-wrap gap-2">
        {vehicles.map((x, k) => (
          <button key={x.number} onClick={() => { setVi(k); setSel([]) }} className={cx('rounded-xl px-4 py-2.5 text-left border', k === vi ? 'bg-ink text-white border-ink' : 'bg-white border-line')}>
            <span className="block font-extrabold tracking-wider text-[14px]">{x.number}</span>
            <span className={cx('block text-[11.5px]', k === vi ? 'text-on-ink-muted' : 'text-muted')}>{x.model}</span>
          </button>
        ))}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); update((x) => act.addVehicle(x, me.id, adding.trim())); setAdding(''); setVi(vehicles.length) }}>
          <input value={adding} onChange={(e) => setAdding(e.target.value.toUpperCase())} placeholder="Add vehicle no." aria-label="Vehicle number" className="h-[58px] w-44 rounded-xl border border-line-strong bg-white px-3 text-[14px] font-semibold outline-none focus:border-ink" />
          <Button type="submit" variant="line" className="h-[58px]" disabled={adding.replace(/\s/g, '').length < 8} icon={Plus}>
            Add
          </Button>
        </form>
      </div>
      <div className="flex gap-2">
        <Chip active={tab === 'pending'} onClick={() => setTab('pending')}>Pending ({pending.length})</Chip>
        <Chip active={tab === 'paid'} onClick={() => setTab('paid')}>Paid ({paid.length})</Chip>
      </div>
      {tab === 'pending' ? (
        pending.length ? (
          <>
            {pending.map((c) => {
              const on = sel.includes(c.id)
              return (
                <button key={c.id} onClick={() => setSel(on ? sel.filter((x) => x !== c.id) : [...sel, c.id])} aria-pressed={on} className={cx('card p-4 flex gap-3 text-left', on && 'border-ink border-[1.5px]')}>
                  <CheckBox checked={on} />
                  <span className="flex-1 flex flex-col gap-1">
                    <span className="flex justify-between font-bold text-[14px]">
                      {c.offence} <span>{inr(c.amount)}</span>
                    </span>
                    <span className="text-[12px] text-muted">{c.place}</span>
                    <span className="text-[12px] text-muted">{c.id} · {c.date}</span>
                    <Pill tone={c.overdue ? 'red' : 'orange'} dot={false} className="self-start mt-1">
                      {c.due}
                    </Pill>
                  </span>
                </button>
              )
            })}
            <div className="card p-4 flex items-center gap-4 sticky bottom-20 lg:bottom-4">
              <div>
                <p className="text-[19px] font-extrabold">{inr(total)}</p>
                <p className="text-[12px] text-muted">{chosen.length} of {pending.length} selected</p>
              </div>
              <Button
                className="flex-1"
                size="lg"
                disabled={!chosen.length}
                loading={busy}
                onClick={() => {
                  setBusy(true)
                  setTimeout(() => {
                    let res
                    update((x) => {
                      res = act.payChallans(x, me.id, chosen.map((c) => c.id))
                      return res.s
                    })
                    setReceipt({ receipt: res.receipt, total: res.total, items: chosen })
                    setSel([])
                    setBusy(false)
                  }, 1000)
                }}>
                Pay challans
              </Button>
            </div>
          </>
        ) : (
          <EmptyState icon={CircleCheck} title="No pending challans" sub="This vehicle has nothing to pay right now." />
        )
      ) : paid.length ? (
        paid.map((p) => (
          <Card key={p.id + p.paidOn} className="p-4 flex justify-between items-center gap-3">
            <div>
              <p className="font-bold text-[14px]">{p.offence}</p>
              <p className="text-[12px] text-muted">{p.id} · paid {p.paidOn} · receipt {p.receipt}</p>
            </div>
            <span className="font-bold">{inr(p.amount)}</span>
          </Card>
        ))
      ) : (
        <EmptyState icon={Receipt} title="No paid challans yet" />
      )}
      <p className="text-[12px] text-muted">Sample challans. Live data comes from the e-Challan provider chosen in the backend phase.</p>
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Payment receipt" footer={<Button onClick={() => setReceipt(null)}>Done</Button>}>
        {receipt ? (
          <>
            <div className="flex flex-col items-center gap-1.5 py-2">
              <CircleCheck className="size-12 text-green" />
              <p className="font-bold text-[18px]">Challan payment successful</p>
              <p className="text-[28px] font-extrabold">{inr(receipt.total)}</p>
              <p className="text-[12.5px] text-muted">Receipt {receipt.receipt} · {dateShort(Date.now())}</p>
            </div>
            {receipt.items.map((c) => (
              <BillRow key={c.id} label={c.offence + ' · ' + c.id} value={inr(c.amount)} />
            ))}
            <Note tone="gold">Demo: no real payment was made.</Note>
          </>
        ) : null}
      </Modal>
    </div>
  )
}

/* ---------------- GST filing ---------------- */

function Gst({ me }) {
  const { s, update } = useStore()
  const toast = useToast()
  const [f, setF] = useState({ returnType: 'GSTR-3B', gstin: '', period: 'October 2026', note: '' })
  const isReg = f.returnType === 'New GST registration'
  const ok = (isReg || /^[0-9A-Z]{15}$/.test(f.gstin)) && f.period.trim().length > 2
  const mine = s.gstRequests.filter((g) => g.clientId === me.id)
  const tone = { Requested: 'neutral', 'In review': 'blue', 'Documents needed': 'orange', Filed: 'green', Closed: 'green' }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4">
        <PageHead title="GST filing" sub="Our team files your returns. You track every step here." />
        <div className="flex flex-wrap gap-2">
          {GST_RETURNS.map((r) => (
            <Chip key={r} active={f.returnType === r} onClick={() => setF({ ...f, returnType: r })}>
              {r}
            </Chip>
          ))}
        </div>
        {!isReg ? <Field label="GSTIN" maxLength={15} value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '') })} placeholder="15-character GSTIN" /> : null}
        <Field label={isReg ? 'Business name' : 'Return period'} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} />
        <Field label="Anything we should know? (optional)" as="textarea" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <Button
          size="lg"
          disabled={!ok}
          onClick={() => {
            update((x) => act.requestGst(x, me.id, { ...f, gstin: isReg ? '' : f.gstin }))
            setF({ ...f, gstin: '', note: '' })
            toast('Request sent. Our team will reply here.', 'green')
          }}>
          Request GST filing
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <SectionTitle title="Your requests" />
        {mine.length ? (
          mine.map((g) => (
            <Card key={g.id} className="p-4 flex flex-col gap-1.5">
              <div className="flex justify-between gap-2">
                <span className="font-bold text-[14px]">{g.id} · {g.returnType}</span>
                <Pill tone={tone[g.status]}>{g.status}</Pill>
              </div>
              <span className="text-[12.5px] text-muted">{(g.gstin || 'New registration') + ' · ' + g.period + ' · ' + dateShort(g.at)}</span>
            </Card>
          ))
        ) : (
          <Card className="p-5 text-[13px] text-muted">No GST requests yet. The service fee is shown before our team starts.</Card>
        )}
      </div>
    </div>
  )
}

/* ---------------- wallet, refer, offers, profile ---------------- */

function ClientWallet({ me }) {
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <PageHead title="Wallet" />
      <div className="rounded-2xl bg-ink p-6 flex flex-col gap-3">
        <span className="text-[12px] text-on-ink-muted">Wallet balance</span>
        <span className="text-[32px] font-extrabold text-white">{inr(me.wallet)}</span>
        <span className="text-[13px] text-on-ink">Use it at checkout. Referral rewards and cashback land here. Wallet money cannot be withdrawn.</span>
        <Link to="/app/refer" className="self-start h-10 px-4 inline-flex items-center gap-2 rounded-[10px] bg-gold font-bold text-[14px]">
          <Gift className="size-4" /> Refer and earn
        </Link>
      </div>
      <SectionTitle title="History" />
      {me.walletTx.length ? (
        me.walletTx.map((t) => (
          <Card key={t.id} className="p-4 flex items-center gap-3">
            <span className={cx('grid size-10 place-items-center rounded-[10px]', t.amount >= 0 ? 'bg-green-soft' : 'bg-surface-2')}>{t.amount >= 0 ? <Gift className="size-5 text-green" /> : <Receipt className="size-5" />}</span>
            <div className="flex-1">
              <p className="font-bold text-[14px]">{t.title}</p>
              <p className="text-[12px] text-muted">{dateShort(t.at)}</p>
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

function Refer({ me }) {
  const { s } = useStore()
  const toast = useToast()
  const code = me.referralCode || 'VBUSER123'
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <PageHead title="Refer and earn" />
      <div className="rounded-2xl bg-ink p-7 flex flex-col items-center text-center gap-3">
        <Gift className="size-10 text-gold" />
        <p className="font-serif font-bold text-[24px] text-white">Earn {inr(s.settings.referralReward)} for every friend</p>
        <p className="text-[14px] text-on-ink max-w-md">When a friend joins with your code and completes their first paid service, the reward lands in your wallet.</p>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(code)
            toast('Code copied')
          }}
          className="flex items-center gap-2.5 border-[1.5px] border-dashed border-gold rounded-xl px-5 py-2.5 text-gold text-[20px] font-extrabold tracking-wider">
          {code} <Copy className="size-5" />
        </button>
      </div>
      <Card className="p-5 flex flex-col gap-3">
        <p className="font-bold">How it works</p>
        {['Share your code with a friend', 'They sign up and enter your code', 'You earn when their first paid service is confirmed'].map((t, i) => (
          <p key={t} className="flex items-center gap-3 text-[14px]">
            <span className="grid size-6 place-items-center rounded-full bg-ink text-gold text-[12px] font-bold">{i + 1}</span>
            {t}
          </p>
        ))}
        {!s.settings.referralOn ? <Note tone="orange">Refer and earn is paused right now.</Note> : null}
      </Card>
    </div>
  )
}

function Offers({ me }) {
  const { s } = useStore()
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <PageHead title="Offers" back />
      <div className="grid gap-4 sm:grid-cols-2">
        {s.settings.offers.filter((o) => o.active).map((o) => (
          <Card key={o.code} className="overflow-hidden">
            <img src={o.code === 'FIRST10' ? IMG.bannerGavel : IMG.bannerConsult} alt="" className="w-full h-32 object-cover" />
            <div className="p-4 flex flex-col gap-2">
              <p className="font-bold">{o.title}</p>
              <div className="flex justify-between items-center">
                <span className="rounded-lg border border-dashed border-gold bg-gold-wash px-2.5 py-1 font-extrabold text-gold-text text-[13px]">{o.code}</span>
                <span className="text-[12px] font-semibold text-green">{o.code === 'FIRST10' && me.usedFirst10 ? 'Used' : 'Till ' + o.till}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Profile({ me }) {
  const { update } = useStore()
  const toast = useToast()
  const [f, setF] = useState({ name: me.name, email: me.email, city: me.city, state: me.state })
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <PageHead title="Profile" />
      <Card className="p-5 flex items-center gap-4">
        <Avatar photo={me.photo} size={56} />
        <div>
          <p className="font-bold text-[17px]">{me.name}</p>
          <p className="text-[13px] text-muted">+91 {phonePretty(me.phone)}</p>
        </div>
      </Card>
      <Card className="p-5 flex flex-col gap-4">
        <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label="Email (for invoices)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="City / district" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} options={DISTRICTS} />
          <Select label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} options={STATES} />
        </div>
        <Button
          disabled={f.name.trim().length < 2}
          onClick={() => {
            update((x) => act.saveClient(x, me.id, f))
            toast('Saved', 'green')
          }}>
          Save
        </Button>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Link to="/app/offers" className="h-10 px-4 inline-flex items-center rounded-[10px] border border-line-strong bg-white font-semibold text-[14px]">Offers</Link>
        <Link to="/help" className="h-10 px-4 inline-flex items-center rounded-[10px] border border-line-strong bg-white font-semibold text-[14px]">Help</Link>
        <Button variant="danger" onClick={() => update((x) => act.logout(x, 'client'))}>
          Log out
        </Button>
      </div>
    </div>
  )
}
