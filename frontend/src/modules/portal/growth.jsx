/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Copy, FileText, Gift, MessageCircle, Receipt, Share2, Tag, Upload } from 'lucide-react'
import { BillRow, Button, Card, EmptyState, Field, Note, PageLoader, Pill, Select, Timeline, useToast } from '@/components/ui'
import SecureImage from '@/components/SecureImage'
import { errText, publicApi, uploadForm, userApi, userFileUrl } from '@/lib/api'
import { IMG } from '@/lib/catalog'
import { useLive } from '@/lib/live'
import { useGatewayPay } from '@/lib/pay'
import { inr } from '@/lib/money'
import { dateShort, time } from '@/lib/format'
import { PageHead } from './common'

/**
 * Offers, refer and earn, GST filing and invoices on the website (Phase 4b/5).
 * SAME FLOW AS THE APP (mobile-app/src/screens/client.tsx, services.tsx). All on the API.
 */
const when = (d) => (d ? dateShort(new Date(d).getTime()) + ', ' + time(new Date(d).getTime()) : '')
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

function useApi(path) {
  const [s, setS] = useState({ data: null, error: '', loading: true })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    setS((x) => ({ ...x, loading: true }))
    userApi(path)
      .then((j) => live && setS({ data: j.data, error: '', loading: false }))
      .catch((e) => live && setS({ data: null, error: errText(e), loading: false }))
    return () => {
      live = false
    }
  }, [path, n])
  return { ...s, reload: useCallback(() => setN((x) => x + 1), []) }
}

function Failed({ error, onRetry }) {
  return (
    <Card className="p-6 flex flex-col items-start gap-3 max-w-lg">
      <p className="font-bold">Could not load this page</p>
      <p className="text-[14px] text-muted">{error}</p>
      <Button size="sm" variant="line" onClick={onRetry}>Try again</Button>
    </Card>
  )
}

/** Open a payment's GST invoice PDF in a new tab (a short-lived signed link). */
export async function openInvoice(paymentId) {
  const tab = window.open('', '_blank')
  try {
    const j = await userApi('/payments/' + paymentId + '/invoice-link')
    if (tab) tab.location.href = API + j.data.path
    else window.location.href = API + j.data.path
  } catch (e) {
    tab?.close()
    throw e
  }
}

/* ---------------- banners ---------------- */

const LINK_TO = { offers: '/app/offers', challan: '/app/challan', categories: '/app/new', gst: '/app/gst' }
const FIXED = [
  { id: 'f1', title: 'Talk to a verified advocate today', sub: 'Matched by our team in your district', tag: 'New', img: IMG.bannerGavel, to: '/app/new' },
  { id: 'f2', title: 'Clear your e-Challans in one go', sub: 'We pay the department for you', tag: 'e-Challan', img: IMG.bannerTraffic, to: '/app/challan' },
]

/** Home banners from the admin; the two standard ones until the admin adds any. */
export function useBanners() {
  const [list, setList] = useState(FIXED)
  useEffect(() => {
    publicApi('/banners?audience=client')
      .then((j) => {
        if (!j.data.length) return
        setList(j.data.map((b) => ({ id: b.id, title: b.title, sub: b.sub, tag: b.tag, img: b.hasImage ? API + '/api/banners/' + b.id + '/image?v=' + b.imageVersion : null, to: b.link.kind === 'category' ? '/app/new?category=' + b.link.value : LINK_TO[b.link.kind] ?? null })))
      })
      .catch(() => {})
  }, [])
  return list
}

/* ---------------- offers ---------------- */

