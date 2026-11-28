import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CircleCheck, Pencil, Plus, RotateCw, Search, ZoomIn, ZoomOut } from 'lucide-react'
import { Button, Card, Chip, Drawer, Field, Modal, Note, PageLoader, Pill, Table, Toggle, cx, useToast } from '@/components/ui'
import SecureImage from '@/components/SecureImage'
import { adminApi, adminFileUrl, errText } from '@/lib/api'
import { ago, dateShort, phonePretty, time } from '@/lib/format'
import { inr } from '@/lib/money'
import { PageHead } from '../portal/common'
import { useAdmin, useAdminData } from './context'

/* ---------------- shared ---------------- */

export const VERIF = {
  draft: { label: 'Registering', tone: 'neutral' },
  pending: { label: 'Pending review', tone: 'orange' },
  reupload: { label: 'Retake asked', tone: 'orange' },
  approved: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
}
const DOC_STATUS = { missing: ['neutral', 'Missing'], uploaded: ['blue', 'Uploaded'], approved: ['green', 'Approved'], reupload: ['orange', 'Retake asked'], rejected: ['red', 'Rejected'] }
const HISTORY = { submitted: 'Submitted for review', resubmitted: 'Sent back for review after retakes', approved: 'Approved', reupload_requested: 'Asked for retakes', rejected: 'Rejected', document_replaced: 'Replaced a document' }
const when = (d) => (d ? dateShort(new Date(d).getTime()) + ', ' + time(new Date(d).getTime()) : '—')

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

function SearchBox({ value, onChange, placeholder }) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => v !== value && onChange(v), 350)
    return () => clearTimeout(t)
  }, [v, value, onChange])
  return (
    <label className="flex items-center gap-2 h-11 px-3 rounded-xl border border-line-strong bg-white w-full sm:w-72 focus-within:border-ink">
      <Search className="size-4 text-muted" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="flex-1 bg-transparent outline-none text-[14px]" aria-label="Search" />
    </label>
  )
}

/** Block (with a reason) or unblock a client or advocate. */
function BlockModal({ target, kind, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setReason('')
    setError('')
  }, [target])
  if (!target) return null
  const blocking = target.status !== 'blocked'
  const go = async () => {
    setBusy(true)
    setError('')
    try {
      onDone((await adminApi('/admin/' + kind + '/' + target.id + '/status', { method: 'PATCH', body: blocking ? { status: 'blocked', reason } : { status: 'active' } })).data)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={(blocking ? 'Block ' : 'Unblock ') + (target.name || '+91 ' + phonePretty(target.phone))}
      footer={
        <Button variant={blocking ? 'danger' : 'gold'} onClick={go} loading={busy} disabled={blocking && reason.trim().length < 3}>
          {blocking ? 'Block account' : 'Unblock account'}
        </Button>
      }>
      {blocking ? (
        <>
          <p className="text-[14px] text-text-2">They are logged out everywhere at once and cannot log in until you unblock them.</p>
          <Field label="Reason (kept in the audit log)" as="textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </>
      ) : (
        <p className="text-[14px] text-text-2">They can log in again with their mobile number.</p>
      )}
      {error ? <Note tone="orange">{error}</Note> : null}
    </Modal>
  )
}

/* ---------------- advocates list (verification queue) ---------------- */

const ADV_TABS = [
  { key: 'pending', label: 'Pending review' },
  { key: 'reupload', label: 'Retake asked' },
  { key: 'approved', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'draft', label: 'Registering' },
  { key: 'blocked', label: 'Blocked' },
  { key: '', label: 'All' },
]

