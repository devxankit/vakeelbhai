import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Lock, Search, UserCheck } from 'lucide-react'
import { ADMIN_REQ_STATUS, BillRow, Button, Card, Chip, Drawer, Note, PageLoader, Pill, Table, cx, useToast } from '@/components/ui'
import SecureImage from '@/components/SecureImage'
import { adminApi, adminFileUrl, errText } from '@/lib/api'
import { useLive } from '@/lib/live'
import { categoryOf } from '@/lib/catalog'
import { inr } from '@/lib/money'
import { ago, dateShort, phonePretty, time } from '@/lib/format'
import { PageHead } from '../portal/common'
import { useAdmin, useAdminData } from './context'
import { ReasonModal } from './money'

/**
 * Request queue (SCOPE-OF-WORK 12): new requests → assign a verified advocate (filtered by
 * category, district and active membership) → track; reassign when declined or not answered.
 */

const TABS = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'waiting', label: 'Waiting for advocate' },
  { key: 'active', label: 'Active' },
  { key: 'disputed', label: 'Disputed' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
]
const when = (d) => dateShort(new Date(d).getTime()) + ', ' + time(new Date(d).getTime())
const RESPONSE = { pending: ['blue', 'Waiting'], accepted: ['green', 'Accepted'], declined: ['red', 'Declined'], withdrawn: ['neutral', 'Reassigned'] }