export function OffersPage() {
  const { data, error, reload } = useApi('/client/offers')
  const toast = useToast()
  if (error) return <Failed error={error} onRetry={reload} />
  if (!data) return <PageLoader />
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <PageHead title="Offers" sub="Apply a code at checkout. Automatic offers apply by themselves." />
      {data.length === 0 ? (
        <EmptyState icon={Tag} title="No offers right now" sub="New offers appear here when Vakeel Bhai runs them." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {data.map((o) => (
            <Card key={o.id} className="overflow-hidden">
              <div className="bg-ink p-5 text-white flex flex-col gap-1">
                <span className="text-[26px] font-extrabold text-gold">{o.label}</span>
                <span className="font-semibold">{o.title}</span>
              </div>
              <div className="p-4 flex flex-col gap-2">
                {o.description ? <p className="text-[13px] text-text-2">{o.description}</p> : null}
                <p className="text-[12px] text-muted">
                  {(o.categories.length ? o.categories.join(', ') : 'All legal services') + (o.minOrder ? ' · fee from ' + inr(o.minOrder) : '') + (o.firstServiceOnly ? ' · first paid service only' : '') + ' · till ' + dateShort(new Date(o.endAt).getTime())}
                </p>
                <div className="flex items-center justify-between">
                  {o.code ? (
                    <button onClick={() => navigator.clipboard?.writeText(o.code).then(() => toast('Code copied', 'green'))} className="flex items-center gap-2 rounded-lg border border-dashed border-gold bg-gold-wash px-3 py-1.5 font-extrabold text-gold-text tracking-wide">
                      {o.code} <Copy className="size-3.5" />
                    </button>
                  ) : (
                    <Pill tone="blue">Applies automatically</Pill>
                  )}
                  <span className={o.used ? 'text-[12px] font-semibold text-muted' : 'text-[12px] font-semibold text-green'}>{o.used ? 'Used' : 'Available'}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="text-[12px] text-muted">Discounts apply to the advocate's fee. GST is calculated after the discount.</p>
    </div>
  )
}

/* ---------------- refer and earn ---------------- */

export function ReferPage() {
  const toast = useToast()
  const { data: r, error, reload } = useApi('/client/referral')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  if (error) return <Failed error={error} onRetry={reload} />
  if (!r) return <PageLoader />
  const reward = r.reward == null ? 'a reward' : r.rewardType === 'flat' ? inr(r.reward) : r.reward + '% of their first fee'
  const share = 'Get legal help from verified advocates on Vakeel Bhai. Use my code ' + r.code + ' when you sign up.'
  const apply = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await userApi('/client/referral/apply', { method: 'POST', body: { code: code.trim().toUpperCase() } })
      toast('Code applied', 'green')
      reload()
    } catch (err) {
      toast(errText(err), 'red')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <PageHead title="Refer and earn" />
      <div className="rounded-2xl bg-ink p-6 text-center flex flex-col items-center gap-3">
        <Gift className="size-10 text-gold" />
        <p className="font-serif font-bold text-[24px] text-white">Earn {reward} for every friend</p>
        <p className="text-[13.5px] text-on-ink">When a friend joins with your code and completes their first paid service, the reward lands in your wallet.{r.monthlyCap ? ' Up to ' + inr(r.monthlyCap) + ' a month.' : ''}</p>
        <button onClick={() => navigator.clipboard?.writeText(r.code).then(() => toast('Code copied', 'green'))} className="flex items-center gap-2 rounded-xl border-[1.5px] border-dashed border-gold px-5 py-2.5 text-[20px] font-extrabold tracking-wider text-gold">
          {r.code} <Copy className="size-4" />
        </button>
        <Button icon={Share2} onClick={() => (navigator.share ? navigator.share({ text: share }).catch(() => {}) : navigator.clipboard?.writeText(share).then(() => toast('Message copied', 'green')))}>Share my code</Button>
      </div>
      {!r.enabled ? <Note tone="orange">Refer and earn is paused right now. Your code still works; rewards are paid while it is on.</Note> : null}
      {r.canApplyCode ? (
        <Card className="p-4 flex flex-col gap-2">
          <p className="font-bold text-[14px]">Got a code from a friend?</p>
          <form onSubmit={apply} className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="e.g. VBRAHUL123" className="flex-1 h-11 rounded-xl border border-line-strong px-3 font-semibold outline-none focus:border-ink" aria-label="Friend's code" />
            <Button type="submit" variant="line" loading={busy} disabled={code.trim().length < 5}>Apply</Button>
          </form>
          <p className="text-[12px] text-muted">Only before your first paid service.</p>
        </Card>
      ) : null}
      <Card className="p-4 flex flex-col gap-2.5">
        <p className="font-bold text-[14px]">Your referrals</p>
        {r.friends.length === 0 ? <p className="text-[13px] text-muted">No friends have joined with your code yet.</p> : null}
        {r.friends.map((f, i) => (
          <BillRow key={i} label={f.name + (f.rewarded ? ' · first service done' : ' · joined')} value={f.rewarded ? '+' + inr(f.reward) : 'Waiting'} tone={f.rewarded ? 'green' : undefined} />
        ))}
      </Card>
    </div>
  )
}

/* ---------------- GST filing ---------------- */

const GST_STATUS = { requested: ['Requested', 'neutral'], in_review: ['In review', 'blue'], documents_needed: ['Documents needed', 'orange'], filed: ['Filed', 'green'], closed: ['Closed', 'neutral'] }

export function GstFilingPage({ meta }) {
  const nav = useNavigate()
  const toast = useToast()
  const list = useApi('/client/gst-filings')
  const types = meta.gstReturnTypes ?? ['GSTR-1', 'GSTR-3B']
  const [f, setF] = useState({ returnType: 'GSTR-3B', gstin: '', businessName: '', period: '', note: '' })
  const [busy, setBusy] = useState(false)
  useLive('user', { 'gst:update': list.reload })
  const isReg = f.returnType === 'New GST registration'
  const ok = isReg ? f.businessName.trim().length >= 2 : /^[0-9]{2}[A-Z0-9]{13}$/.test(f.gstin) && f.period.trim().length >= 3
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const g = (await userApi('/client/gst-filings', { method: 'POST', body: { returnType: f.returnType, gstin: isReg ? '' : f.gstin, businessName: f.businessName.trim(), period: f.period.trim(), note: f.note.trim() } })).data
      nav('/app/gst/' + g.id)
    } catch (err) {
      toast(errText(err), 'red')
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <PageHead title="GST filing" sub="Our team files your returns. You see the fee before we start and track every step here." />
      {list.data?.length ? (
        <div className="flex flex-col gap-2.5">
          <p className="font-bold">Your requests</p>
          {list.data.map((g) => (
            <Link key={g.id} to={'/app/gst/' + g.id} className="card p-4 flex items-center gap-3 hover:border-line-strong">
              <span className="flex-1">
                <span className="block font-bold text-[14px]">{g.id} · {g.returnType}</span>
                <span className="block text-[12px] text-muted">{(g.gstin || g.businessName) + (g.period ? ' · ' + g.period : '')}</span>
              </span>
              {g.fee && !g.paid ? <Pill tone="gold">Pay {inr(g.fee.total)}</Pill> : null}
              <Pill tone={GST_STATUS[g.status][1]}>{GST_STATUS[g.status][0]}</Pill>
            </Link>
          ))}
        </div>
      ) : null}
      <form onSubmit={submit} className="card p-5 flex flex-col gap-4">
        <p className="font-bold">New request</p>
        <Select label="What do you need?" value={f.returnType} onChange={(e) => setF({ ...f, returnType: e.target.value })} options={types} />
        {isReg ? (
          <Field label="Business name" value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} maxLength={120} />
        ) : (
          <>
            <Field label="GSTIN" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '') })} maxLength={15} placeholder="15-character GSTIN" />
            <Field label="Return period" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} maxLength={40} placeholder="e.g. October 2026" />
          </>
        )}
        <Field label="Anything we should know? (optional)" as="textarea" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} />
        <Button type="submit" size="lg" loading={busy} disabled={!ok}>Request GST filing</Button>
        <p className="text-[12px] text-muted">You add your sales and purchase documents on the next screen.</p>
      </form>
    </div>
  )
}