export function Advocates() {
  const nav = useNavigate()
  const [status, setStatus] = useState('pending')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const { data, meta, error, loading, reload } = useAdminData('/admin/advocates?limit=25&page=' + page + (status ? '&status=' + status : '') + (q ? '&q=' + encodeURIComponent(q) : ''))
  const cats = useAdminData('/admin/categories').data ?? []
  const catName = (k) => cats.find((c) => c.key === k)?.short ?? k

  if (error) return <LoadError error={error} onRetry={reload} />
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Advocates" sub="Pending reviews are listed oldest first. Open one to check the documents." right={<SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Name, mobile or enrolment no." />} />
      <div className="flex flex-wrap gap-2">
        {ADV_TABS.map((t) => (
          <Chip key={t.key} active={status === t.key} onClick={() => (setStatus(t.key), setPage(1))}>
            {t.label}
          </Chip>
        ))}
      </div>
      {loading && !data ? (
        <PageLoader />
      ) : (
        <Table
          head={['Advocate', 'District', 'Practice', 'Status', status === 'pending' ? 'Waiting' : 'Joined']}
          empty={status === 'pending' ? 'No advocates waiting for review' : 'No advocates here'}
          onRow={(_r, i) => nav('/admin/advocates/' + data[i].id)}
          rowKey={(_r, i) => data[i].id}
          rows={data.map((a) => ({
            cells: [
              <div key="n">
                <p className="font-bold">{a.name || 'No name yet'}</p>
                <p className="text-[12px] text-muted">
                  +91 {phonePretty(a.phone)}
                  {a.enrolmentNumber ? ' · ' + a.enrolmentNumber : ''}
                </p>
              </div>,
              a.district || '—',
              <span key="p" className="text-[13px]">{a.practice.map(catName).join(', ') || '—'}</span>,
              a.status === 'blocked' ? <Pill tone="red">Blocked</Pill> : <Pill tone={VERIF[a.verification].tone}>{VERIF[a.verification].label}</Pill>,
              status === 'pending' && a.submittedAt ? ago(new Date(a.submittedAt).getTime()) : dateShort(new Date(a.joinedAt).getTime()),
            ],
          }))}
        />
      )}
      <Pager meta={meta} page={page} setPage={setPage} />
    </div>
  )
}

/* ---------------- advocate detail + review ---------------- */