export function Requests() {
  const nav = useNavigate()
  const [tab, setTab] = useState('unassigned')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const { data, meta, error, loading, reload } = useAdminData('/admin/requests?limit=25&tab=' + tab + '&page=' + page + (q ? '&q=' + encodeURIComponent(q) : ''))
  useLive('admin', { 'queue:update': reload, reconnect: reload })
  if (error)
    return (
      <Card className="p-6 flex flex-col items-start gap-3">
        <p className="font-bold">Could not load requests</p>
        <p className="text-[14px] text-muted">{error}</p>
        <Button size="sm" variant="line" onClick={reload}>
          Try again
        </Button>
      </Card>
    )
  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Request queue"
        sub="Oldest first. Open a request to assign a verified advocate."
        right={
          <label className="flex items-center gap-2 h-11 px-3 rounded-xl border border-line-strong bg-white w-full sm:w-64 focus-within:border-ink">
            <Search className="size-4 text-muted" />
            <input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Request no. or district" className="flex-1 bg-transparent outline-none text-[14px]" aria-label="Search requests" />
          </label>
        }
      />
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => (setTab(t.key), setPage(1))}>
            {t.label}
          </Chip>
        ))}
      </div>
      {loading && !data ? (
        <PageLoader />
      ) : (
        <Table
          head={['Request', 'Category', 'District', 'Client', 'Advocate', 'Status', tab === 'unassigned' || tab === 'waiting' ? 'Waiting' : 'Updated']}
          empty={tab === 'unassigned' ? 'Nothing waiting. New requests appear here.' : 'No requests here'}
          onRow={(_r, i) => nav('/admin/requests/' + data[i].id)}
          rowKey={(_r, i) => data[i].id}
          rows={data.map((r) => {
            const st = ADMIN_REQ_STATUS[r.status] ?? { label: r.status, tone: 'neutral' }
            return {
              cells: [
                <span key="n" className="font-bold">
                  {r.id}
                </span>,
                categoryOf(r.category).short,
                r.district,
                r.client,
                r.advocate ? 'Adv. ' + r.advocate : r.declines ? <span className="text-[12.5px] text-orange">{r.declines} declined</span> : '—',
                <Pill key="s" tone={st.tone}>
                  {st.label}
                </Pill>,
                ago(new Date(tab === 'unassigned' || tab === 'waiting' ? r.createdAt : r.updatedAt).getTime()),
              ],
            }
          })}
        />
      )}
      {meta && meta.pages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-[13px] text-muted mr-2">
            Page {meta.page} of {meta.pages}
          </span>
          <Button size="sm" variant="line" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button size="sm" variant="line" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function RequestDetail() {
  const { id } = useParams()
  const { data: r, error, loading, reload } = useAdminData('/admin/requests/' + id)
  const [assigning, setAssigning] = useState(false)
  useLive('admin', { 'queue:update': (p) => p.number === id && reload(), reconnect: reload })
  if (loading && !r) return <PageLoader />
  if (error)
    return (
      <Card className="p-6 flex flex-col items-start gap-3">
        <p className="font-bold">Could not load this request</p>
        <p className="text-[14px] text-muted">{error}</p>
        <Button size="sm" variant="line" onClick={reload}>
          Try again
        </Button>
      </Card>
    )
  const c = categoryOf(r.category)
  const st = ADMIN_REQ_STATUS[r.status] ?? { label: r.status, tone: 'neutral' }
  const canAssign = ['submitted', 'assigned'].includes(r.status)
  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/requests" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-text self-start">
        <ArrowLeft className="size-4" /> Request queue
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <img src={c.image} alt="" className="size-12 rounded-xl object-cover" />
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold">
            {r.id} · {c.name}
          </h1>
          <p className="text-[13.5px] text-muted">
            {r.district} · {r.lang} · submitted {when(r.createdAt)}
          </p>
        </div>
        <Pill tone={st.tone}>{st.label}</Pill>
        {canAssign ? (
          <Button icon={UserCheck} onClick={() => setAssigning(true)}>
            {r.status === 'assigned' ? 'Reassign' : 'Assign advocate'}
          </Button>
        ) : null}
      </div>
      {r.status === 'submitted' && r.assignments.some((a) => a.response === 'declined') ? <Note tone="orange">The last advocate declined: {r.assignments.filter((a) => a.response === 'declined').at(-1).reason}. Assign another one.</Note> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr] items-start">
        <div className="flex flex-col gap-4">
          <Card className="p-5 flex flex-col gap-2">
            <p className="font-bold text-[15px]">The client's request</p>
            <p className="text-[14px] text-text-2 leading-relaxed">{r.issue}</p>
            {r.docs.length ? (
              <div className="flex flex-wrap gap-2 mt-1">
                {r.docs.map((d) => (
                  <SecureImage key={d.id} load={adminFileUrl} path={'/admin/requests/' + r.id + '/attachments/' + d.id} alt="Document" className="size-20 rounded-lg object-cover" />
                ))}
              </div>
            ) : null}
          </Card>
          <Card className="p-5 flex flex-col gap-1.5">
            <p className="font-bold text-[15px] mb-1">People</p>
            <p className="text-[14px]">
              <span className="text-muted">Client: </span>
              <span className="font-semibold">{r.client?.name || '—'}</span> · +91 {phonePretty(r.client?.phone)} {r.client?.city ? '· ' + r.client.city : ''}
            </p>
            <p className="text-[14px]">
              <span className="text-muted">Advocate: </span>
              {r.advocate ? (
                <>
                  <span className="font-semibold">{r.advocate.name}</span> · +91 {phonePretty(r.advocate.phone)} {r.status === 'assigned' ? <span className="text-orange">(not answered yet)</span> : null}
                </>
              ) : (
                'not assigned'
              )}
            </p>
            <p className="text-[12px] text-muted mt-1">Phone numbers are for staff only. Clients and advocates never see each other's numbers.</p>
          </Card>
          {r.quote ? (
            <Card className="p-5 flex flex-col gap-1.5">
              <p className="font-bold text-[15px]">Fee quote</p>
              <p className="text-[24px] font-extrabold">{inr(r.quote.fee)}</p>
              <p className="text-[13.5px] text-text-2">{r.quote.scope}</p>
              <p className="text-[12px] text-muted">Sent {when(r.quote.at)} · valid till {dateShort(new Date(r.quote.validTill).getTime())}</p>
            </Card>
          ) : null}
          {r.status === 'disputed' ? <DisputeBox r={r} onDone={reload} /> : null}
          {r.payment ? (
            <Card className="p-5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <p className="font-bold text-[15px]">Payment {r.payment.id}</p>
                <Pill tone={r.payment.status === 'paid' ? 'green' : r.payment.status === 'refunded' ? 'orange' : 'neutral'}>{r.payment.status}</Pill>
              </div>
              <BillRow label="Advocate's fee" value={inr(r.payment.fee)} />
              <BillRow label="GST on the fee" value={inr(r.payment.gst)} />
              <BillRow label="Paid from wallet" value={inr(r.payment.wallet)} />
              <BillRow label={'Paid through ' + r.payment.provider} value={inr(r.payment.gateway)} />
              <span className="h-px bg-line my-1" />
              <BillRow label={'Platform commission (' + r.payment.commissionPercent + '%)'} value={inr(r.payment.commission)} />
              <BillRow label="GST on commission" value={inr(r.payment.gstOnCommission)} />
              <BillRow label="Advocate receives" value={inr(r.payment.advocateNet)} strong />
              <p className="text-[12px] text-muted mt-1">
                {r.payment.paidAt ? 'Paid ' + when(r.payment.paidAt) : ''}
                {r.doneAt ? ' · marked done ' + when(r.doneAt) : ''}
                {r.autoConfirmAt && r.status === 'done' ? ' · auto-confirms ' + when(r.autoConfirmAt) : ''}
                {r.completedAt ? ' · closed ' + when(r.completedAt) + (r.completedBy ? ' (' + r.completedBy + ')' : '') : ''}
              </p>
              {r.payment.refund ? <Note tone={r.payment.refund.status === 'failed' ? 'orange' : 'neutral'}>Refund {r.payment.refund.status}{r.payment.refund.error ? ': ' + r.payment.refund.error : ''}</Note> : null}
              {r.rating ? <p className="text-[13px]">Client rating: {'★'.repeat(r.rating)}{r.review ? ' · "' + r.review + '"' : ''}</p> : null}
            </Card>
          ) : null}
          <Card className="p-5">
            <p className="font-bold text-[15px] mb-2">Assignment history</p>
            {r.assignments.length === 0 ? (
              <p className="text-[14px] text-muted">Not assigned yet.</p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {r.assignments.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                    <span className="font-semibold">Adv. {a.advocate}</span>
                    <Pill tone={RESPONSE[a.response][0]} dot={false}>
                      {RESPONSE[a.response][1]}
                    </Pill>
                    <span className="text-muted">assigned {when(a.assignedAt)}</span>
                    {a.reason ? <span className="w-full text-text-2">Reason: {a.reason}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
        <Card className="overflow-hidden flex flex-col h-[600px]">
          <div className="px-4 py-3 border-b border-line flex items-center gap-2">
            <Lock className="size-4 text-muted" />
            <p className="font-bold text-[14px]">Chat (read-only for staff)</p>
          </div>
          <div className="flex-1 overflow-y-auto thin-scroll bg-chat p-4 flex flex-col gap-2">
            {r.messages.map((m) =>
              m.from === 'system' ? (
                <p key={m.id} className="self-center text-center rounded-full bg-[#E9E5DC] px-3 py-1.5 text-[12px] font-semibold text-[#5F5B53]">
                  {m.text}
                </p>
              ) : (
                <div key={m.id} className={cx('max-w-[80%]', m.from === 'advocate' ? 'self-end' : 'self-start')}>
                  <p className="text-[10.5px] font-semibold text-muted mb-0.5">{m.from === 'advocate' ? 'Advocate' : 'Client'}</p>
                  <div className={cx('rounded-2xl px-3 py-2 text-[14px]', m.from === 'advocate' ? 'bg-ink text-white' : 'bg-white border border-line')}>
                    {m.kind === 'quote' ? 'Fee quote: ' + inr(m.quote.fee) + ' · ' + m.quote.scope : null}
                    {m.kind === 'image' ? <SecureImage load={adminFileUrl} path={'/admin/requests/' + r.id + '/messages/' + m.id + '/file'} alt="Shared photo" className="size-40 rounded-lg object-cover" /> : null}
                    {m.kind === 'text' ? m.text : null}
                  </div>
                  <p className="text-[10.5px] text-[#8A857A] mt-0.5">{when(m.at)}</p>
                </div>
              ),
            )}
          </div>
        </Card>
      </div>
      {assigning ? <AssignDrawer r={r} onClose={() => setAssigning(false)} onDone={() => (setAssigning(false), reload())} /> : null}
    </div>
  )
}

/** Disputes (SCOPE-OF-WORK 12): release the held payment to the advocate, or refund the client in full. */
function DisputeBox({ r, onDone }) {
  const { isSuper } = useAdmin()
  const [mode, setMode] = useState(null)
  return (
    <Card className="p-5 flex flex-col gap-3 border-red">
      <p className="font-bold text-[15px] text-red">Dispute</p>
      <p className="text-[14px] text-text-2">"{r.dispute?.reason}"</p>
      <p className="text-[12px] text-muted">Raised {when(r.dispute?.at)}. Read the chat, talk to both sides, then decide. The payment stays on hold until you do.</p>
      {isSuper ? (
        <div className="flex gap-2">
          <Button className="flex-1" variant="green" onClick={() => setMode('release')}>
            Release to advocate
          </Button>
          <Button className="flex-1" variant="danger" onClick={() => setMode('refund')}>
            Refund client
          </Button>
        </div>
      ) : (
        <Note tone="neutral">A super admin decides disputes.</Note>
      )}
      <ReasonModal
        open={!!mode}
        title={mode === 'release' ? 'Release the payment' : 'Refund the client in full'}
        intro={
          mode === 'release'
            ? inr(r.payment?.advocateNet ?? 0) + ' goes to the advocate\'s wallet. Both sides see your note in the chat.'
            : inr(r.payment?.gateway ?? 0) + ' goes back to the original payment method' + (r.payment?.wallet ? ' and ' + inr(r.payment.wallet) + ' to the client\'s wallet' : '') + '. The advocate gets nothing for this request.'
        }
        label="Decision note (shown in the chat and kept in the audit log)"
        action={mode === 'release' ? 'Release' : 'Refund'}
        danger={mode === 'refund'}
        onClose={() => setMode(null)}
        onSubmit={async (note) => {
          await adminApi('/admin/requests/' + r.id + '/resolve', { method: 'POST', body: { outcome: mode, note } })
          setMode(null)
          onDone()
        }}
      />
    </Card>
  )
}

function AssignDrawer({ r, onClose, onDone }) {
  const toast = useToast()
  const { data, error, loading } = useAdminData('/admin/requests/' + r.id + '/eligible')
  const [busy, setBusy] = useState(null)
  const assign = async (a) => {
    setBusy(a.id)
    try {
      await adminApi('/admin/requests/' + r.id + '/assign', { method: 'POST', body: { advocateId: a.id } })
      toast('Assigned to Adv. ' + a.name + '. They can accept or decline.', 'green')
      onDone()
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(null)
    }
  }
  return (
    <Drawer open onClose={onClose} title={'Assign ' + r.id}>
      <p className="text-[13.5px] text-text-2">
        Verified advocates practising <b>{categoryOf(r.category).short}</b> with an active membership. Same district ({r.district}) first, then the fewest active cases. Advocates who declined this request are left out.
      </p>
      {loading && !data ? <PageLoader /> : null}
      {error ? <Note tone="orange">{error}</Note> : null}
      {data && data.length === 0 ? <Note tone="orange">No eligible advocate yet. Verify advocates in this practice area and give them a membership first.</Note> : null}
      {(data ?? []).map((a) => (
        <div key={a.id} className={cx('rounded-xl border p-3 flex items-center gap-3', a.current ? 'border-ink' : 'border-line')}>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[14.5px]">
              Adv. {a.name} {a.sameDistrict ? <Pill tone="green" dot={false}>Same district</Pill> : null}
            </p>
            <p className="text-[12.5px] text-muted">
              {a.district} · {a.years} yrs · {a.activeCases} active case{a.activeCases === 1 ? '' : 's'}
            </p>
            <p className="text-[12px] text-muted truncate">{a.courts}</p>
          </div>
          {a.current ? (
            <Pill tone="blue">Assigned</Pill>
          ) : (
            <Button size="sm" loading={busy === a.id} disabled={!!busy} onClick={() => assign(a)}>
              Assign
            </Button>
          )}
        </div>
      ))}
    </Drawer>
  )
}
