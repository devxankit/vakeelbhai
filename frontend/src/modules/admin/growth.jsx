import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Download, ImagePlus, Plus, Send, Trash2 } from 'lucide-react'
import { BillRow, Button, Card, Chip, Field, Modal, Note, PageLoader, Pill, Select, Table, Toggle, useToast } from '@/components/ui'
import SecureImage from '@/components/SecureImage'
import { adminApi, adminFileUrl, errText, uploadForm } from '@/lib/api'
import { useLive } from '@/lib/live'
import { inr } from '@/lib/money'
import { dateShort, time } from '@/lib/format'
import { PageHead } from '../portal/common'
import { useAdmin, useAdminData } from './context'
import { ReasonModal } from './money'

/** Phase 4b/5 admin screens: offers and banners, GST filing, reports, content. */

const when = (d) => (d ? dateShort(new Date(d).getTime()) + ', ' + time(new Date(d).getTime()) : '—')
const dayInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')

function LoadError({ error, onRetry }) {
  return (
    <Card className="p-6 flex flex-col items-start gap-3">
      <p className="font-bold">Could not load this page</p>
      <p className="text-[14px] text-muted">{error}</p>
      <Button size="sm" variant="line" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  )
}

/** Download a file from the admin API (CSV, PDF) with the login token. */
export async function adminDownload(path, name) {
  const url = await adminFileUrl(path)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/* ================================================================== offers */

const blankOffer = () => ({ title: '', description: '', code: '', autoApply: false, kind: 'discount', valueType: 'percent', value: '10', max: '', minOrder: '0', scope: 'service', categories: [], firstServiceOnly: false, startAt: dayInput(new Date()), endAt: dayInput(new Date(Date.now() + 30 * 86400000)), usageLimit: '', perUserLimit: '1', active: true })

function OfferForm({ open, initial, categories, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState(blankOffer())
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setF(initial ? { ...blankOffer(), ...initial, code: initial.code ?? '', value: String(initial.value), max: initial.max == null ? '' : String(initial.max), minOrder: String(initial.minOrder ?? 0), usageLimit: initial.usageLimit == null ? '' : String(initial.usageLimit), perUserLimit: String(initial.perUserLimit ?? 1), startAt: dayInput(initial.startAt), endAt: dayInput(initial.endAt) } : blankOffer())
  }, [open, initial])
  if (!open) return null
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e })
  const save = async () => {
    setBusy(true)
    try {
      const body = {
        title: f.title,
        description: f.description,
        code: f.code.trim().toUpperCase(),
        autoApply: f.autoApply,
        kind: f.kind,
        valueType: f.valueType,
        value: Number(f.value),
        max: f.max === '' ? null : Number(f.max),
        minOrder: Number(f.minOrder || 0),
        scope: f.scope,
        categories: f.categories,
        firstServiceOnly: f.firstServiceOnly,
        startAt: new Date(f.startAt + 'T00:00:00+05:30').toISOString(),
        endAt: new Date(f.endAt + 'T23:59:59+05:30').toISOString(),
        usageLimit: f.usageLimit === '' ? null : Number(f.usageLimit),
        perUserLimit: Number(f.perUserLimit || 1),
        active: f.active,
      }
      if (initial) await adminApi('/admin/offers/' + initial.id, { method: 'PUT', body })
      else await adminApi('/admin/offers', { method: 'POST', body })
      toast('Offer saved', 'green')
      onSaved()
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open wide onClose={onClose} title={initial ? 'Edit offer' : 'New offer'} footer={<Button loading={busy} onClick={save}>Save offer</Button>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Title (shown to users)" value={f.title} onChange={set('title')} maxLength={80} placeholder="10% off your first consultation" />
        <Field label="Coupon code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} maxLength={20} placeholder="FIRST10" hint="Leave empty for an automatic offer" />
        <Field className="sm:col-span-2" label="Description (optional)" value={f.description} onChange={set('description')} maxLength={300} />
        <Select label="For" value={f.scope} onChange={set('scope')} options={[{ value: 'service', label: 'Legal services (clients)' }, { value: 'membership', label: 'Memberships (advocates)' }]} />
        <Select label="Type" value={f.kind} onChange={set('kind')} options={[{ value: 'discount', label: 'Discount at checkout' }, { value: 'cashback', label: 'Cashback to wallet after completion' }]} />
        <Select label="Value is" value={f.valueType} onChange={set('valueType')} options={[{ value: 'percent', label: 'Percent of the fee' }, { value: 'flat', label: 'Fixed amount (₹)' }]} />
        <Field label={f.valueType === 'percent' ? 'Value (%)' : 'Value (₹)'} type="number" min={0} value={f.value} onChange={set('value')} />
        <Field label="Maximum (₹)" type="number" min={0} value={f.max} onChange={set('max')} hint="Cap for percent offers. Empty = no cap" />
        <Field label="Minimum fee (₹)" type="number" min={0} value={f.minOrder} onChange={set('minOrder')} />
        <Field label="Starts" type="date" value={f.startAt} onChange={set('startAt')} />
        <Field label="Ends" type="date" value={f.endAt} onChange={set('endAt')} />
        <Field label="Total uses" type="number" min={1} value={f.usageLimit} onChange={set('usageLimit')} hint="Empty = unlimited" />
        <Field label="Uses per user" type="number" min={1} value={f.perUserLimit} onChange={set('perUserLimit')} />
      </div>
      {f.scope === 'service' ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-text-2">Categories (none selected = all)</p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Chip key={c.key} active={f.categories.includes(c.key)} onClick={() => setF({ ...f, categories: f.categories.includes(c.key) ? f.categories.filter((x) => x !== c.key) : [...f.categories, c.key] })}>
                {c.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          <Toggle checked={f.autoApply} onChange={(v) => setF({ ...f, autoApply: v })} label="Apply automatically" /> Apply automatically
        </label>
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          <Toggle checked={f.firstServiceOnly} onChange={(v) => setF({ ...f, firstServiceOnly: v })} label="First paid service only" /> First paid service only
        </label>
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" /> Active
        </label>
      </div>
      <Note tone="neutral">GST and the advocate's commission are calculated on the fee after the discount, so the advocate shares the discount.</Note>
    </Modal>
  )
}

export function OffersPage() {
  const { isSuper } = useAdmin()
  const [tab, setTab] = useState('offers')
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Offers and banners" sub="Coupons, automatic offers, cashback and the home-screen banners in the app and on the website." />
      <div className="flex gap-2">
        <Chip active={tab === 'offers'} onClick={() => setTab('offers')}>Offers</Chip>
        <Chip active={tab === 'banners'} onClick={() => setTab('banners')}>Banners</Chip>
      </div>
      {!isSuper ? <Note tone="neutral">Only a super admin can create or change offers and banners.</Note> : null}
      {tab === 'offers' ? <Offers /> : <Banners />}
    </div>
  )
}

function Offers() {
  const { isSuper } = useAdmin()
  const { data, error, loading, reload } = useAdminData('/admin/offers')
  const cats = useAdminData('/admin/categories')
  const [edit, setEdit] = useState(null)
  if (error) return <LoadError error={error} onRetry={reload} />
  if (loading && !data) return <PageLoader />
  return (
    <>
      {isSuper ? <Button icon={Plus} className="self-start" onClick={() => setEdit('new')}>New offer</Button> : null}
      <Table
        head={['Offer', 'Code', 'Value', 'For', 'Dates', 'Used', 'Given', 'Status']}
        empty="No offers yet"
        rowKey={(_r, i) => data[i].id}
        onRow={isSuper ? (_r, i) => setEdit(data[i]) : undefined}
        rows={data.map((o) => ({
          cells: [
            <span key="t" className="font-semibold whitespace-normal max-w-[220px] block">{o.title}</span>,
            o.code ? <span key="c" className="font-mono font-bold">{o.code}</span> : <Pill key="c" tone="blue">Automatic</Pill>,
            o.label,
            o.scope === 'service' ? (o.categories.length ? o.categories.join(', ') : 'All services') : 'Memberships',
            <span key="d" className="text-[12.5px]">{dateShort(new Date(o.startAt).getTime())} – {dateShort(new Date(o.endAt).getTime())}</span>,
            o.usedCount + (o.usageLimit ? ' / ' + o.usageLimit : ''),
            inr(o.totalDiscount + o.totalCashback),
            <Pill key="s" tone={o.live ? 'green' : 'neutral'}>{o.live ? 'Live' : o.active ? 'Scheduled / ended' : 'Off'}</Pill>,
          ],
        }))}
      />
      <OfferForm open={!!edit} initial={edit === 'new' ? null : edit} categories={cats.data ?? []} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), reload())} />
    </>
  )
}

