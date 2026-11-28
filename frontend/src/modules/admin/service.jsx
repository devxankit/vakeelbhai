import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Send } from 'lucide-react'
import { BillRow, Button, Card, Chip, Field, Note, PageLoader, Pill, Table, useToast } from '@/components/ui'
import SecureImage from '@/components/SecureImage'
import { adminApi, adminFileUrl, errText } from '@/lib/api'
import { useLive } from '@/lib/live'
import { inr } from '@/lib/money'
import { ago, dateShort, time } from '@/lib/format'
import { PageHead } from '../portal/common'
import { useAdmin, useAdminData } from './context'
import { ReasonModal } from './money'

/** Help desk and e-Challan (SCOPE-OF-WORK 9 and 11). */

const when = (d) => (d ? dateShort(new Date(d).getTime()) + ', ' + time(new Date(d).getTime()) : '—')

export const TOPIC_LABEL = { payments: 'Payments', membership: 'Membership', services: 'Legal services', echallan: 'e-Challan', gst: 'GST filing', account: 'Account', technical: 'Technical issue', other: 'Other' }
const TICKET_TONE = { open: 'orange', answered: 'blue', closed: 'neutral' }
const TICKET_LABEL = { open: 'Waiting for us', answered: 'Answered', closed: 'Closed' }

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

function Pager({ meta, page, setPage }) {
  if (!meta || meta.pages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-[13px] text-muted mr-2">
        Page {meta.page} of {meta.pages} · {meta.total} total
      </span>
      <Button size="sm" variant="line" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Previous
      </Button>
      <Button size="sm" variant="line" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>
        Next
      </Button>
    </div>
  )
}

/* ================================================================== help desk */

export function HelpDesk() {
  const nav = useNavigate()
  const [status, setStatus] = useState('open')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const { data, meta, error, loading, reload } = useAdminData('/admin/support?status=' + status + '&page=' + page + (role ? '&role=' + role : ''))
  useLive('admin', { 'support:update': reload, reconnect: reload })
  if (error) return <LoadError error={error} onRetry={reload} />
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Help desk" sub="Tickets from clients and advocates. Reply here; they see it in the app and on the website." />
      <div className="flex flex-wrap gap-2">
        {[
          ['open', 'Waiting for us'],
          ['answered', 'Answered'],
          ['closed', 'Closed'],
          ['all', 'All'],
        ].map(([k, l]) => (
          <Chip key={k} active={status === k} onClick={() => (setStatus(k), setPage(1))}>
            {l}
          </Chip>
        ))}
        <span className="w-px bg-line mx-1" />
        {[
          ['', 'Everyone'],
          ['client', 'Clients'],
          ['advocate', 'Advocates'],
        ].map(([k, l]) => (
          <Chip key={k} active={role === k} onClick={() => (setRole(k), setPage(1))}>
            {l}
          </Chip>
        ))}
      </div>
      {loading && !data ? (
        <PageLoader />
      ) : (
        <Table
          head={['Ticket', 'From', 'Topic', 'Subject', 'Last message', 'Status']}
          empty={status === 'open' ? 'No tickets waiting. All caught up.' : 'No tickets here'}
          rowKey={(_r, i) => data[i].id}
          onRow={(_r, i) => nav('/admin/support/' + data[i].id)}
          rows={data.map((t) => ({
            cells: [
              <span key="n" className="font-bold flex items-center gap-2">
                {t.unread ? <span className="size-2 rounded-full bg-gold" aria-label="Unread" /> : null}
                {t.id}
              </span>,
              <span key="u">
                {t.user} <span className="text-muted">({t.role})</span>
              </span>,
              TOPIC_LABEL[t.topic] ?? t.topic,
              <span key="s" className="whitespace-normal max-w-[280px] block">
                {t.subject}
                {t.ref ? <span className="text-muted"> · {t.ref}</span> : null}
              </span>,
              ago(new Date(t.lastMessageAt).getTime()),
              <Pill key="p" tone={TICKET_TONE[t.status]}>
                {TICKET_LABEL[t.status]}
              </Pill>,
            ],
          }))}
        />
      )}
      <Pager meta={meta} page={page} setPage={setPage} />
    </div>
  )
}

const refLink = (ref) => (ref.startsWith('VB-') ? '/admin/requests/' + ref : ref.startsWith('EC-') ? '/admin/challans/' + ref : null)

