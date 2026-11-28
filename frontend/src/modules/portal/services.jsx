import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bike, Bus, Car, CircleCheck, Clock, Headset, Paperclip, Plus, Search, Send, ShieldCheck, Trash2, Truck, UserRound } from 'lucide-react'
import { BillRow, Button, Card, CheckBox, Chip, EmptyState, Field, Modal, Note, PageLoader, Pill, Select, Timeline, cx, useToast } from '@/components/ui'
import SecureImage from '@/components/SecureImage'
import { errText, uploadForm, userApi, userFileUrl } from '@/lib/api'
import { useLive } from '@/lib/live'
import { useGatewayPay } from '@/lib/pay'
import { inr } from '@/lib/money'
import { ago, dateShort, time } from '@/lib/format'
import { PageHead } from './common'

/**
 * Explore, e-Challan and help desk on the website. SAME FLOW AS THE APP
 * (mobile-app/src/screens/services.tsx and shared.tsx). Everything is on the real API.
 */

const when = (d) => (d ? dateShort(new Date(d).getTime()) + ', ' + time(new Date(d).getTime()) : '')

/** Load one API path with loading and error state; reload() to refresh. */
function useApi(path) {
  const [s, setS] = useState({ data: null, meta: null, error: '', loading: true })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    setS((x) => ({ ...x, loading: true, error: '' }))
    userApi(path)
      .then((j) => live && setS({ data: j.data, meta: j.meta ?? null, error: '', loading: false }))
      .catch((e) => live && setS({ data: null, meta: null, error: errText(e), loading: false }))
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
      <Button size="sm" variant="line" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  )
}

/* ================================================================== explore */

export function Explore({ meta }) {
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [typed, setTyped] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 300)
    return () => clearTimeout(t)
  }, [typed])
  const { data, error, loading, reload } = useApi('/client/advocates?limit=60' + (cat ? '&category=' + cat : '') + (q ? '&q=' + encodeURIComponent(q) : ''))
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Explore advocates" sub="Verified advocates on Vakeel Bhai. Our team matches you with the right one for your problem." />
      <label className="flex items-center gap-2 h-12 rounded-xl bg-surface-2 px-3 max-w-xl">
        <Search className="size-[18px] text-muted" />
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name" aria-label="Search advocates by name" className="flex-1 bg-transparent outline-none text-[14.5px]" />
      </label>
      <div className="flex gap-2 overflow-x-auto thin-scroll pb-1">
        <Chip active={!cat} onClick={() => setCat('')}>
          All
        </Chip>
        {meta.categories.map((c) => (
          <Chip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>
            {c.short ?? c.name}
          </Chip>
        ))}
      </div>
      {error ? (
        <Failed error={error} onRetry={reload} />
      ) : loading && !data ? (
        <PageLoader />
      ) : data.length === 0 ? (
        <EmptyState icon={UserRound} title="No advocates found" sub={q || cat ? 'Try another name or practice area.' : 'Verified advocates appear here once they join.'} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.map((a) => (
            <div key={a.id} className="card p-4 flex flex-col items-center text-center gap-2">
              {a.hasPhoto ? (
                <SecureImage load={userFileUrl} path={'/client/advocates/' + a.id + '/photo'} alt="" className="size-[84px] rounded-full object-cover ring-2 ring-gold" />
              ) : (
                <span className="grid size-[84px] place-items-center rounded-full bg-surface-2">
                  <UserRound className="size-9 text-muted" />
                </span>
              )}
              <p className="font-bold text-[14.5px] leading-tight">{a.name}</p>
              <p className="text-[12.5px] text-muted leading-tight">{a.designation}</p>
            </div>
          ))}
        </div>
      )}
      <Card className="p-4 flex flex-wrap items-center gap-3 bg-ink text-white border-ink">
        <ShieldCheck className="size-6 text-gold" />
        <p className="flex-1 min-w-[220px] text-[13.5px]">Every advocate here is Bar Council verified. Tell us your problem and our team assigns one from your district.</p>
        <Link to="/app/new">
          <Button size="sm">Request an advocate</Button>
        </Link>
      </Card>
    </div>
  )
}