function BannerForm({ open, initial, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setF(initial ? { ...initial, startAt: dayInput(initial.startAt), endAt: dayInput(initial.endAt) } : { title: '', sub: '', tag: '', link: { kind: 'offers', value: '' }, audience: 'client', startAt: '', endAt: '', active: true, order: 0 })
  }, [open, initial])
  if (!open || !f) return null
  const save = async () => {
    setBusy(true)
    try {
      const body = { title: f.title, sub: f.sub, tag: f.tag, link: f.link, audience: f.audience, startAt: f.startAt ? new Date(f.startAt + 'T00:00:00+05:30').toISOString() : null, endAt: f.endAt ? new Date(f.endAt + 'T23:59:59+05:30').toISOString() : null, active: f.active, order: Number(f.order) || 0 }
      if (initial) await adminApi('/admin/banners/' + initial.id, { method: 'PUT', body })
      else await adminApi('/admin/banners', { method: 'POST', body })
      onSaved()
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit banner' : 'New banner'} footer={<Button loading={busy} onClick={save}>Save banner</Button>}>
      <Field label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={70} />
      <Field label="Line under the title" value={f.sub} onChange={(e) => setF({ ...f, sub: e.target.value })} maxLength={100} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tag" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} maxLength={20} placeholder="New" />
        <Select label="Shown to" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} options={[{ value: 'client', label: 'Clients' }, { value: 'advocate', label: 'Advocates' }, { value: 'all', label: 'Everyone' }]} />
        <Select label="Tap opens" value={f.link.kind} onChange={(e) => setF({ ...f, link: { ...f.link, kind: e.target.value } })} options={[{ value: 'offers', label: 'Offers' }, { value: 'categories', label: 'Legal services' }, { value: 'category', label: 'One service' }, { value: 'challan', label: 'e-Challan' }, { value: 'gst', label: 'GST filing' }, { value: 'none', label: 'Nothing' }]} />
        {f.link.kind === 'category' ? <Field label="Category key" value={f.link.value} onChange={(e) => setF({ ...f, link: { ...f.link, value: e.target.value } })} placeholder="criminal" /> : <span />}
        <Field label="Starts (optional)" type="date" value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} />
        <Field label="Ends (optional)" type="date" value={f.endAt} onChange={(e) => setF({ ...f, endAt: e.target.value })} />
        <Field label="Order" type="number" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} />
        <label className="flex items-center gap-2 text-[14px] font-semibold self-end pb-3">
          <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" /> Active
        </label>
      </div>
    </Modal>
  )
}