export function HelpDeskTicket() {
  const { id } = useParams()
  const toast = useToast()
  const { data: t, error, loading, reload } = useAdminData('/admin/support/' + id)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [closing, setClosing] = useState(false)
  const end = useRef(null)
  useLive('admin', { 'support:update': (p) => p.number === id && reload(), reconnect: reload })
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [t?.messages?.length])
  if (error) return <LoadError error={error} onRetry={reload} />
  if (loading && !t) return <PageLoader />
  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      await adminApi('/admin/support/' + id + '/messages', { method: 'POST', body: { text: text.trim() } })
      setText('')
      reload()
    } catch (err) {
      toast(errText(err), 'red')
    } finally {
      setBusy(false)
    }
  }
  const link = t.ref ? refLink(t.ref) : null
  return (
    <div className="flex flex-col gap-5">
      <PageHead
        back="/admin/support"
        title={t.id + ' · ' + t.subject}
        sub={(TOPIC_LABEL[t.topic] ?? t.topic) + ' · opened ' + when(t.createdAt)}
        right={
          t.status !== 'closed' ? (
            <Button variant="line" onClick={() => setClosing(true)}>
              Close ticket
            </Button>
          ) : null
        }
      />
      <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
        <Card className="flex flex-col">
          <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto thin-scroll bg-page rounded-t-2xl">
            {t.messages.map((m) =>
              m.from === 'system' ? (
                <p key={m.id} className="self-center text-[12px] font-semibold text-muted bg-surface-2 rounded-full px-3 py-1 text-center">
                  {m.text}
                </p>
              ) : (
                <div key={m.id} className={m.from === 'support' ? 'self-end max-w-[80%] flex flex-col items-end' : 'self-start max-w-[80%] flex flex-col'}>
                  <div className={m.from === 'support' ? 'bg-ink text-white rounded-2xl rounded-tr-md px-3.5 py-2.5' : 'bg-white border border-line rounded-2xl rounded-tl-md px-3.5 py-2.5'}>
                    {m.kind === 'image' ? <SecureImage load={adminFileUrl} path={'/admin/support/' + t.id + '/messages/' + m.id + '/file'} alt="Photo from the user" className="max-w-[240px] rounded-lg" /> : null}
                    {m.text ? <p className="text-[14px] whitespace-pre-wrap break-words">{m.text}</p> : null}
                  </div>
                  <span className="text-[11px] text-muted mt-1">
                    {m.from === 'support' ? m.name : t.user?.name || 'User'} · {when(m.at)}
                  </span>
                </div>
              ),
            )}
            <div ref={end} />
          </div>
          <form onSubmit={send} className="border-t border-line p-3 flex gap-2 items-end">
            <Field as="textarea" className="flex-1" rows={2} placeholder={t.status === 'closed' ? 'Write to reopen this ticket' : 'Write a reply'} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Reply" />
            <Button type="submit" icon={Send} loading={busy} disabled={!text.trim()}>
              Send
            </Button>
          </form>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="p-4 flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-muted">Status</p>
            <Pill tone={TICKET_TONE[t.status]}>{TICKET_LABEL[t.status]}</Pill>
          </Card>
          {t.user ? (
            <Card className="p-4 flex flex-col gap-1.5">
              <p className="text-[12px] font-semibold text-muted">{t.role === 'advocate' ? 'Advocate' : 'Client'}</p>
              {t.role === 'advocate' ? (
                <Link to={'/admin/advocates/' + t.user.id} className="font-bold text-gold-text hover:underline">
                  {t.user.name || 'No name yet'}
                </Link>
              ) : (
                <p className="font-bold">{t.user.name || 'No name yet'}</p>
              )}
              <p className="text-[13px] text-muted">+91 {t.user.phone}</p>
              {t.user.status !== 'active' ? <Pill tone="red">{t.user.status}</Pill> : null}
            </Card>
          ) : null}
          {t.ref ? (
            <Card className="p-4 flex flex-col gap-1.5">
              <p className="text-[12px] font-semibold text-muted">About</p>
              {link ? (
                <Link to={link} className="font-bold text-gold-text hover:underline">
                  {t.ref}
                </Link>
              ) : (
                <p className="font-bold">{t.ref}</p>
              )}
            </Card>
          ) : null}
        </div>
      </div>
      <ReasonModal
        open={closing}
        title={'Close ' + t.id}
        intro="The user sees your note. They can write again to reopen it."
        label="Closing note for the user (optional)"
        minLength={0}
        action="Close ticket"
        onClose={() => setClosing(false)}
        onSubmit={async (note) => {
          await adminApi('/admin/support/' + id + '/close', { method: 'POST', body: note ? { note } : {} })
          setClosing(false)
          reload()
        }}
      />
    </div>
  )
}