/* ================================================================== e-Challan */

export const VEHICLE_TYPES = [
  { key: 'bike', label: 'Bike / scooter', icon: Bike },
  { key: 'car', label: 'Car', icon: Car },
  { key: 'auto', label: 'Auto-rickshaw', icon: Bus },
  { key: 'commercial', label: 'Truck / commercial', icon: Truck },
  { key: 'other', label: 'Other', icon: Car },
]
const typeOf = (k) => VEHICLE_TYPES.find((v) => v.key === k) ?? VEHICLE_TYPES[4]
const PLATE_RE = /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/
const plateOk = (p) => PLATE_RE.test(p.replace(/[\s.-]/g, '').toUpperCase())

const r2 = (n) => Math.round(n * 100) / 100
/** Preview only: the server calculates the real bill at checkout (same formula). */
function challanPreview(items, fee, gstRate) {
  const challans = r2(items.reduce((a, c) => a + c.amount, 0))
  const charge = r2((fee ?? 0) * items.length)
  const gst = r2(charge * gstRate)
  return { challans, charge, gst, total: r2(challans + charge + gst) }
}

const ORDER = {
  processing: { label: 'Paying to the department', tone: 'orange' },
  completed: { label: 'Paid to the department', tone: 'green' },
  refunded: { label: 'Refunded', tone: 'red' },
}