function Banners() {
  const { isSuper } = useAdmin()
  const toast = useToast()
  const { data, error, loading, reload } = useAdminData('/admin/banners')
  const [edit, setEdit] = useState(null)
  if (error) return <LoadError error={error} onRetry={reload} />
  if (loading && !data) return <PageLoader />
  const upload = async (b, file) => {
    if (!file) return
    try {
      await adminApi('/admin/banners/' + b.id + '/image', { method: 'PUT', body: uploadForm(file) })
      reload()
    } catch (e) {
      toast(errText(e), 'red')
    }
  }
  const remove = async (b) => {
    if (!window.confirm('Delete the banner "' + b.title + '"?')) return
    await adminApi('/admin/banners/' + b.id, { method: 'DELETE' }).then(reload, (e) => toast(errText(e), 'red'))
  }
  return (
    <>
      {isSuper ? <Button icon={Plus} className="self-start" onClick={() => setEdit('new')}>New banner</Button> : null}
      <Note tone="neutral">A wide picture (about 1200 × 500) works best. Without a picture the app shows its standard artwork.</Note>
      <div className="grid md:grid-cols-2 gap-4">
        {data.length === 0 ? <p className="text-muted text-[14px]">No banners yet. The app shows its two standard banners until you add one.</p> : null}
        {data.map((b) => (
          <Card key={b.id} className="overflow-hidden">
            <div className="relative h-36 bg-ink">
              {b.hasImage ? <img src={'/api/banners/' + b.id + '/image?v=' + b.imageVersion} alt="" className="absolute inset-0 size-full object-cover opacity-80" /> : null}
              <div className="relative p-4 text-white flex flex-col gap-1 max-w-[70%]">
                {b.tag ? <span className="self-start rounded bg-gold px-1.5 text-[11px] font-bold text-ink">{b.tag}</span> : null}
                <p className="font-serif font-bold text-[18px] leading-tight">{b.title}</p>
                <p className="text-[12px] text-on-ink">{b.sub}</p>
              </div>
            </div>
            <div className="p-3 flex flex-wrap items-center gap-2">
              <Pill tone={b.active ? 'green' : 'neutral'}>{b.active ? 'Active' : 'Off'}</Pill>
              <span className="text-[12px] text-muted">→ {b.link.kind} · {b.audience}</span>
              {isSuper ? (
                <span className="ml-auto flex gap-1">
                  <label className="grid size-9 place-items-center rounded-lg hover:bg-page cursor-pointer" aria-label="Upload picture">
                    <ImagePlus className="size-4" />
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(b, e.target.files?.[0])} />
                  </label>
                  <Button size="sm" variant="line" onClick={() => setEdit(b)}>Edit</Button>
                  <button onClick={() => remove(b)} className="grid size-9 place-items-center rounded-lg hover:bg-page text-red" aria-label="Delete banner">
                    <Trash2 className="size-4" />
                  </button>
                </span>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
      <BannerForm open={!!edit} initial={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), reload())} />
    </>
  )
}

/* ================================================================== GST filing */

const GST_STATUS = { requested: ['Requested', 'orange'], in_review: ['In review', 'blue'], documents_needed: ['Documents needed', 'orange'], filed: ['Filed', 'green'], closed: ['Closed', 'neutral'] }

export function GstFilings() {
  const nav = useNavigate()
  const [status, setStatus] = useState('open')
  const [page, setPage] = useState(1)
  const { data, meta, error, loading, reload } = useAdminData('/admin/gst-filings?status=' + status + '&page=' + page)
  useLive('admin', { 'gst:update': reload, reconnect: reload })
  if (error) return <LoadError error={error} onRetry={reload} />
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="GST filing" sub="Requests from clients. Set the fee, ask for documents, file, and record the ARN. The client chats with you on the linked help-desk ticket." />
      <div className="flex flex-wrap gap-2">
        {[['open', 'Open'], ['requested', 'New'], ['in_review', 'In review'], ['documents_needed', 'Documents needed'], ['filed', 'Filed'], ['closed', 'Closed'], ['all', 'All']].map(([k, l]) => (
          <Chip key={k} active={status === k} onClick={() => (setStatus(k), setPage(1))}>{l}</Chip>
        ))}
      </div>
      {loading && !data ? (
        <PageLoader />
      ) : (
        <Table
          head={['Request', 'Client', 'Return', 'GSTIN / business', 'Period', 'Fee', 'Status']}
          empty="No GST requests here"
          rowKey={(_r, i) => data[i].id}
          onRow={(_r, i) => nav('/admin/gst-filings/' + data[i].id)}
          rows={data.map((g) => ({
            cells: [
              <div key="n"><p className="font-bold">{g.id}</p><p className="text-[12px] text-muted">{when(g.createdAt)}</p></div>,
              g.client,
              g.returnType,
              g.gstin || g.businessName || '—',
              g.period || '—',
              g.fee ? inr(g.fee.total) + (g.paid ? ' · paid' : ' · unpaid') : 'Not set',
              <Pill key="s" tone={GST_STATUS[g.status][1]}>{GST_STATUS[g.status][0]}</Pill>,
            ],
          }))}
        />
      )}
      {meta && meta.pages > 1 ? (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="line" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button size="sm" variant="line" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  )
}

export function GstFilingDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { isSuper } = useAdmin()
  const { data: g, error, loading, reload } = useAdminData('/admin/gst-filings/' + id)
  const [f, setF] = useState({ status: 'in_review', fee: '', filedRef: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [refunding, setRefunding] = useState(false)
  useLive('admin', { 'gst:update': (p) => p.number === id && reload() })
  useEffect(() => {
    if (g) setF({ status: g.status === 'requested' ? 'in_review' : g.status, fee: g.fee ? String(g.fee.fee) : '', filedRef: g.filedRef ?? '', note: '' })
  }, [g])
  if (error) return <LoadError error={error} onRetry={reload} />
  if (loading && !g) return <PageLoader />
  const save = async () => {
    setBusy(true)
    try {
      const body = { status: f.status, ...(f.note.trim() ? { note: f.note.trim() } : {}), ...(f.filedRef.trim() && f.status === 'filed' ? { filedRef: f.filedRef.trim() } : {}), ...(!g.paid && f.fee !== '' && Number(f.fee) !== g.fee?.fee ? { fee: Number(f.fee) } : {}) }
      await adminApi('/admin/gst-filings/' + id + '/update', { method: 'POST', body })
      toast('Updated. The client is notified.', 'green')
      reload()
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <PageHead back="/admin/gst-filings" title={g.id + ' · ' + g.returnType} sub={g.client.name + ' · +91 ' + g.client.phone} right={g.ticket ? <Button variant="line" onClick={() => nav('/admin/support/' + g.ticket)}>Open chat ({g.ticket})</Button> : null} />
      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        <div className="flex flex-col gap-4">
          <Card className="p-5 flex flex-col gap-2">
            <BillRow label="Return" value={g.returnType} />
            {g.gstin ? <BillRow label="GSTIN" value={g.gstin} /> : null}
            {g.businessName ? <BillRow label="Business" value={g.businessName} /> : null}
            {g.period ? <BillRow label="Period" value={g.period} /> : null}
            {g.note ? <p className="text-[14px] text-text-2 whitespace-pre-wrap mt-2">{g.note}</p> : null}
          </Card>
          <Card className="p-5 flex flex-col gap-3">
            <p className="font-bold">Documents ({g.docs.length})</p>
            {g.docs.length ? (
              <div className="flex flex-wrap gap-3">
                {g.docs.map((d) => (
                  <SecureImage key={d.id} load={adminFileUrl} path={'/admin/gst-filings/' + g.id + '/documents/' + d.id} alt={d.name || 'Document'} className="size-28 rounded-lg object-cover border border-line" onClick={async () => window.open(await adminFileUrl('/admin/gst-filings/' + g.id + '/documents/' + d.id), '_blank')} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">No documents yet. Ask for them by setting "Documents needed".</p>
            )}
          </Card>
          <Card className="p-5">
            <p className="font-bold mb-3">History</p>
            {g.events.map((e, i) => (
              <p key={i} className="text-[13px] py-1.5 border-t border-line-soft first:border-0">
                <span className="font-semibold">{GST_STATUS[e.status]?.[0] ?? (e.status === 'paid' ? 'Paid' : e.status)}</span> · {when(e.at)} {e.note ? <span className="text-muted">· {e.note}</span> : null}
              </p>
            ))}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card className="p-4 flex flex-col gap-3">
            <p className="text-[12px] font-semibold text-muted">Status</p>
            <Pill tone={GST_STATUS[g.status][1]}>{GST_STATUS[g.status][0]}</Pill>
            {g.fee ? <BillRow label={'Fee + GST ' + g.fee.gstPercent + '%'} value={inr(g.fee.total) + (g.paid ? ' · paid' : ' · unpaid')} /> : null}
            {g.filedRef ? <BillRow label="ARN" value={g.filedRef} /> : null}
          </Card>
          {g.status !== 'closed' ? (
            <Card className="p-4 flex flex-col gap-3">
              <p className="font-bold">Update</p>
              <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={Object.entries(GST_STATUS).map(([k, v]) => ({ value: k, label: v[0] }))} />
              {!g.paid ? <Field label="Service fee (₹, before GST)" type="number" min={0} value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} hint="The client pays fee + GST in the app" /> : null}
              {f.status === 'filed' ? <Field label="ARN (acknowledgement number)" value={f.filedRef} onChange={(e) => setF({ ...f, filedRef: e.target.value.toUpperCase() })} /> : null}
              <Field label="Note to the client (optional)" as="textarea" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} />
              <Button loading={busy} onClick={save}>Save and notify the client</Button>
              {g.paid && isSuper ? <Button variant="danger" onClick={() => setRefunding(true)}>Refund the fee and close</Button> : null}
            </Card>
          ) : null}
        </div>
      </div>
      <ReasonModal
        open={refunding}
        title={'Refund ' + g.id}
        intro={g.fee ? inr(g.fee.total) + ' goes back to the client and the request closes.' : ''}
        action="Refund"
        danger
        onClose={() => setRefunding(false)}
        onSubmit={async (reason) => {
          await adminApi('/admin/gst-filings/' + id + '/refund', { method: 'POST', body: { reason } })
          setRefunding(false)
          reload()
        }}
      />
    </div>
  )
}

/* ================================================================== reports */

export function Reports() {
  const toast = useToast()
  const today = new Date()
  const [from, setFrom] = useState(dayInput(new Date(today.getFullYear(), today.getMonth() - 11, 1)))
  const [to, setTo] = useState(dayInput(today))
  const [tab, setTab] = useState('summary')
  const q = '?from=' + from + '&to=' + to
  const { data, error, loading, reload } = useAdminData(tab === 'summary' ? '/admin/reports/summary' + q : '/admin/referrals')
  const dl = (kind) => adminDownload('/admin/reports/' + kind + '.csv' + q, 'vakeel-bhai-' + kind + '-' + from + '-to-' + to + '.csv').catch((e) => toast(errText(e), 'red'))
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Reports" sub="Earnings, commission, GST and memberships by month (India time). CSV files open in Excel." />
      <div className="flex flex-wrap items-end gap-3">
        <Chip active={tab === 'summary'} onClick={() => setTab('summary')}>Monthly summary</Chip>
        <Chip active={tab === 'referrals'} onClick={() => setTab('referrals')}>Referrals</Chip>
        {tab === 'summary' ? (
          <>
            <Field label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-auto" />
            <Field label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button variant="line" icon={Download} onClick={() => dl('gst')}>GST summary CSV</Button>
            <Button variant="line" icon={Download} onClick={() => dl('payments')}>All payments CSV</Button>
          </>
        ) : null}
      </div>
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : loading && !data ? (
        <PageLoader />
      ) : tab === 'summary' ? (
        <Table
          head={['Month', 'Collected', 'Service fees', 'Commission', 'Memberships', 'e-Challan charges', 'GST filing', 'Discounts', 'Cashback + referral', 'GST total', 'Refunds']}
          empty="No payments in this period"
          rowKey={(_r, i) => data.months[i].month}
          rows={data.months.map((m) => ({
            cells: [
              <span key="m" className="font-bold">{m.month}</span>,
              inr(m.services.collected + m.memberships.collected + m.challans.collected + m.gstFiling.collected),
              m.services.count + ' · ' + inr(m.services.fees),
              inr(m.commission),
              m.memberships.count + ' · ' + inr(m.memberships.base),
              m.challans.count + ' · ' + inr(m.challans.charges),
              m.gstFiling.count + ' · ' + inr(m.gstFiling.fees),
              inr(m.services.discounts),
              inr(m.cashback + m.referralRewards),
              <span key="g" className="font-semibold">{inr(m.gstTotal)}</span>,
              m.refunds.count ? m.refunds.count + ' · ' + inr(m.refunds.amount) : '—',
            ],
          }))}
        />
      ) : (
        <Table
          head={['Referrer', 'Friend', 'Joined with code', 'Reward']}
          empty="No referrals yet"
          rows={data.map((r) => ({ cells: [r.referrer, r.friend, when(r.at), r.rewarded ? inr(r.reward) : 'Waiting for first paid service'] }))}
        />
      )}
      <Note tone="neutral">GST total = GST on service fees, memberships, e-Challan charges and GST filing fees, plus GST on the commission kept from advocates. The CA must confirm the treatment before filing.</Note>
    </div>
  )
}

/* ================================================================== content */

export function ContentPage() {
  const { isSuper } = useAdmin()
  const toast = useToast()
  const { data, error, loading, reload } = useAdminData('/admin/content')
  const [tab, setTab] = useState('faqs')
  const [faqs, setFaqs] = useState([])
  const [doc, setDoc] = useState({ title: '', text: '' })
  const [busy, setBusy] = useState(false)
  const [b, setB] = useState({ audience: 'clients', title: '', body: '' })
  useEffect(() => {
    if (!data) return
    setFaqs(data.faqs)
    if (tab !== 'faqs' && tab !== 'broadcast') setDoc({ title: data[tab].title, text: data[tab].body.join('\n\n') })
  }, [data, tab])
  if (error) return <LoadError error={error} onRetry={reload} />
  if (loading && !data) return <PageLoader />
  const ro = !isSuper
  const saveFaqs = async () => {
    setBusy(true)
    try {
      await adminApi('/admin/content/faqs', { method: 'PUT', body: { faqs: faqs.filter((x) => x.q.trim() && x.a.trim()) } })
      toast('FAQs saved', 'green')
      reload()
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(false)
    }
  }
  const saveDoc = async () => {
    setBusy(true)
    try {
      await adminApi('/admin/content/' + tab, { method: 'PUT', body: { title: doc.title, body: doc.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) } })
      toast('Saved', 'green')
      reload()
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(false)
    }
  }
  const send = async () => {
    if (!window.confirm('Send "' + b.title + '" to all ' + b.audience + '?')) return
    setBusy(true)
    try {
      const r = await adminApi('/admin/notifications/broadcast', { method: 'POST', body: b })
      toast('Sent to ' + r.data.sent + ' people', 'green')
      setB({ ...b, title: '', body: '' })
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Content" sub="FAQs and legal pages shown in the app and on the website, and notifications to everyone." />
      <div className="flex flex-wrap gap-2">
        {[['faqs', 'FAQs'], ['terms', 'Terms'], ['privacy', 'Privacy'], ['refund', 'Refund policy'], ['broadcast', 'Send a notification']].map(([k, l]) => (
          <Chip key={k} active={tab === k} onClick={() => setTab(k)}>{l}</Chip>
        ))}
      </div>
      {ro ? <Note tone="neutral">Only a super admin can change content or send notifications.</Note> : null}
      {tab === 'faqs' ? (
        <Card className="p-5 flex flex-col gap-4">
          {data.faqsDraft ? <Note tone="gold">These are the draft FAQs. Saving makes them yours.</Note> : null}
          {faqs.map((x, i) => (
            <div key={i} className="grid gap-2 border-b border-line-soft pb-4">
              <div className="flex gap-2 items-end">
                <Field className="flex-1" label={'Question ' + (i + 1)} value={x.q} disabled={ro} onChange={(e) => setFaqs(faqs.map((y, k) => (k === i ? { ...y, q: e.target.value } : y)))} maxLength={200} />
                <Select label="Shown to" value={x.audience} disabled={ro} onChange={(e) => setFaqs(faqs.map((y, k) => (k === i ? { ...y, audience: e.target.value } : y)))} options={[{ value: 'all', label: 'Everyone' }, { value: 'client', label: 'Clients' }, { value: 'advocate', label: 'Advocates' }]} />
                {!ro ? <button onClick={() => setFaqs(faqs.filter((_, k) => k !== i))} className="grid size-11 place-items-center rounded-lg hover:bg-page text-red mb-0.5" aria-label="Remove"><Trash2 className="size-4" /></button> : null}
              </div>
              <Field as="textarea" label="Answer" value={x.a} disabled={ro} onChange={(e) => setFaqs(faqs.map((y, k) => (k === i ? { ...y, a: e.target.value } : y)))} maxLength={1500} />
            </div>
          ))}
          {!ro ? (
            <div className="flex gap-2">
              <Button variant="line" icon={Plus} onClick={() => setFaqs([...faqs, { q: '', a: '', audience: 'all' }])}>Add question</Button>
              <Button loading={busy} onClick={saveFaqs}>Save FAQs</Button>
            </div>
          ) : null}
        </Card>
      ) : tab === 'broadcast' ? (
        <Card className="p-5 flex flex-col gap-4 max-w-xl">
          <Select label="Send to" value={b.audience} onChange={(e) => setB({ ...b, audience: e.target.value })} options={[{ value: 'clients', label: 'All clients' }, { value: 'advocates', label: 'All advocates' }, { value: 'all', label: 'Everyone' }]} />
          <Field label="Title" value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} maxLength={120} />
          <Field as="textarea" label="Message" value={b.body} onChange={(e) => setB({ ...b, body: e.target.value })} maxLength={400} />
          <Note tone="neutral">Appears in the app's and website's notifications right away. Phone push notifications come once Firebase is set up.</Note>
          <Button icon={Send} disabled={ro || b.title.trim().length < 3 || b.body.trim().length < 5} loading={busy} onClick={send}>Send</Button>
        </Card>
      ) : (
        <Card className="p-5 flex flex-col gap-4">
          {data[tab].draft ? <Note tone="gold">This is draft text. Replace it with the final version from the client's lawyer.</Note> : <p className="text-[12.5px] text-muted">Last saved {when(data[tab].updatedAt)}</p>}
          <Field label="Title" value={doc.title} disabled={ro} onChange={(e) => setDoc({ ...doc, title: e.target.value })} maxLength={80} />
          <Field as="textarea" label="Text (leave an empty line between paragraphs)" value={doc.text} disabled={ro} onChange={(e) => setDoc({ ...doc, text: e.target.value })} className="[&_textarea]:min-h-[360px]" />
          {!ro ? <Button className="self-start" loading={busy} onClick={saveDoc}>Save</Button> : null}
        </Card>
      )}
    </div>
  )
}