export function AdvocateDetail() {
  const { id } = useParams()
  const toast = useToast()
  const { data: d, error, loading, reload, setData } = useAdminData('/admin/advocates/' + id)
  const cats = useAdminData('/admin/categories').data ?? []
  const [viewer, setViewer] = useState(null)
  const [mode, setMode] = useState(null) // 'reupload' | 'reject'
  const [blockTarget, setBlockTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  if (loading && !d) return <PageLoader />
  if (error) return <LoadError error={error} onRetry={reload} />
  const v = d.verification
  const pending = v.status === 'pending'
  const catName = (k) => cats.find((c) => c.key === k)?.name ?? k

  const review = async (body) => {
    setBusy(true)
    try {
      await adminApi('/admin/advocates/' + id + '/review', { method: 'POST', body })
      setMode(null)
      toast({ approve: 'Advocate verified', reupload: 'Retake requested', reject: 'Verification rejected' }[body.decision], 'green')
      reload()
    } catch (e) {
      toast(errText(e), 'red')
      if (e.code === 'NOT_PENDING') reload()
    } finally {
      setBusy(false)
    }
  }

  const info = (k, val) => (
    <div className="flex gap-3 py-2 border-b border-line-soft last:border-0 text-[14px]">
      <span className="w-36 shrink-0 text-muted">{k}</span>
      <span className="flex-1 font-medium">{val || '—'}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-5 pb-24">
      <Link to="/admin/advocates" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-text self-start">
        <ArrowLeft className="size-4" /> Advocates
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        {d.profile.hasPhoto ? <SecureImage load={adminFileUrl} path={'/admin/advocates/' + id + '/photo'} alt="Photo" className="size-20 rounded-full object-cover ring-2 ring-gold cursor-zoom-in" onClick={() => setViewer({ path: '/admin/advocates/' + id + '/photo', title: 'Profile photo' })} /> : <span className="size-20 rounded-full bg-surface-2" />}
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold">{d.user.name || 'No name yet'}</h1>
          <p className="text-[13.5px] text-muted">
            +91 {phonePretty(d.user.phone)} · {d.user.email || 'no email'} · joined {dateShort(new Date(d.user.createdAt).getTime())}
          </p>
          <div className="flex gap-2 mt-1.5">
            <Pill tone={VERIF[v.status].tone}>{VERIF[v.status].label}</Pill>
            {d.user.status === 'blocked' ? <Pill tone="red">Blocked</Pill> : null}
          </div>
        </div>
        <Button variant={d.user.status === 'blocked' ? 'line' : 'danger'} size="sm" onClick={() => setBlockTarget({ ...d.user })}>
          {d.user.status === 'blocked' ? 'Unblock' : 'Block'}
        </Button>
      </div>
      {d.user.status === 'blocked' && d.user.blockedReason ? <Note tone="orange">Blocked: {d.user.blockedReason}</Note> : null}
      {v.reason && v.status !== 'pending' ? <Note tone="neutral">Last decision note: {v.reason}</Note> : null}
      {v.status === 'approved' ? <MembershipBox advocateId={id} membership={d.membership} onDone={reload} /> : null}

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5 items-start">
        <Card className="p-5">
          <h2 className="text-[16px] font-bold mb-2">Details</h2>
          {info('Enrolment no.', d.profile.enrolmentNumber)}
          {info('Practice', d.profile.practice.map(catName).join(', '))}
          {info('Experience', d.profile.experienceYears == null ? '' : d.profile.experienceYears + ' years')}
          {info('Courts', d.profile.courts)}
          {info('Address', d.profile.address)}
          {info('District', [d.profile.district, d.profile.state].filter(Boolean).join(', '))}
          {info('Submitted', v.submittedAt ? when(v.submittedAt) : '')}
          {info('Reviewed', v.reviewedAt ? when(v.reviewedAt) + (v.reviewedBy ? ' by ' + v.reviewedBy : '') : '')}
        </Card>
        <Card className="p-5">
          <h2 className="text-[16px] font-bold mb-3">Documents</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {d.documents.map((doc) => (
              <div key={doc.key} className="flex flex-col gap-1.5">
                {doc.status === 'missing' ? (
                  <span className="grid aspect-[4/3] place-items-center rounded-lg border-2 border-dashed border-line-strong text-[12px] text-muted">Not uploaded</span>
                ) : (
                  <button onClick={() => setViewer({ path: '/admin/advocates/' + id + '/documents/' + doc.key + '/file', title: doc.title, version: doc.version })} className="relative group" aria-label={'Open ' + doc.title}>
                    <SecureImage load={adminFileUrl} path={'/admin/advocates/' + id + '/documents/' + doc.key + '/file'} version={doc.version} alt={doc.title} className="w-full aspect-[4/3] rounded-lg object-cover bg-ink" />
                    <span className="absolute inset-0 grid place-items-center rounded-lg bg-ink/0 group-hover:bg-ink/30 transition">
                      <ZoomIn className="size-6 text-white opacity-0 group-hover:opacity-100" />
                    </span>
                  </button>
                )}
                <p className="text-[12.5px] font-bold leading-tight">{doc.title}</p>
                <Pill tone={DOC_STATUS[doc.status][0]} className="self-start">
                  {DOC_STATUS[doc.status][1]}
                  {doc.version > 1 ? ' · v' + doc.version : ''}
                </Pill>
                {doc.note ? <p className="text-[12px] text-orange">{doc.note}</p> : null}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-[16px] font-bold mb-2">History</h2>
        {d.history.length === 0 ? (
          <p className="text-[14px] text-muted">Not submitted yet.</p>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {d.history.map((h, i) => (
              <li key={i} className="text-[13.5px]">
                <span className="font-semibold">{HISTORY[h.action] ?? h.action}</span>
                {h.docKey ? ' · ' + (d.documents.find((x) => x.key === h.docKey)?.title ?? h.docKey) : ''}
                {h.by ? <span className="text-muted"> by {h.by}</span> : null}
                <span className="text-muted"> · {when(h.at)}</span>
                {h.reason ? <p className="text-text-2">{h.reason}</p> : null}
                {h.docNotes ? (
                  <ul className="text-text-2 list-disc pl-5">
                    {Object.entries(h.docNotes).map(([k, n]) => (
                      <li key={k}>
                        {d.documents.find((x) => x.key === k)?.title ?? k}: {n}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {pending ? (
        <div className="fixed bottom-0 inset-x-0 lg:left-[248px] z-20 border-t border-line bg-white px-4 sm:px-6 py-3 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[13px] text-muted">Check every document against the details before deciding.</span>
          <Button variant="danger" onClick={() => setMode('reject')} disabled={busy}>
            Reject
          </Button>
          <Button variant="line" onClick={() => setMode('reupload')} disabled={busy}>
            Ask for retakes
          </Button>
          <Button variant="green" icon={CircleCheck} loading={busy && !mode} onClick={() => review({ decision: 'approve' })}>
            Approve
          </Button>
        </div>
      ) : null}

      <DocViewer view={viewer} onClose={() => setViewer(null)} />
      <RetakeDrawer open={mode === 'reupload'} docs={d.documents} busy={busy} onClose={() => setMode(null)} onSubmit={(docs) => review({ decision: 'reupload', docs })} />
      <RejectModal open={mode === 'reject'} busy={busy} onClose={() => setMode(null)} onSubmit={(reason) => review({ decision: 'reject', reason })} />
      <BlockModal
        target={blockTarget}
        kind="advocates"
        onClose={() => setBlockTarget(null)}
        onDone={(u) => {
          setBlockTarget(null)
          setData({ ...d, user: { ...d.user, ...u } })
          reload()
        }}
      />
    </div>
  )
}

/**
 * Membership control (SCOPE-OF-WORK 12: grant or extend). Super admins only; always with a
 * reason, recorded in the audit log. Paid memberships come from the payments module.
 */
function MembershipBox({ advocateId, membership: m, onDone }) {
  const { isSuper } = useAdmin()
  const toast = useToast()
  const plans = useAdminData('/admin/plans').data ?? []
  const [open, setOpen] = useState(false)
  const [planId, setPlanId] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const grant = async () => {
    setBusy(true)
    try {
      await adminApi('/admin/advocates/' + advocateId + '/membership', { method: 'POST', body: { planId, reason: reason.trim() } })
      toast(m?.active ? 'Membership extended' : 'Membership granted', 'green')
      setOpen(false)
      setReason('')
      onDone()
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(false)
    }
  }
  const chosen = planId || plans[0]?.id || ''
  return (
    <Card className="p-5 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[220px]">
        <p className="font-bold text-[15px]">Membership</p>
        {m ? (
          <p className="text-[13.5px] text-text-2">
            {m.planName} · {m.memberId} · {m.active ? 'active till ' : 'expired on '}
            {dateShort(new Date(m.endAt).getTime())}
          </p>
        ) : (
          <p className="text-[13.5px] text-muted">No membership yet. Without one, this advocate cannot receive requests.</p>
        )}
      </div>
      {m?.active ? <Pill tone="green">Active</Pill> : <Pill tone="orange">Not active</Pill>}
      {isSuper ? (
        <Button size="sm" variant="line" onClick={() => setOpen(true)} disabled={!plans.length}>
          {m?.active ? 'Extend' : 'Grant membership'}
        </Button>
      ) : null}
      {isSuper && !plans.length ? <p className="w-full text-[12px] text-muted">Create a plan under Membership plans first.</p> : null}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={m?.active ? 'Extend membership' : 'Grant membership'}
        footer={
          <Button onClick={() => grant()} loading={busy} disabled={!chosen || reason.trim().length < 5}>
            {m?.active ? 'Extend' : 'Grant'}
          </Button>
        }>
        <p className="text-[14px] text-text-2">No payment is taken. {m?.active ? 'The new period starts when the current one ends.' : 'It starts today.'}</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-text-2">Plan</span>
          <select value={chosen} onChange={(e) => setPlanId(e.target.value)} className="h-[46px] rounded-xl border border-line-strong bg-white px-3 text-[15px]">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.durationMonths} {p.durationMonths === 1 ? 'month' : 'months'}
              </option>
            ))}
          </select>
        </label>
        <Field label="Reason (kept in the audit log)" as="textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Pilot advocate before online payments go live" />
      </Modal>
    </Card>
  )
}

/** Full-size document with zoom and rotate (SCOPE-OF-WORK 3.3). */
function DocViewer({ view, onClose }) {
  const [zoom, setZoom] = useState(1)
  const [rot, setRot] = useState(0)
  useEffect(() => {
    setZoom(1)
    setRot(0)
  }, [view])
  if (!view) return null
  return (
    <Modal open onClose={onClose} title={view.title} wide>
      <div className="flex gap-2">
        <Button size="sm" variant="line" icon={ZoomOut} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out" />
        <Button size="sm" variant="line" icon={ZoomIn} onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoom in" />
        <Button size="sm" variant="line" icon={RotateCw} onClick={() => setRot((r) => (r + 90) % 360)}>
          Rotate
        </Button>
        <span className="ml-auto self-center text-[12px] text-muted">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="overflow-auto thin-scroll bg-ink rounded-xl h-[60vh] grid place-items-center">
        <SecureImage load={adminFileUrl} path={view.path} version={view.version} alt={view.title} className="max-w-none transition-transform" style={{ transform: 'scale(' + zoom + ') rotate(' + rot + 'deg)', maxHeight: '58vh' }} />
      </div>
    </Modal>
  )
}

function RetakeDrawer({ open, docs, busy, onClose, onSubmit }) {
  const [notes, setNotes] = useState({})
  useEffect(() => setNotes({}), [open])
  if (!open) return null
  const uploaded = docs.filter((x) => x.status !== 'missing')
  const chosen = Object.entries(notes).filter(([, n]) => n !== undefined)
  const valid = chosen.length > 0 && chosen.every(([, n]) => n.trim().length >= 3)
  return (
    <Drawer
      open
      onClose={onClose}
      title="Ask for retakes"
      footer={
        <Button className="flex-1" onClick={() => onSubmit(Object.fromEntries(chosen.map(([k, n]) => [k, n.trim()])))} loading={busy} disabled={!valid}>
          Send to advocate
        </Button>
      }>
      <p className="text-[14px] text-text-2">Tick the documents to retake and say what is wrong. The others are approved, and the advocate retakes only these.</p>
      {uploaded.map((doc) => {
        const on = notes[doc.key] !== undefined
        return (
          <div key={doc.key} className={cx('rounded-xl border p-3 flex flex-col gap-2', on ? 'border-ink' : 'border-line')}>
            <label className="flex items-center gap-2.5 font-semibold text-[14px]">
              <input type="checkbox" checked={on} onChange={(e) => setNotes({ ...notes, [doc.key]: e.target.checked ? '' : undefined })} className="size-4 accent-[#0e0e0e]" />
              {doc.title}
            </label>
            {on ? <Field placeholder="e.g. The address is blurred. Retake in good light." value={notes[doc.key]} onChange={(e) => setNotes({ ...notes, [doc.key]: e.target.value })} maxLength={300} /> : null}
          </div>
        )
      })}
    </Drawer>
  )
}

function RejectModal({ open, busy, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  useEffect(() => setReason(''), [open])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reject verification"
      footer={
        <Button variant="danger" onClick={() => onSubmit(reason.trim())} loading={busy} disabled={reason.trim().length < 5}>
          Reject
        </Button>
      }>
      <p className="text-[14px] text-text-2">The advocate sees this reason. Use "Ask for retakes" instead if only some photos are unclear.</p>
      <Field label="Reason" as="textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. The enrolment number does not match the State Bar Council register." />
    </Modal>
  )
}

/* ---------------- clients ---------------- */

export function Clients() {
  const toast = useToast()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [blockTarget, setBlockTarget] = useState(null)
  const { data, meta, error, loading, reload } = useAdminData('/admin/clients?limit=25&page=' + page + (status ? '&status=' + status : '') + (q ? '&q=' + encodeURIComponent(q) : ''))
  if (error) return <LoadError error={error} onRetry={reload} />
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Clients" sub="Requests, wallet and referrals appear here as those modules go live." right={<SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Name, mobile, email or city" />} />
      <div className="flex gap-2">
        {[
          ['', 'All'],
          ['active', 'Active'],
          ['blocked', 'Blocked'],
        ].map(([k, l]) => (
          <Chip key={k} active={status === k} onClick={() => (setStatus(k), setPage(1))}>
            {l}
          </Chip>
        ))}
      </div>
      {loading && !data ? (
        <PageLoader />
      ) : (
        <Table
          head={['Client', 'City', 'Joined', 'Last login', 'Status', '']}
          empty="No clients found"
          rowKey={(_r, i) => data[i].id}
          rows={data.map((c) => ({
            cells: [
              <div key="n">
                <p className="font-bold">{c.name || 'No name yet'}</p>
                <p className="text-[12px] text-muted">
                  +91 {phonePretty(c.phone)}
                  {c.email ? ' · ' + c.email : ''}
                </p>
              </div>,
              [c.city, c.state].filter(Boolean).join(', ') || '—',
              dateShort(new Date(c.joinedAt).getTime()),
              c.lastLoginAt ? ago(new Date(c.lastLoginAt).getTime()) : '—',
              c.status === 'blocked' ? <Pill tone="red">Blocked</Pill> : <Pill tone="green">Active</Pill>,
              <Button key="b" size="sm" variant={c.status === 'blocked' ? 'line' : 'danger'} onClick={() => setBlockTarget(c)}>
                {c.status === 'blocked' ? 'Unblock' : 'Block'}
              </Button>,
            ],
          }))}
        />
      )}
      <Pager meta={meta} page={page} setPage={setPage} />
      <BlockModal
        target={blockTarget}
        kind="clients"
        onClose={() => setBlockTarget(null)}
        onDone={(u) => {
          setBlockTarget(null)
          toast(u.status === 'blocked' ? 'Client blocked' : 'Client unblocked', 'green')
          reload()
        }}
      />
    </div>
  )
}

/* ---------------- membership plans ---------------- */

const blankPlan = { name: '', durationMonths: '12', price: '', benefits: '', note: '', highlight: false, active: true }

export function Plans() {
  const { isSuper } = useAdmin()
  const toast = useToast()
  const { data, error, loading, reload, setData } = useAdminData('/admin/plans')
  const [edit, setEdit] = useState(null)
  if (loading && !data) return <PageLoader />
  if (error) return <LoadError error={error} onRetry={reload} />
  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Membership plans"
        sub="Advocates choose one after verification. A plan without a price shows as [PRICE] and cannot be bought."
        right={
          isSuper ? (
            <Button icon={Plus} onClick={() => setEdit({ ...blankPlan })}>
              Add plan
            </Button>
          ) : null
        }
      />
      {!isSuper ? <Note tone="neutral">Only a super admin can change plans and prices.</Note> : null}
      <Table
        head={['Plan', 'Duration', 'Price (before GST)', 'Visible', '']}
        empty="No plans yet. The client has not given plan names and prices."
        rowKey={(_r, i) => data[i].id}
        rows={data.map((p) => ({
          cells: [
            <div key="n">
              <p className="font-bold">
                {p.name} {p.highlight ? <Pill tone="ink" dot={false}>Best value</Pill> : null}
              </p>
              {p.note ? <p className="text-[12px] text-muted">{p.note}</p> : null}
            </div>,
            p.durationMonths + (p.durationMonths === 1 ? ' month' : ' months'),
            p.price == null ? <span className="text-muted">[PRICE] not set</span> : <span className="font-semibold">{inr(p.price)}</span>,
            p.active ? <Pill tone="green">Shown</Pill> : <Pill>Hidden</Pill>,
            isSuper ? (
              <Button key="e" size="sm" variant="line" icon={Pencil} onClick={() => setEdit({ ...p, durationMonths: String(p.durationMonths), price: p.price == null ? '' : String(p.price), benefits: p.benefits.join('\n') })}>
                Edit
              </Button>
            ) : null,
          ],
        }))}
      />
      <PlanDrawer
        value={edit}
        onClose={() => setEdit(null)}
        onSaved={(p, isNew) => {
          setData(isNew ? [...data, p] : data.map((x) => (x.id === p.id ? p : x)))
          setEdit(null)
          toast(isNew ? 'Plan added' : 'Plan saved', 'green')
        }}
      />
    </div>
  )
}

function PlanDrawer({ value, onClose, onSaved }) {
  const [f, setF] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setF(value)
    setError('')
  }, [value])
  if (!value || !f) return null
  const isNew = !value.id
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e })
  const save = async () => {
    setBusy(true)
    setError('')
    const body = { name: f.name, durationMonths: Number(f.durationMonths), price: f.price === '' ? null : Number(f.price), benefits: f.benefits.split('\n').map((s) => s.trim()).filter(Boolean), note: f.note, highlight: f.highlight, active: f.active }
    try {
      onSaved((await adminApi(isNew ? '/admin/plans' : '/admin/plans/' + value.id, { method: isNew ? 'POST' : 'PATCH', body })).data, isNew)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'Add plan' : 'Edit ' + value.name}
      footer={
        <Button className="flex-1" onClick={save} loading={busy} disabled={!f.name || !f.durationMonths}>
          {isNew ? 'Add plan' : 'Save'}
        </Button>
      }>
      <Field label="Name" value={f.name} onChange={set('name')} maxLength={40} placeholder="Yearly" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Duration (months)" type="number" min={1} max={60} value={f.durationMonths} onChange={set('durationMonths')} />
        <Field label="Price before GST (₹)" type="number" min={0} step="0.01" value={f.price} onChange={set('price')} hint="Empty = [PRICE]" />
      </div>
      <Field label="Short note" value={f.note} onChange={set('note')} maxLength={80} placeholder="Renews every month" />
      <Field label="Benefits" as="textarea" value={f.benefits} onChange={set('benefits')} hint="One per line" />
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold">Mark as best value</span>
        <Toggle checked={f.highlight} onChange={set('highlight')} label="Best value" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold">Shown to advocates</span>
        <Toggle checked={f.active} onChange={set('active')} label="Shown" />
      </div>
      {error ? <Note tone="orange">{error}</Note> : null}
    </Drawer>
  )
}