export function GstFilingDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const { data: g, error, reload } = useApi('/client/gst-filings/' + id)
  const { pay, dialog } = useGatewayPay()
  const [busy, setBusy] = useState(false)
  useLive('user', { 'gst:update': (p) => p.number === id && reload() })
  if (error) return <Failed error={error} onRetry={reload} />
  if (!g) return <PageLoader />
  const upload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) return toast('Choose a JPG, PNG or WebP photo up to 5 MB', 'red')
    setBusy(true)
    try {
      const fd = uploadForm(file)
      fd.append('name', file.name)
      await userApi('/client/gst-filings/' + id + '/documents', { method: 'POST', body: fd })
      reload()
    } catch (err) {
      toast(errText(err), 'red')
    } finally {
      setBusy(false)
    }
  }
  const payFee = async () => {
    setBusy(true)
    try {
      const co = (await userApi('/client/gst-filings/' + id + '/checkout', { method: 'POST' })).data
      await pay(co, { description: 'GST filing ' + id })
      toast('Paid. Our team starts the filing.', 'green')
      reload()
    } catch (err) {
      if (err.code !== 'CANCELLED') toast(errText(err), 'red')
    } finally {
      setBusy(false)
    }
  }
  const order = ['requested', 'in_review', 'documents_needed', 'filed', 'closed']
  const at = order.indexOf(g.status)
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <PageHead back="/app/gst" title={g.id + ' · ' + g.returnType} sub={(g.gstin || g.businessName) + (g.period ? ' · ' + g.period : '')} right={<Pill tone={GST_STATUS[g.status][1]}>{GST_STATUS[g.status][0]}</Pill>} />
      {g.status === 'documents_needed' ? <Note tone="orange">Our team needs more documents. Add them below or check the chat.</Note> : null}
      {g.fee && !g.paid && g.status !== 'closed' ? (
        <Card className="p-5 flex flex-col gap-2.5 border-ink border-[1.5px]">
          <p className="font-bold">Service fee</p>
          <BillRow label="GST filing fee" value={inr(g.fee.fee)} />
          <BillRow label={'GST ' + g.fee.gstPercent + '%'} value={inr(g.fee.gst)} />
          <BillRow label="To pay" value={inr(g.fee.total)} strong />
          <Button size="lg" loading={busy} onClick={payFee}>Pay {inr(g.fee.total)}</Button>
        </Card>
      ) : null}
      {g.filedRef ? <Note>Filed. Acknowledgement number (ARN): <b>{g.filedRef}</b></Note> : null}
      <Card className="p-5">
        <Timeline
          steps={[
            { title: 'Requested', sub: when(g.createdAt), state: 'done' },
            { title: 'Team review and fee', sub: g.fee ? inr(g.fee.total) + (g.paid ? ' · paid ' + when(g.paidAt) : ' · to pay') : 'We tell you the fee here', state: at >= 1 ? 'done' : 'now' },
            { title: 'Documents', sub: g.docs.length + ' added', state: g.status === 'documents_needed' ? 'now' : at >= 1 ? 'done' : 'todo' },
            { title: 'Filed', sub: g.filedRef ? 'ARN ' + g.filedRef : undefined, state: at >= 3 ? 'done' : g.paid ? 'now' : 'todo' },
          ]}
        />
      </Card>
      <Card className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-bold">Documents ({g.docs.length})</p>
          {!['filed', 'closed'].includes(g.status) ? (
            <label className="inline-flex items-center gap-2 rounded-xl border border-line-strong px-3 h-10 text-[13px] font-semibold cursor-pointer">
              <Upload className="size-4" /> Add photo
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={upload} disabled={busy} />
            </label>
          ) : null}
        </div>
        {g.docs.length ? (
          <div className="flex flex-wrap gap-3">
            {g.docs.map((d) => (
              <SecureImage key={d.id} load={userFileUrl} path={'/client/gst-filings/' + id + '/documents/' + d.id} alt={d.name || 'Document'} className="size-24 rounded-lg object-cover border border-line" />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted">Add your sales and purchase invoices, bank statements or registration papers.</p>
        )}
      </Card>
      {g.ticket ? (
        <Link to={'/app/help/' + g.ticket} className="card p-4 flex items-center gap-3 hover:border-line-strong">
          <MessageCircle className="size-5 text-gold-text" />
          <span className="flex-1 font-semibold text-[14px]">Chat with our GST team</span>
          <span className="text-[12px] text-muted">{g.ticket}</span>
        </Link>
      ) : null}
      {dialog}
    </div>
  )
}

/* ---------------- invoices ---------------- */

const PURPOSE = { service: 'Legal service', membership: 'Membership', challan: 'e-Challan', gst: 'GST filing' }

export function Invoices() {
  const toast = useToast()
  const { data, error, reload } = useApi('/invoices')
  if (error) return <Failed error={error} onRetry={reload} />
  if (!data) return <PageLoader />
  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <PageHead back="/app/profile" title="My invoices" sub="A GST invoice for every payment." />
      {data.length === 0 ? <EmptyState icon={Receipt} title="No invoices yet" /> : null}
      {data.map((x) => (
        <button key={x.payment} onClick={() => openInvoice(x.payment).catch((e) => toast(errText(e), 'red'))} className="card p-4 flex items-center gap-3 text-left hover:border-line-strong">
          <FileText className="size-5 text-gold-text" />
          <span className="flex-1">
            <span className="block font-bold text-[14px]">{x.invoiceNo}</span>
            <span className="block text-[12px] text-muted">{PURPOSE[x.purpose]} · {dateShort(new Date(x.paidAt).getTime())}{x.status === 'refunded' ? ' · refunded' : ''}</span>
          </span>
          <span className="font-bold">{inr(x.total)}</span>
        </button>
      ))}
    </div>
  )
}