/* ================================================================== e-Challan */

export const VEHICLE_LABEL = { bike: 'Bike / scooter', car: 'Car', auto: 'Auto-rickshaw', commercial: 'Truck / commercial', other: 'Other' }
const ORDER_TONE = { processing: 'orange', completed: 'green', refunded: 'red', awaiting_payment: 'neutral', cancelled: 'neutral' }
const ORDER_LABEL = { processing: 'To pay', completed: 'Paid to department', refunded: 'Refunded', awaiting_payment: 'Checkout open', cancelled: 'Cancelled' }

function dueText(o) {
  if (o.status !== 'processing' || !o.dueBy) return null
  const ms = new Date(o.dueBy).getTime() - Date.now()
  if (ms < 0) return 'Overdue by ' + Math.ceil(-ms / 3600000) + ' h'
  return Math.max(1, Math.floor(ms / 3600000)) + ' h left'
}

export function Challans() {
  const nav = useNavigate()
  const [status, setStatus] = useState('processing')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const { data, meta, error, loading, reload } = useAdminData('/admin/challans?status=' + status + '&page=' + page + (q.trim() ? '&q=' + encodeURIComponent(q.trim()) : ''))
  useLive('admin', { 'challan:update': reload, reconnect: reload })
  if (error) return <LoadError error={error} onRetry={reload} />
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="e-Challan" sub="Clients paid these challans to Vakeel Bhai. Pay each one to the department before its deadline, then record the receipt number. If it cannot be paid, refund in full." />
      <div className="flex flex-wrap gap-2 items-center">
        {[
          ['processing', 'To pay'],
          ['completed', 'Paid to department'],
          ['refunded', 'Refunded'],
          ['all', 'All'],
        ].map(([k, l]) => (
          <Chip key={k} active={status === k} onClick={() => (setStatus(k), setPage(1))}>
            {l}
          </Chip>
        ))}
        <input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Order, number plate or challan no." aria-label="Search" className="ml-auto h-10 w-64 rounded-xl border border-line-strong bg-white px-3 text-[14px]" />
      </div>
      {loading && !data ? (
        <PageLoader />
      ) : (
        <Table
          head={['Order', 'Client', 'Vehicle', 'Challans', 'To department', 'Total paid', 'Status']}
          empty={status === 'processing' ? 'Nothing to pay right now.' : 'No orders here'}
          rowKey={(_r, i) => data[i].id}
          onRow={(_r, i) => nav('/admin/challans/' + data[i].id)}
          rows={data.map((o) => ({
            cells: [
              <div key="n">
                <p className="font-bold">{o.id}</p>
                <p className="text-[12px] text-muted">{when(o.paidAt)}</p>
              </div>,
              o.client,
              <div key="v">
                <p className="font-semibold tracking-wide">{o.vehicle.number}</p>
                <p className="text-[12px] text-muted">{VEHICLE_LABEL[o.vehicle.type]}</p>
              </div>,
              o.items.length,
              <span key="d" className="font-semibold">
                {inr(o.amounts.challans)}
              </span>,
              inr(o.amounts.total),
              <span key="s" className="flex flex-col gap-1">
                <Pill tone={o.overdue ? 'red' : ORDER_TONE[o.status]}>{ORDER_LABEL[o.status]}</Pill>
                {dueText(o) ? <span className={o.overdue ? 'text-[11.5px] text-red font-semibold' : 'text-[11.5px] text-muted'}>{dueText(o)}</span> : null}
              </span>,
            ],
          }))}
        />
      )}
      <Pager meta={meta} page={page} setPage={setPage} />
    </div>
  )
}