function AddVehicle({ onAdded, onCancel }) {
  const toast = useToast()
  const [type, setType] = useState('')
  const [plate, setPlate] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      onAdded((await userApi('/client/vehicles', { method: 'POST', body: { plate, type } })).data)
    } catch (err) {
      toast(errText(err), 'red')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={add} className="card p-5 flex flex-col gap-4">
      <div>
        <p className="font-bold text-[16px]">1. Vehicle type</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2.5">
          {VEHICLE_TYPES.map((v) => (
            <button type="button" key={v.key} onClick={() => setType(v.key)} aria-pressed={type === v.key} className={cx('rounded-xl border p-3 flex flex-col items-center gap-1.5 text-[12.5px] font-semibold', type === v.key ? 'border-ink bg-ink text-white' : 'border-line bg-white')}>
              <v.icon className={cx('size-6', type === v.key ? 'text-gold' : 'text-text-2')} />
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="font-bold text-[16px]">2. Number plate</p>
        <input
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          placeholder="MP 09 AB 1234"
          maxLength={15}
          aria-label="Number plate"
          disabled={!type}
          className="mt-2.5 h-14 w-full max-w-xs rounded-xl border-2 border-gold bg-white px-4 text-[20px] font-extrabold tracking-[2px] outline-none disabled:border-line disabled:bg-surface-2"
        />
        {plate && !plateOk(plate) ? <p className="text-[12px] text-orange mt-1.5">Enter the number as written on the plate, e.g. MP 09 AB 1234</p> : null}
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={!type || !plateOk(plate)} icon={Search}>
          Find challans
        </Button>
        {onCancel ? (
          <Button type="button" variant="line" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}

export function Challan({ meta }) {
  const nav = useNavigate()
  const toast = useToast()
  const { pay, dialog } = useGatewayPay()
  const vehicles = useApi('/client/vehicles')
  const [vid, setVid] = useState(null)
  const [adding, setAdding] = useState(false)
  const [tab, setTab] = useState('pending')
  const list = vehicles.data ?? []
  const v = list.find((x) => x.id === vid) ?? list[0]
  const challans = useApi(v && tab === 'pending' ? '/client/vehicles/' + v.id + '/challans' : null)
  const orders = useApi(tab === 'orders' ? '/client/challans/orders' : null)
  const [sel, setSel] = useState([])
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)
  useLive('user', { 'challan:update': () => (challans.reload(), orders.reload()) })
  useEffect(() => setSel([]), [v?.id])

  if (vehicles.error) return <Failed error={vehicles.error} onRetry={vehicles.reload} />
  if (vehicles.loading && !vehicles.data) return <PageLoader />
  const cfg = meta.challan ?? {}
  const due = (challans.data?.challans ?? []).filter((c) => c.state === 'due')
  const chosen = due.filter((c) => sel.includes(c.id))
  const bill = challanPreview(chosen, cfg.fee, meta.rates.gst)
  const hours = cfg.payWithinHours ?? 24

  const checkout = async () => {
    setBusy(true)
    try {
      const co = (await userApi('/client/challans/checkout', { method: 'POST', body: { vehicleId: v.id, challans: chosen.map((c) => c.id) } })).data
      await pay(co, { description: 'e-Challan ' + co.order.id })
      nav('/app/challan/orders/' + co.order.id)
    } catch (e) {
      if (e.code !== 'CANCELLED') toast(errText(e), 'red')
      challans.reload()
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    try {
      await userApi('/client/vehicles/' + v.id, { method: 'DELETE' })
      setRemoving(false)
      setVid(null)
      vehicles.reload()
    } catch (e) {
      toast(errText(e), 'red')
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <PageHead title="e-Challan" sub={'Add your vehicle, see its challans and pay. We pay the traffic department for you within ' + hours + ' hours.'} />
      {!cfg.lookup ? <Note tone="orange">e-Challan lookup is not connected yet. It starts once the e-Challan provider is set up.</Note> : null}
      {list.length === 0 || adding ? (
        <AddVehicle
          onAdded={(x) => {
            setAdding(false)
            vehicles.reload()
            setVid(x.id)
            setTab('pending')
          }}
          onCancel={list.length ? () => setAdding(false) : null}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {list.map((x) => {
              const T = typeOf(x.type)
              return (
                <button key={x.id} onClick={() => (setVid(x.id), setTab('pending'))} className={cx('rounded-xl px-4 py-2.5 text-left border flex items-center gap-2.5', x.id === v.id ? 'bg-ink text-white border-ink' : 'bg-white border-line')}>
                  <T.icon className={cx('size-5', x.id === v.id ? 'text-gold' : 'text-muted')} />
                  <span>
                    <span className="block font-extrabold tracking-wider text-[14px]">{x.number}</span>
                    <span className={cx('block text-[11.5px]', x.id === v.id ? 'text-on-ink-muted' : 'text-muted')}>{T.label}</span>
                  </span>
                </button>
              )
            })}
            <Button variant="line" icon={Plus} className="h-auto" onClick={() => setAdding(true)}>
              Add vehicle
            </Button>
          </div>
          <div className="flex gap-2 items-center">
            <Chip active={tab === 'pending'} onClick={() => setTab('pending')}>
              Challans
            </Chip>
            <Chip active={tab === 'orders'} onClick={() => setTab('orders')}>
              My payments
            </Chip>
            {tab === 'pending' ? (
              <button onClick={() => setRemoving(true)} className="ml-auto flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-red">
                <Trash2 className="size-4" /> Remove {v.number}
              </button>
            ) : null}
          </div>
          {tab === 'pending' ? (
            challans.error ? (
              <Failed error={challans.error} onRetry={challans.reload} />
            ) : challans.loading && !challans.data ? (
              <PageLoader />
            ) : challans.data.challans.length === 0 ? (
              <EmptyState icon={CircleCheck} title="No challans" sub="This vehicle has no pending challans." />
            ) : (
              <>
                {challans.data.challans.map((c) => {
                  const on = sel.includes(c.id)
                  const open = c.state === 'due'
                  return (
                    <button
                      key={c.id}
                      disabled={!open}
                      onClick={() => setSel(on ? sel.filter((x) => x !== c.id) : [...sel, c.id])}
                      aria-pressed={on}
                      className={cx('card p-4 flex gap-3 text-left', on && 'border-ink border-[1.5px]', !open && 'opacity-80 cursor-default')}>
                      {open ? <CheckBox checked={on} /> : <CircleCheck className={cx('size-[22px] shrink-0', c.state === 'paid' ? 'text-green' : 'text-orange')} />}
                      <span className="flex-1 flex flex-col gap-1">
                        <span className="flex justify-between gap-3 font-bold text-[14px]">
                          {c.offence} <span>{inr(c.amount)}</span>
                        </span>
                        <span className="text-[12px] text-muted">{c.place}</span>
                        <span className="text-[12px] text-muted">
                          {c.id} · {c.date}
                        </span>
                        {c.state === 'processing' ? (
                          <Pill tone="orange" className="self-start mt-1">
                            Paid · we are paying the department
                          </Pill>
                        ) : c.state === 'paid' ? (
                          <Pill tone="green" className="self-start mt-1">
                            Paid via Vakeel Bhai
                          </Pill>
                        ) : c.court ? (
                          <Pill tone="red" dot={false} className="self-start mt-1">
                            Sent to court
                          </Pill>
                        ) : null}
                        {c.order ? (
                          <Link to={'/app/challan/orders/' + c.order} onClick={(e) => e.stopPropagation()} className="text-[12.5px] font-semibold text-gold-text self-start">
                            View receipt ›
                          </Link>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
                {due.length ? (
                  <div className="card p-4 flex flex-col gap-3 sticky bottom-20 lg:bottom-4">
                    {chosen.length ? (
                      <div className="flex flex-col gap-1.5">
                        <BillRow label={'Challans (' + chosen.length + ')'} value={inr(bill.challans)} />
                        <BillRow label="Vakeel Bhai charge" value={cfg.fee == null ? '—' : inr(bill.charge)} />
                        <BillRow label={'GST on charge (' + r2(meta.rates.gst * 100) + '%)'} value={cfg.fee == null ? '—' : inr(bill.gst)} />
                      </div>
                    ) : null}
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-[19px] font-extrabold">{inr(bill.total)}</p>
                        <p className="text-[12px] text-muted">
                          {chosen.length} of {due.length} selected
                        </p>
                      </div>
                      <Button className="flex-1" size="lg" disabled={!chosen.length || cfg.fee == null} loading={busy} onClick={checkout}>
                        Pay challans
                      </Button>
                    </div>
                    {cfg.fee == null ? (
                      <Note tone="orange">e-Challan payments open soon.</Note>
                    ) : (
                      <Note tone="gold" icon={Clock}>
                        You pay Vakeel Bhai now. We pay your challan to the traffic department within {hours} hours and send you the receipt.
                      </Note>
                    )}
                  </div>
                ) : null}
              </>
            )
          ) : orders.error ? (
            <Failed error={orders.error} onRetry={orders.reload} />
          ) : orders.loading && !orders.data ? (
            <PageLoader />
          ) : orders.data.length === 0 ? (
            <EmptyState icon={CircleCheck} title="No challan payments yet" />
          ) : (
            orders.data.map((o) => (
              <Link key={o.id} to={'/app/challan/orders/' + o.id} className="card p-4 flex items-center gap-3 hover:border-line-strong">
                <span className="flex-1">
                  <span className="block font-bold text-[14px]">
                    {o.vehicle.number} · {o.items.length} challan{o.items.length === 1 ? '' : 's'}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {o.id} · paid {when(o.paidAt)}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="font-bold">{inr(o.amounts.total)}</span>
                  <Pill tone={ORDER[o.status]?.tone}>{ORDER[o.status]?.label ?? o.status}</Pill>
                </span>
              </Link>
            ))
          )}
        </>
      )}
      {dialog}
      <Modal
        open={removing}
        onClose={() => setRemoving(false)}
        title={'Remove ' + (v?.number ?? '') + '?'}
        footer={
          <Button variant="danger" onClick={remove}>
            Remove
          </Button>
        }>
        <p className="text-[14px] text-text-2">Your past payments and receipts stay in My payments. You can add the vehicle again any time.</p>
      </Modal>
    </div>
  )
}

/** After paying, and as the receipt: the order's steps (app: ChallanReceipt). */
export function ChallanOrder() {
  const { id } = useParams()
  const { data: o, error, loading, reload } = useApi('/client/challans/orders/' + id)
  useLive('user', { 'challan:update': (p) => p.number === id && reload() })
  if (error) return <Failed error={error} onRetry={reload} />
  if (loading && !o) return <PageLoader />
  const steps = [
    { title: 'Payment received', sub: when(o.paidAt), state: 'done' },
    {
      title: o.status === 'refunded' ? 'Could not be paid to the department' : 'Paying the traffic department',
      sub: o.status === 'processing' ? 'Within ' + o.payWithinHours + ' hours · by ' + when(o.dueBy) : o.status === 'completed' ? 'Paid ' + when(o.completedAt) : o.note ?? '',
      state: o.status === 'processing' ? 'now' : 'done',
    },
    o.status === 'refunded'
      ? { title: 'Refunded in full', sub: 'Back to your original payment method. It can take 5 to 7 working days to show.', state: 'done' }
      : { title: 'Challan cleared', sub: o.departmentRef ? 'Department receipt no. ' + o.departmentRef : 'You get the department receipt here', state: o.status === 'completed' ? 'done' : 'todo' },
  ]
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <PageHead back="/app/challan" title={'e-Challan payment ' + o.id} sub={o.vehicle.number} />
      <Card className="p-6 flex flex-col items-center gap-1.5 text-center">
        <CircleCheck className={cx('size-12', o.status === 'refunded' ? 'text-orange' : 'text-green')} />
        <p className="font-bold text-[18px]">{o.status === 'completed' ? 'Challan paid' : o.status === 'refunded' ? 'Refunded' : 'Payment successful'}</p>
        <p className="text-[28px] font-extrabold">{inr(o.amounts.total)}</p>
        {o.status === 'processing' ? (
          <Note tone="gold" icon={Clock} className="mt-2 text-left">
            Your e-Challan will be paid to the traffic department within {o.payWithinHours} hours. We will notify you with the receipt.
          </Note>
        ) : null}
      </Card>
      <Card className="p-5">
        <Timeline steps={steps} />
      </Card>
      <Card className="p-5 flex flex-col gap-2.5">
        {o.items.map((c) => (
          <div key={c.id} className="flex flex-col">
            <BillRow label={c.offence} value={inr(c.amount)} />
            <span className="text-[12px] text-muted">
              {c.id} · {c.date}
            </span>
          </div>
        ))}
        <span className="h-px bg-line my-1" />
        <BillRow label="Vakeel Bhai charge" value={inr(o.amounts.fee)} />
        <BillRow label={'GST on charge (' + o.amounts.gstPercent + '%)'} value={inr(o.amounts.gst)} />
        <BillRow label="Total paid" value={inr(o.amounts.total)} strong />
      </Card>
      <Link to={'/app/help/new?topic=echallan&ref=' + o.id} className="text-[13px] font-semibold text-gold-text self-start">
        Need help with this payment? Contact support ›
      </Link>
    </div>
  )
}

/* ================================================================== help desk */

export const TOPICS = [
  { value: 'payments', label: 'Payments' },
  { value: 'services', label: 'Legal services' },
  { value: 'membership', label: 'Membership' },
  { value: 'echallan', label: 'e-Challan' },
  { value: 'gst', label: 'GST filing' },
  { value: 'account', label: 'My account' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'other', label: 'Something else' },
]
const topicLabel = (k) => TOPICS.find((t) => t.value === k)?.label ?? k
const TICKET = { open: { label: 'Waiting for support', tone: 'orange' }, answered: { label: 'Support replied', tone: 'blue' }, closed: { label: 'Closed', tone: 'neutral' } }

/** base: '/app/help' (client) or '/advocate/help' (advocate). Advocates do not see the e-Challan topic. */
export function HelpDesk({ base, wa }) {
  const nav = useNavigate()
  const { data, error, loading, reload } = useApi('/support/tickets')
  useLive('user', { 'support:update': reload })
  if (error) return <Failed error={error} onRetry={reload} />
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <PageHead title="Help desk" sub="Write to the Vakeel Bhai team. We reply here, usually within a few hours." right={<Button icon={Plus} onClick={() => nav(base + '/new')}>New ticket</Button>} />
      {loading && !data ? (
        <PageLoader />
      ) : data.length === 0 ? (
        <EmptyState icon={Headset} title="No tickets yet" sub="Questions about payments, your requests or your account? Our team is here to help." action="Contact support" onAction={() => nav(base + '/new')} />
      ) : (
        data.map((t) => (
          <Link key={t.id} to={base + '/' + t.id} className="card p-4 flex items-center gap-3 hover:border-line-strong">
            {t.unread ? <span className="size-2.5 rounded-full bg-gold shrink-0" aria-label="New reply" /> : null}
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-[14px] truncate">{t.subject}</span>
              <span className="block text-[12px] text-muted">
                {t.id} · {topicLabel(t.topic)} · {ago(new Date(t.lastMessageAt).getTime())}
              </span>
            </span>
            <Pill tone={TICKET[t.status].tone}>{TICKET[t.status].label}</Pill>
          </Link>
        ))
      )}
      {wa ? (
        <a href={'https://wa.me/' + wa} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-gold-text self-start">
          Prefer WhatsApp? Chat with us ›
        </a>
      ) : null}
    </div>
  )
}

export function NewTicket({ base, role }) {
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const topics = TOPICS.filter((t) => role === 'client' || !['echallan', 'gst'].includes(t.value))
  const [f, setF] = useState({ topic: topics.some((t) => t.value === params.get('topic')) ? params.get('topic') : 'payments', subject: '', message: '' })
  const ref = /^(VB|EC|PAY|WD)-[A-Z0-9]{3,20}$/.test(params.get('ref') ?? '') ? params.get('ref') : null
  const [busy, setBusy] = useState(false)
  const ok = f.subject.trim().length >= 3 && f.message.trim().length >= 5
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const t = (await userApi('/support/tickets', { method: 'POST', body: { topic: f.topic, subject: f.subject.trim(), message: f.message.trim(), ...(ref ? { ref } : {}) } })).data
      nav(base + '/' + t.id, { replace: true })
    } catch (err) {
      toast(errText(err), 'red')
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <PageHead back={base} title="Contact support" sub="Tell us what happened. Please don't share OTPs or passwords." />
      <form onSubmit={submit} className="card p-5 flex flex-col gap-4">
        <Select label="Topic" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} options={topics} />
        {ref ? <Note tone="neutral">About {ref}</Note> : null}
        <Field label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={120} placeholder="e.g. Payment not showing" />
        <Field label="Message" as="textarea" rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={2000} placeholder="Describe the problem. Add request or payment numbers if you have them." />
        <Button type="submit" size="lg" loading={busy} disabled={!ok}>
          Send to support
        </Button>
      </form>
    </div>
  )
}

export function Ticket({ base }) {
  const { id } = useParams()
  const toast = useToast()
  const { data: t, error, loading, reload } = useApi('/support/tickets/' + id)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const end = useRef(null)
  useLive('user', { 'support:update': (p) => p.number === id && reload(), reconnect: reload })
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [t?.messages?.length])
  if (error) return <Failed error={error} onRetry={reload} />
  if (loading && !t) return <PageLoader />
  const path = '/support/tickets/' + id
  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await userApi(path + '/messages', { method: 'POST', body: { text: text.trim() } })
      setText('')
      reload()
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setSending(false)
    }
  }
  const sendImage = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 5 * 1024 * 1024) return toast('Choose a JPG, PNG or WebP photo up to 5 MB', 'red')
    setSending(true)
    try {
      await userApi(path + '/messages/image', { method: 'POST', body: uploadForm(f) })
      reload()
    } catch (err) {
      toast(errText(err), 'red')
    } finally {
      setSending(false)
    }
  }
  const close = async () => {
    try {
      await userApi(path + '/close', { method: 'POST' })
      reload()
    } catch (e) {
      toast(errText(e), 'red')
    }
  }
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <PageHead
        back={base}
        title={t.subject}
        sub={t.id + ' · ' + topicLabel(t.topic) + (t.ref ? ' · ' + t.ref : '')}
        right={
          t.status !== 'closed' ? (
            <Button variant="line" size="sm" onClick={close}>
              My problem is solved
            </Button>
          ) : null
        }
      />
      <div className="card overflow-hidden flex flex-col h-[600px] max-h-[75vh]">
        <div className="px-4 py-2.5 border-b border-line flex items-center gap-2 bg-white">
          <Headset className="size-5 text-gold-text" />
          <span className="font-bold text-[14px] flex-1">Vakeel Bhai support</span>
          <Pill tone={TICKET[t.status].tone}>{TICKET[t.status].label}</Pill>
        </div>
        <div className="flex-1 overflow-y-auto thin-scroll bg-chat p-4 flex flex-col gap-2">
          {t.messages.map((m) => {
            if (m.from === 'system')
              return (
                <p key={m.id} className="self-center text-center max-w-[92%] rounded-full bg-[#E9E5DC] px-3 py-1.5 text-[12px] font-semibold text-[#5F5B53]">
                  {m.text}
                </p>
              )
            const mine = m.from === 'user'
            return (
              <div key={m.id} className={cx('max-w-[80%]', mine ? 'self-end' : 'self-start')}>
                {!mine ? <p className="text-[11px] font-semibold text-gold-text mb-0.5">{m.name}</p> : null}
                <div className={cx('text-[14px] leading-relaxed whitespace-pre-wrap break-words', m.kind === 'image' ? 'p-1' : 'px-3 py-2', mine ? 'bg-ink text-white rounded-2xl rounded-tr-md' : 'bg-white border border-line rounded-2xl rounded-tl-md')}>
                  {m.kind === 'image' ? <SecureImage load={userFileUrl} path={path + '/messages/' + m.id + '/file'} alt="Photo" className="size-[200px] rounded-[11px] object-cover" /> : null}
                  {m.text}
                </div>
                <p className={cx('text-[10.5px] text-[#8A857A] mt-0.5', mine && 'text-right')}>{time(new Date(m.at).getTime())}</p>
              </div>
            )
          })}
          <div ref={end} />
        </div>
        <form
          className="border-t border-line p-3 flex items-end gap-2 bg-white"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}>
          <label className="grid size-11 place-items-center rounded-xl hover:bg-chat cursor-pointer shrink-0" aria-label="Attach a photo">
            <Paperclip className="size-5" />
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={sendImage} disabled={sending} />
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
            maxLength={2000}
            placeholder={t.status === 'closed' ? 'Write to reopen this ticket' : 'Type a message'}
            aria-label="Message"
            className="flex-1 min-h-11 max-h-32 resize-none rounded-[22px] border border-line-strong px-4 py-2.5 text-[14px] outline-none focus:border-ink"
          />
          <button type="submit" disabled={!text.trim() || sending} aria-label="Send" className="grid size-11 place-items-center rounded-full bg-ink text-gold disabled:bg-surface-2 disabled:text-faint shrink-0">
            <Send className="size-5" />
          </button>
        </form>
      </div>
    </div>
  )
}