export function ChallanDetail() {
  const { id } = useParams()
  const { isSuper } = useAdmin()
  const { data: o, error, loading, reload } = useAdminData('/admin/challans/' + id)
  const [completing, setCompleting] = useState(false)
  const [refunding, setRefunding] = useState(false)
  useLive('admin', { 'challan:update': (p) => p.number === id && reload(), reconnect: reload })
  if (error) return <LoadError error={error} onRetry={reload} />
  if (loading && !o) return <PageLoader />
  return (
    <div className="flex flex-col gap-5">
      <PageHead back="/admin/challans" title={o.id + ' · ' + o.vehicle.number} sub={VEHICLE_LABEL[o.vehicle.type] + ' · paid ' + when(o.paidAt)} />
      {o.status === 'processing' ? (
        <Note tone={o.overdue ? 'orange' : 'gold'} icon={AlertTriangle}>
          {o.overdue ? 'Overdue: the client was promised payment by ' + when(o.dueBy) + '.' : 'Pay these challans to the department by ' + when(o.dueBy) + ' (' + o.payWithinHours + ' hours from payment, as promised to the client).'}
        </Note>
      ) : null}
      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="flex flex-col gap-4">
          <Table
            head={['Challan no.', 'Offence', 'Date', 'Place', 'Amount']}
            rows={o.items.map((c) => ({
              cells: [
                <span key="n" className="font-semibold tabular-nums">
                  {c.id}
                </span>,
                <span key="o" className="whitespace-normal">
                  {c.offence}
                  {c.court ? <span className="block text-[11.5px] text-red">Sent to court</span> : null}
                </span>,
                c.date,
                <span key="p" className="whitespace-normal">
                  {c.place}
                </span>,
                <span key="a" className="font-bold">
                  {inr(c.amount)}
                </span>,
              ],
            }))}
          />
          {o.status === 'processing' ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setCompleting(true)}>Mark paid to department</Button>
              {isSuper ? (
                <Button variant="danger" onClick={() => setRefunding(true)}>
                  Cannot pay · refund client
                </Button>
              ) : null}
            </div>
          ) : null}
          {o.departmentRef ? <Note>Paid to the department on {when(o.completedAt)}. Receipt no. {o.departmentRef}.</Note> : null}
          {o.status === 'refunded' ? <Note tone="orange">Refunded in full. {o.note}</Note> : null}
        </div>
        <div className="flex flex-col gap-4">
          <Card className="p-4 flex flex-col gap-2.5">
            <p className="text-[12px] font-semibold text-muted">Bill</p>
            <BillRow label={'Challans (' + o.items.length + ')'} value={inr(o.amounts.challans)} />
            <BillRow label="Vakeel Bhai charge" value={inr(o.amounts.fee)} />
            <BillRow label={'GST on charge (' + o.amounts.gstPercent + '%)'} value={inr(o.amounts.gst)} />
            <BillRow label="Client paid" value={inr(o.amounts.total)} strong />
            {o.payment ? <p className="text-[12px] text-muted">Payment {o.payment.id} · {o.payment.provider} · {o.payment.status}</p> : null}
          </Card>
          <Card className="p-4 flex flex-col gap-1.5">
            <p className="text-[12px] font-semibold text-muted">Client</p>
            <p className="font-bold">{o.client.name}</p>
            {o.client.phone ? <p className="text-[13px] text-muted">+91 {o.client.phone}</p> : null}
          </Card>
          <Card className="p-4 flex flex-col gap-1.5">
            <p className="text-[12px] font-semibold text-muted">Status</p>
            <Pill tone={o.overdue ? 'red' : ORDER_TONE[o.status]}>{ORDER_LABEL[o.status]}</Pill>
            {dueText(o) ? <p className="text-[12.5px] text-muted">{dueText(o)}</p> : null}
          </Card>
        </div>
      </div>
      <ReasonModal
        open={completing}
        title={'Mark ' + o.id + ' paid'}
        intro={'Pay ' + inr(o.amounts.challans) + ' for ' + o.items.length + ' challan(s) on the department portal first, then enter its receipt or transaction number. The client sees it on their receipt.'}
        label="Department receipt number"
        minLength={4}
        multiline={false}
        action="Mark paid"
        onClose={() => setCompleting(false)}
        onSubmit={async (departmentRef) => {
          await adminApi('/admin/challans/' + id + '/complete', { method: 'POST', body: { departmentRef } })
          setCompleting(false)
          reload()
        }}
      />
      <ReasonModal
        open={refunding}
        title={'Refund ' + o.id}
        intro={inr(o.amounts.total) + ' (challans, charge and GST) goes back to the client’s original payment method. The challans become payable again. The client sees your reason.'}
        action="Refund in full"
        danger
        onClose={() => setRefunding(false)}
        onSubmit={async (reason) => {
          await adminApi('/admin/challans/' + id + '/refund', { method: 'POST', body: { reason } })
          setRefunding(false)
          reload()
        }}
      />
    </div>
  )
}
