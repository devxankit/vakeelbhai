import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, Briefcase, ChevronRight, Clock, FileCheck, IdCard, Landmark, LayoutDashboard, LogOut, MessageCircle, ShieldCheck, User, Wallet, Headset } from 'lucide-react'
import { BillRow, Button, Card, CASE_STATUS, Chip, EmptyState, Field, Modal, Note, PageLoader, Pill, SectionTitle, Stat, Timeline, cx, useToast } from '@/components/ui'
import SecureImage from '@/components/SecureImage'
import { categoryOf, DECLINE_REASONS, IMG } from '@/lib/catalog'
import { errText, userApi, userFileUrl } from '@/lib/api'
import { useLive } from '@/lib/live'
import { advocatePayout, inr } from '@/lib/money'
import { ago, dateShort } from '@/lib/format'
import { PageHead, PortalShell } from './common'
import LiveChat from './LiveChat'
import { HelpDesk, NewTicket, Ticket } from './services'
import { Plans } from './AdvocatePortal'

/**
 * Advocate area after verification + active membership. SAME FLOW AS THE APP
 * (mobile-app/src/screens/advocate.tsx): tabs Dashboard · Cases · Wallet · Profile,
 * case detail (accept / decline with a reason), send quote, chat, membership card.
 * Wallet, earnings and "mark work as done" arrive with the payments module.
 */

const NAV = [
  { to: '/advocate', end: true, label: 'Dashboard', icon: LayoutDashboard, mobile: true },
  { to: '/advocate/cases', label: 'Cases', icon: Briefcase, mobile: true },
  { to: '/advocate/wallet', label: 'Wallet', icon: Wallet, mobile: true },
  { to: '/advocate/help', label: 'Help desk', icon: Headset },
  { to: '/advocate/profile', label: 'Profile', icon: User, mobile: true },
]

const catOf = (meta, key) => ({ ...categoryOf(key), ...meta?.categories.find((c) => c.key === key) })
const ACTIVE = ['accepted', 'quoted', 'paid', 'done', 'disputed']
const STATUS = { ...CASE_STATUS, new: { label: 'New request', tone: 'gold' }, declined: { label: 'Declined', tone: 'neutral' } }

/** Commission for a category: its own rate if the admin set one, else the global rate. */
const ratesFor = (meta, category) => ({ commission: meta.categories.find((c) => c.key === category)?.commission ?? meta.rates.commission, gst: meta.rates.gst })
const pct = (f) => Math.round(f * 10000) / 100 + '%'

export default function AdvocateArea({ me, meta, onLogout, onRefresh }) {
  const loc = useLocation()
  const title = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label ?? 'Advocate'
  const cases = useCases()
  const user = { name: 'Adv. ' + me.user.name, photo: null }
  return (
    <PortalShell nav={NAV} user={user} userId={me.user.id} title={title} roleLabel="Verified advocate" onLogout={onLogout}>
      <Routes>
        <Route index element={<Dashboard me={me} meta={meta} cases={cases} />} />
        <Route path="cases" element={<Cases meta={meta} cases={cases} />} />
        <Route path="cases/:id" element={<CaseDetail meta={meta} onChanged={cases.reload} />} />
        <Route path="cases/:id/quote" element={<SendQuote meta={meta} onChanged={cases.reload} />} />
        <Route path="membership" element={<MembershipCardPage me={me} />} />
        <Route path="wallet" element={<WalletPage />} />
        <Route path="wallet/withdraw" element={<Withdraw />} />
        <Route path="wallet/bank" element={<Bank me={me} />} />
        <Route path="membership/plans" element={<Plans me={me} meta={meta} renew onBack={() => window.history.back()} onPaid={onRefresh} />} />
        <Route path="profile" element={<Profile me={me} meta={meta} onLogout={onLogout} />} />
        <Route path="help" element={<HelpDesk base="/advocate/help" wa={meta.supportWhatsApp} />} />
        <Route path="help/new" element={<NewTicket base="/advocate/help" role="advocate" />} />
        <Route path="help/:id" element={<Ticket base="/advocate/help" />} />
        <Route path="*" element={<Navigate to="/advocate" replace />} />
      </Routes>
    </PortalShell>
  )
}

/** All my cases, refreshed live when the admin assigns one or a case changes. */
function useCases() {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    try {
      setList((await userApi('/advocate/cases?tab=all')).data)
      setError('')
    } catch (e) {
      setError(errText(e))
    }
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  useLive('user', { 'case:new': reload, 'request:update': reload, reconnect: reload })
  const groups = useMemo(() => {
    const l = list ?? []
    return { new: l.filter((c) => c.status === 'new'), active: l.filter((c) => ACTIVE.includes(c.status)), done: l.filter((c) => ['completed', 'declined'].includes(c.status)) }
  }, [list])
  return { list, groups, error, reload }
}

function ClientAvatar({ size = 38 }) {
  return (
    <span className="grid place-items-center rounded-full bg-surface-2 shrink-0" style={{ width: size, height: size }}>
      <User className="text-[#4A4740]" style={{ width: size * 0.47, height: size * 0.47 }} />
    </span>
  )
}

function CaseRow({ c, meta }) {
  const st = STATUS[c.status] ?? STATUS.new
  return (
    <Link to={'/advocate/cases/' + c.id} className="flex items-center gap-3 py-3 border-t border-line-soft first:border-0">
      <ClientAvatar />
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-semibold truncate">
          {c.clientName} · {catOf(meta, c.category).short}
        </span>
        <span className="block text-[12px] font-medium text-muted truncate">
          {c.title} · {c.id}
        </span>
      </span>
      <Pill tone={st.tone} dot={false}>
        {st.label}
      </Pill>
    </Link>
  )
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/* ---------------- dashboard (app: AdvDashboard) ---------------- */

function Dashboard({ me, meta, cases }) {
  const nav = useNavigate()
  const toast = useToast()
  const { w } = useAdvWallet()
  const m = me.membership
  const { groups } = cases
  const accept = async (id) => {
    try {
      await userApi('/advocate/cases/' + id + '/accept', { method: 'POST' })
      cases.reload()
      nav('/advocate/cases/' + id)
    } catch (e) {
      toast(errText(e), 'red')
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-ink p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {me.hasPhoto ? <SecureImage load={userFileUrl} path="/advocate/photo" alt="" className="size-11 rounded-full object-cover ring-2 ring-gold" /> : <ClientAvatar size={44} />}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-on-ink-muted">{greeting()}</p>
            <p className="text-[17px] font-bold text-white truncate">Adv. {me.user.name}</p>
          </div>
        </div>
        <Link to="/advocate/membership" className="flex items-center gap-3 rounded-xl border border-ink-line bg-ink-2 p-2.5">
          <img src={IMG.emblem} alt="" className="size-[26px]" />
          <span className="flex-1">
            <span className="block text-[13px] font-bold text-gold">
              {m.planName} member · {m.memberId}
            </span>
            <span className="block text-[12px] font-medium text-on-ink-muted">Active till {dateShort(new Date(m.endAt).getTime())} · View card</span>
          </span>
          <ChevronRight className="size-[18px] text-on-ink-muted" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Stat label="Wallet balance" value={w ? inr(w.balance) : '—'} sub={w?.hold ? inr(w.hold) + ' on hold' : undefined} onClick={() => nav('/advocate/wallet')} />
        <Stat label="Earned this month" value={w ? inr(w.month.earned) : '—'} sub={w ? w.month.cases + ' completed case' + (w.month.cases === 1 ? '' : 's') : undefined} />
        <Stat label="Active cases" value={String(groups.active.length)} onClick={() => nav('/advocate/cases')} />
        <Stat label="Rating" value="—" sub="After your first completed case" />
      </div>

      <section className="flex flex-col gap-2.5">
        <SectionTitle title={'New requests · ' + groups.new.length} action="All cases" onAction={() => nav('/advocate/cases')} />
        {groups.new.length === 0 ? (
          <Card className="p-4 text-[13px] text-muted">No new requests right now. Our team assigns requests that match your practice areas and district.</Card>
        ) : (
          groups.new.map((c) => {
            const cat = catOf(meta, c.category)
            return (
              <Card key={c.id} className="p-4 border-[1.5px] border-ink flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold" style={{ background: cat.tone.bg, color: cat.tone.fg }}>
                    {cat.short}
                  </span>
                  <span className="text-[12px] font-medium text-muted">
                    {c.id} · assigned by admin {c.assignedAt ? ago(new Date(c.assignedAt).getTime()) : ''}
                  </span>
                </div>
                <p className="text-[15px] font-bold">{c.title}</p>
                <p className="text-[13px] text-text-2 leading-relaxed">
                  "{c.issue}" · {c.district} · {c.lang}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => accept(c.id)}>
                    Accept
                  </Button>
                  <Button size="sm" variant="line" onClick={() => nav('/advocate/cases/' + c.id)}>
                    View
                  </Button>
                </div>
              </Card>
            )
          })
        )}
      </section>

      <Card className="px-4 py-1">
        <div className="pt-3 pb-2">
          <SectionTitle title="Active cases" action={groups.active.length ? 'See all' : undefined} onAction={() => nav('/advocate/cases')} />
        </div>
        {groups.active.length === 0 ? <p className="text-[13px] text-muted pb-3">Cases you accept appear here.</p> : groups.active.slice(0, 4).map((c) => <CaseRow key={c.id} c={c} meta={meta} />)}
      </Card>

      <Card className="p-4 flex flex-col gap-2">
        <p className="text-[15px] font-bold">This month's earnings</p>
        <BillRow label={'Credited from ' + (w?.month.cases ?? 0) + ' completed case' + (w?.month.cases === 1 ? '' : 's')} value={inr(w?.month.earned ?? 0)} strong />
        <p className="text-[13px] text-muted">
          After platform commission ({pct(meta.rates.commission)}) and GST on the commission ({pct(meta.rates.gst)}). Open a wallet entry to see the breakup for that case.
        </p>
      </Card>
    </div>
  )
}

/* ---------------- cases (app: AdvCases) ---------------- */

function Cases({ meta, cases }) {
  const [tab, setTab] = useState('active')
  const { groups, list, error, reload } = cases
  const shown = groups[tab]
  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Cases" />
      <div className="flex border-b border-line">
        {[
          ['new', 'New'],
          ['active', 'Active'],
          ['done', 'Completed'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('flex-1 h-[46px] text-[14px] font-semibold border-b-[3px]', tab === k ? 'border-gold text-ink' : 'border-transparent text-muted')}>
            {l} ({groups[k].length})
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
      ) : shown.length === 0 ? (
        <EmptyState icon={Briefcase} title="Nothing here yet" sub="Requests assigned by our team appear under New." />
      ) : (
        shown.map((c) => (
          <Card key={c.id} className="px-4 py-0.5">
            <CaseRow c={c} meta={meta} />
          </Card>
        ))
      )}
    </div>
  )
}

/* ---------------- case detail (app: CaseDetail + Chat) ---------------- */

function useCase(id) {
  const [c, setC] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setC((await userApi('/advocate/cases/' + id)).data)
      setError('')
    } catch (e) {
      setError(e.status === 404 ? 'notfound' : errText(e))
    }
  }, [id])
  useEffect(() => {
    load()
  }, [load])
  useLive('user', { 'request:update': (p) => p.number === id && load(), reconnect: load })
  return { c, setC, error, load }
}

function CaseDetail({ meta, onChanged }) {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { c, setC, error, load } = useCase(id)
  const [declining, setDeclining] = useState(false)
  const [confirmDone, setConfirmDone] = useState(false)
  const [busy, setBusy] = useState(false)

  if (error === 'notfound') return <Navigate to="/advocate/cases" replace />
  if (error)
    return (
      <Card className="p-6 flex flex-col items-start gap-3">
        <p className="font-bold">Could not load this case</p>
        <p className="text-[14px] text-muted">{error}</p>
        <Button size="sm" variant="line" onClick={load}>
          Try again
        </Button>
      </Card>
    )
  if (!c) return <PageLoader />

  const st = STATUS[c.status] ?? STATUS.new
  const cat = catOf(meta, c.category)
  // Once paid, the payout fixed at payment time; before that, a preview at today's rates.
  const pay = c.payout ? { base: c.payout.net + c.payout.commission + c.payout.gstOnCommission, ...c.payout } : c.quote ? advocatePayout(c.quote.fee, ratesFor(meta, c.category)) : null
  const r = c.payout ? { commission: c.payout.commissionPercent / 100, gst: c.payout.gstPercent / 100 } : ratesFor(meta, c.category)
  const order = ['new', 'accepted', 'quoted', 'paid', 'done', 'completed']
  const at = order.indexOf(c.status)
  const step = (i) => (c.status === 'completed' || i <= at ? 'done' : i === at + 1 ? 'now' : 'todo')

  const act = async (path, body, msg) => {
    setBusy(true)
    try {
      setC((await userApi('/advocate/cases/' + c.id + path, { method: 'POST', body })).data)
      onChanged()
      if (msg) toast(msg, 'green')
    } catch (e) {
      toast(errText(e), 'red')
      load()
    } finally {
      setBusy(false)
      setDeclining(false)
    }
  }

  const chatOpen = ACTIVE.includes(c.status) || ['completed', 'refunded'].includes(c.status)
  const markDone = async () => {
    setBusy(true)
    try {
      await userApi('/advocate/cases/' + c.id + '/done', { method: 'POST' })
      setConfirmDone(false)
      onChanged()
      load()
      toast('Marked as done. The client will be asked to confirm.', 'green')
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHead title={cat.name} sub={c.id} back="/advocate/cases" right={<Pill tone={st.tone}>{st.label}</Pill>} />
      <div className={cx('grid gap-5', chatOpen && 'lg:grid-cols-[380px_1fr]')}>
        <div className="flex flex-col gap-4 max-w-2xl">
          <Card className="p-4 flex items-center gap-3">
            <ClientAvatar size={44} />
            <div className="flex-1">
              <p className="text-[15px] font-bold">{c.clientName}</p>
              <p className="text-[12px] font-medium text-muted">
                {c.district} · prefers {c.lang}
              </p>
            </div>
          </Card>
          <Card className="p-4 flex flex-col gap-2">
            <p className="text-[15px] font-bold">{c.title}</p>
            <p className="text-[13.5px] text-text-2 leading-relaxed">{c.issue}</p>
            <p className="text-[12px] text-muted">Assigned {c.assignedAt ? ago(new Date(c.assignedAt).getTime()) : ''}</p>
            {c.docs.length && c.status !== 'declined' ? (
              <div className="flex flex-wrap gap-2 mt-1">
                {c.docs.map((d) => (
                  <SecureImage key={d.id} load={userFileUrl} path={'/advocate/cases/' + c.id + '/attachments/' + d.id} alt="Client document" className="size-16 rounded-lg object-cover" />
                ))}
              </div>
            ) : null}
          </Card>

          {c.status !== 'declined' ? (
            <Card className="p-4">
              <Timeline
                steps={[
                  { title: 'Assigned to you', state: step(0) },
                  { title: 'Accepted', state: step(1) },
                  { title: 'Quote sent', sub: c.quote ? inr(c.quote.fee) : undefined, state: step(2) },
                  { title: 'Client paid', sub: c.status === 'quoted' ? 'Waiting for the client' : undefined, state: step(3) },
                  { title: 'Work done', sub: c.status === 'done' ? 'Waiting for the client to confirm' : undefined, state: step(4) },
                  { title: 'Paid to wallet', state: step(5) },
                ]}
              />
            </Card>
          ) : (
            <Note tone="neutral">
              You declined this request{c.declineReason ? ': ' + c.declineReason : ''}. It went back to the admin queue.
            </Note>
          )}

          {pay ? (
            <Card className="p-4 flex flex-col gap-2">
              <p className="text-[14px] font-bold">Your payout</p>
              <BillRow label="Fee quoted" value={inr(pay.base)} />
              <BillRow label={'Platform commission (' + pct(r.commission) + ')'} value={'−' + inr(pay.commission)} />
              <BillRow label={'GST on commission (' + pct(r.gst) + ')'} value={'−' + inr(pay.gstOnCommission)} />
              <span className="h-px bg-line" />
              <BillRow label={c.status === 'completed' ? 'Credited to wallet' : 'You will receive'} value={inr(pay.net)} strong />
            </Card>
          ) : null}

          {c.status === 'done' ? <Note tone="neutral">Waiting for the client to confirm. It confirms automatically{c.autoConfirmAt ? ' on ' + dateShort(new Date(c.autoConfirmAt).getTime()) : ''} if they do nothing.</Note> : null}
          {c.status === 'disputed' ? <Note tone="orange">The client raised a dispute: {c.dispute?.reason}. The payment stays on hold while our team reviews it in the chat.</Note> : null}
          {c.status === 'refunded' ? <Note tone="neutral">Our team refunded the client{c.dispute?.note ? ': ' + c.dispute.note : ''}.</Note> : null}

          {declining ? (
            <Card className="p-4 flex flex-col gap-2.5">
              <p className="text-[14px] font-bold">Why are you declining?</p>
              <div className="flex flex-wrap gap-2">
                {DECLINE_REASONS.map((x) => (
                  <Chip key={x} onClick={() => !busy && act('/decline', { reason: x }, 'Declined. It went back to our team.')}>
                    {x}
                  </Chip>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="flex gap-2.5">
            {c.status === 'new' ? (
              <>
                <Button size="lg" className="flex-1" loading={busy} onClick={() => act('/accept', undefined, 'Accepted. Introduce yourself in the chat.')}>
                  Accept request
                </Button>
                <Button size="lg" variant="line" onClick={() => setDeclining(!declining)}>
                  Decline
                </Button>
              </>
            ) : c.status === 'accepted' || c.status === 'quoted' ? (
              <Button size="lg" className="flex-1" onClick={() => nav('/advocate/cases/' + c.id + '/quote')}>
                {c.status === 'quoted' ? 'Send a new quote' : 'Send quote'}
              </Button>
            ) : c.status === 'paid' ? (
              <Button size="lg" className="flex-1" onClick={() => setConfirmDone(true)}>
                Mark work as done
              </Button>
            ) : c.status === 'declined' ? (
              <Button size="lg" variant="line" onClick={() => nav('/advocate/cases')}>
                Back to cases
              </Button>
            ) : null}
          </div>
        </div>

        {chatOpen ? (
          <LiveChat
            number={c.id}
            side="advocate"
            status={c.status}
            closed={['completed', 'refunded'].includes(c.status)}
            onQuote={c.status === 'accepted' ? () => nav('/advocate/cases/' + c.id + '/quote') : undefined}
            headerSlot={
              <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
                <ClientAvatar size={36} />
                <div>
                  <p className="font-bold text-[14px]">{c.clientName}</p>
                  <p className="text-[12px] text-muted">
                    {cat.short} · {c.id}
                  </p>
                </div>
                <MessageCircle className="size-5 text-muted ml-auto" />
              </div>
            }
          />
        ) : null}
      </div>
      <DoneDialog open={confirmDone} busy={busy} onClose={() => setConfirmDone(false)} onConfirm={markDone} />
    </div>
  )
}

/* ---------------- send quote (app: SendQuote) ---------------- */

function DoneDialog({ open, busy, onClose, onConfirm }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as done?"
      footer={
        <>
          <Button variant="line" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={onConfirm}>
            Mark as done
          </Button>
        </>
      }>
      <p className="text-[14px] text-text-2">The client will be asked to confirm. Payment is released after they confirm.</p>
    </Modal>
  )
}

function SendQuote({ meta, onChanged }) {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { c, error } = useCase(id)
  const [fee, setFee] = useState('')
  const [scope, setScope] = useState('')
  const [busy, setBusy] = useState(false)
  if (error) return <Navigate to={'/advocate/cases/' + id} replace />
  if (!c) return <PageLoader />
  if (!['accepted', 'quoted'].includes(c.status)) return <Navigate to={'/advocate/cases/' + id} replace />
  const r = ratesFor(meta, c.category)
  const n = Number(fee) || 0
  const pay = advocatePayout(n, r)
  const send = async () => {
    setBusy(true)
    try {
      await userApi('/advocate/cases/' + c.id + '/quote', { method: 'POST', body: { fee: n, scope: scope.trim() } })
      onChanged()
      nav('/advocate/cases/' + c.id, { replace: true })
    } catch (e) {
      toast(errText(e), 'red')
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <PageHead title="Send a fee quote" sub={c.id + ' · ' + c.clientName} back />
      <Field label="Your fee (₹)" prefix="₹" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/\D/g, '').slice(0, 7))} autoFocus />
      <Field label="What this fee covers" as="textarea" value={scope} onChange={(e) => setScope(e.target.value)} maxLength={600} placeholder="e.g. Drafting and filing the petition, 2 court appearances" />
      <Card className="p-4 flex flex-col gap-2">
        <p className="text-[14px] font-bold">What you will receive</p>
        <BillRow label="Client pays (before GST)" value={inr(pay.base)} />
        <BillRow label={'Platform commission (' + pct(r.commission) + ')'} value={'−' + inr(pay.commission)} />
        <BillRow label={'GST on commission (' + pct(r.gst) + ')'} value={'−' + inr(pay.gstOnCommission)} />
        <span className="h-px bg-line" />
        <BillRow label="You receive" value={inr(pay.net)} strong />
      </Card>
      <Note tone="neutral">If the client uses an offer, commission and GST are calculated on the discounted amount. The commission rate is set by Vakeel Bhai.</Note>
      <Button size="lg" loading={busy} disabled={n < 100 || scope.trim().length < 10} onClick={send}>
        Send quote in chat
      </Button>
    </div>
  )
}

/* ---------------- membership card (app: MembershipCardScreen) ---------------- */

function MembershipCardPage({ me }) {
  const m = me.membership
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <PageHead title="Membership card" back />
      <div className="rounded-2xl bg-ink p-5 text-white flex flex-col gap-4 shadow-pop">
        <div className="flex items-center justify-between">
          <img src={IMG.wordmarkWhite} alt="Vakeel Bhai" className="h-6" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-gold">Verified advocate</span>
        </div>
        <div className="flex items-center gap-3">
          {me.hasPhoto ? <SecureImage load={userFileUrl} path="/advocate/photo" alt="" className="size-14 rounded-full object-cover ring-2 ring-gold" /> : null}
          <div>
            <p className="font-serif font-bold text-[18px]">Adv. {me.user.name}</p>
            <p className="text-[12px] text-on-ink-muted">Enrolment {me.enrolmentNumber}</p>
          </div>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-on-ink-muted">Member ID</span>
          <span className="font-bold text-gold">{m.memberId}</span>
        </div>
      </div>
      <Card className="p-4 flex flex-col gap-2.5">
        <BillRow label="Plan" value={m.planName} />
        <BillRow label="Member ID" value={m.memberId} />
        <BillRow label="Started" value={dateShort(new Date(m.startAt).getTime())} />
        <BillRow label="Valid till" value={dateShort(new Date(m.endAt).getTime())} />
        <BillRow label="Status" value={m.active ? 'Active' : 'Expired'} tone={m.active ? 'green' : undefined} />
      </Card>
      <Note icon={ShieldCheck}>Renewing extends your membership from the current end date.</Note>
      <Link to="/advocate/membership/plans">
        <Button variant="line" className="w-full">
          Renew or change plan
        </Button>
      </Link>
    </div>
  )
}

/* ---------------- wallet + profile ---------------- */

/** The advocate's wallet from the API, refreshed when cases change. */
function useAdvWallet() {
  const [w, setW] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setW((await userApi('/advocate/wallet')).data)
      setError('')
    } catch (e) {
      setError(errText(e))
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])
  useLive('user', { 'request:update': load, reconnect: load })
  return { w, error, load }
}

const TX_FILTERS = [
  ['all', 'All', null],
  ['earn', 'Earnings', ['earn', 'hold', 'hold_release']],
  ['withdraw', 'Withdrawals', ['withdraw', 'withdraw_reversal']],
]

/* ---------------- wallet (app: AdvWallet) ---------------- */

function WalletPage() {
  const nav = useNavigate()
  const { w, error, load } = useAdvWallet()
  const [f, setF] = useState('all')
  const [open, setOpen] = useState(null)
  if (error)
    return (
      <Card className="p-6 flex flex-col items-start gap-3">
        <p className="font-bold">Could not load your wallet</p>
        <p className="text-[14px] text-muted">{error}</p>
        <Button size="sm" variant="line" onClick={load}>
          Try again
        </Button>
      </Card>
    )
  if (!w) return <PageLoader />
  const types = TX_FILTERS.find((x) => x[0] === f)[2]
  const rows = w.tx.filter((t) => !types || types.includes(t.type))
  const dest = w.account ? w.account.upi || 'Bank ••' + w.account.accountLast4 : null
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <PageHead
        title="Wallet"
        right={
          <Link to="/advocate/wallet/bank" className="text-[13px] font-semibold text-gold-text px-2 py-2">
            Bank & UPI
          </Link>
        }
      />
      <div className="rounded-[18px] bg-ink p-5 flex flex-col gap-3.5">
        <div>
          <p className="text-[12px] font-medium text-on-ink-muted">Available to withdraw</p>
          <p className="text-[32px] font-extrabold text-white">{inr(w.balance)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[10px] bg-ink-2 p-2.5">
            <p className="text-[11px] font-medium text-on-ink-muted">On hold</p>
            <p className="text-[14px] font-bold text-white">{inr(w.hold)}</p>
            <p className="text-[10.5px] font-medium text-[#8A857A]">until client confirms</p>
          </div>
          <div className="rounded-[10px] bg-ink-2 p-2.5">
            <p className="text-[11px] font-medium text-on-ink-muted">Lifetime earned</p>
            <p className="text-[14px] font-bold text-white">{inr(w.lifetime)}</p>
            <p className="text-[10.5px] font-medium text-[#8A857A]">after commission</p>
          </div>
        </div>
        <Button onClick={() => nav(dest ? '/advocate/wallet/withdraw' : '/advocate/wallet/bank')}>{dest ? 'Withdraw to ' + dest : 'Add bank to withdraw'}</Button>
      </div>
      <div className="flex gap-2">
        {TX_FILTERS.map(([k, l]) => (
          <Chip key={k} active={f === k} onClick={() => setF(k)}>
            {l}
          </Chip>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : (
        rows.map((t) => {
          const inc = t.amount > 0 && ['earn', 'withdraw_reversal', 'adjustment'].includes(t.type)
          const shown = t.amount || t.hold
          return (
            <Card key={t.id} className={cx('p-4 flex flex-col gap-2', t.lines.length && 'cursor-pointer')} onClick={t.lines.length ? () => setOpen(open === t.id ? null : t.id) : undefined}>
              <div className="flex items-center gap-3">
                <span className={cx('grid size-10 place-items-center rounded-[10px]', inc ? 'bg-green-soft' : 'bg-surface-2')}>
                  {inc ? <ArrowDownLeft className="size-[19px] text-green" /> : t.type === 'hold' ? <Clock className="size-[19px] text-text-2" /> : <ArrowUpRight className="size-[19px] text-text-2" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold">{t.title}</p>
                  <p className="text-[12px] text-muted truncate">{(t.sub ? t.sub + ' · ' : '') + dateShort(new Date(t.at).getTime())}</p>
                </div>
                <div className="text-right">
                  <p className={cx('text-[15px] font-extrabold', inc && 'text-green')}>{(inc ? '+' : '') + inr(shown)}</p>
                  {t.status ? <p className="text-[11px] font-semibold text-muted">{t.status}</p> : null}
                </div>
              </div>
              {t.lines.length && open === t.id ? (
                <div className="rounded-[10px] bg-page p-3 flex flex-col gap-1.5">
                  {t.lines.map((l) => (
                    <BillRow key={l.k} label={l.k} value={(l.v < 0 ? '−' : '') + inr(Math.abs(l.v))} />
                  ))}
                </div>
              ) : null}
            </Card>
          )
        })
      )}
    </div>
  )
}

/* ---------------- withdraw (app: Withdraw) ---------------- */

function Withdraw() {
  const nav = useNavigate()
  const toast = useToast()
  const { w } = useAdvWallet()
  const [amt, setAmt] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!w) return <PageLoader />
  if (!w.account) return <Navigate to="/advocate/wallet/bank" replace />
  const value = amt ?? String(Math.floor(w.balance))
  const n = Number(value) || 0
  const ok = n > 0 && n <= w.balance
  const submit = async () => {
    setBusy(true)
    try {
      await userApi('/advocate/withdrawals', { method: 'POST', body: { amount: n } })
      toast(inr(n) + ' requested. It reaches your account after our team approves it.', 'green')
      nav('/advocate/wallet', { replace: true })
    } catch (e) {
      toast(errText(e), 'red')
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <PageHead title="Withdraw" back />
      <Field label="Amount (₹)" prefix="₹" inputMode="numeric" value={value} onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 7))} hint={'Available: ' + inr(w.balance)} />
      <div className="flex flex-wrap gap-2">
        {[1000, 5000, 10000]
          .filter((v) => v <= w.balance)
          .map((v) => (
            <Chip key={v} onClick={() => setAmt(String(v))}>
              {inr(v)}
            </Chip>
          ))}
        <Chip onClick={() => setAmt(String(Math.floor(w.balance)))}>All</Chip>
      </div>
      <Link to="/advocate/wallet/bank" className="card flex items-center gap-3 px-4 py-3.5">
        <Landmark className="size-5 text-muted" />
        <span className="flex-1">
          <span className="block text-[14px] font-semibold">{w.account.upi || 'Bank account ••' + w.account.accountLast4}</span>
          <span className="block text-[12px] text-muted">{w.account.holder}</span>
        </span>
        <ChevronRight className="size-4 text-muted" />
      </Link>
      <Note tone="neutral">Our team approves withdrawals and transfers the money, usually within 2 working days.</Note>
      <Button size="lg" loading={busy} disabled={!ok} onClick={submit}>
        Withdraw {inr(n)}
      </Button>
    </div>
  )
}

/* ---------------- bank and UPI (app: Bank) ---------------- */

function Bank({ me }) {
  const nav = useNavigate()
  const toast = useToast()
  const [cur, setCur] = useState(undefined)
  const [f, setF] = useState({ holder: '', account: '', ifsc: '', upi: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    userApi('/advocate/payout-account')
      .then((j) => {
        setCur(j.data)
        setF({ holder: j.data?.holder || me.user.name, account: '', ifsc: j.data?.ifsc || '', upi: j.data?.upi || '' })
      })
      .catch(() => setCur(null))
  }, [me.user.name])
  if (cur === undefined) return <PageLoader />
  const bankOk = f.account.length >= 9 && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc)
  const upiOk = /^[\w.-]+@[\w]+$/.test(f.upi)
  const save = async () => {
    setBusy(true)
    try {
      // The saved account number is never sent back to the browser, so changing details means entering it again.
      await userApi('/advocate/payout-account', { method: 'PUT', body: { holder: f.holder.trim(), upi: upiOk ? f.upi : '', ifsc: bankOk ? f.ifsc : '', account: bankOk ? f.account : '' } })
      toast('Saved', 'green')
      nav(-1)
    } catch (e) {
      toast(errText(e), 'red')
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <PageHead title="Bank and UPI" back />
      <Field label="Account holder name" value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })} maxLength={80} />
      <Field label="Account number" inputMode="numeric" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value.replace(/\D/g, '').slice(0, 18) })} placeholder={cur?.accountLast4 ? 'Saved ••' + cur.accountLast4 + ' · enter again to keep or change' : ''} />
      <Field label="IFSC" value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase().slice(0, 11) })} placeholder="e.g. HDFC0001234" />
      <p className="text-center text-[13px] font-bold text-muted">or</p>
      <Field label="UPI ID" value={f.upi} onChange={(e) => setF({ ...f, upi: e.target.value.trim().toLowerCase() })} placeholder="name@bank" />
      <Note icon={ShieldCheck}>The account must be in your name. Our team checks it before the first payout. The account number is stored encrypted.</Note>
      <Button size="lg" loading={busy} disabled={!f.holder.trim() || !(bankOk || upiOk)} onClick={save}>
        Save
      </Button>
    </div>
  )
}

function Profile({ me, meta, onLogout }) {
  const nav = useNavigate()
  const row = (Icon, title, sub, onClick) => (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 border-t border-line-soft first:border-0 text-left hover:bg-page">
      <Icon className="size-5 text-muted" />
      <span className="flex-1">
        <span className="block text-[14px] font-semibold">{title}</span>
        {sub ? <span className="block text-[12px] text-muted">{sub}</span> : null}
      </span>
      <ChevronRight className="size-4 text-muted" />
    </button>
  )
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <PageHead title="Profile" />
      <Card className="p-5 flex items-center gap-4">
        {me.hasPhoto ? <SecureImage load={userFileUrl} path="/advocate/photo" alt="" className="size-14 rounded-full object-cover ring-2 ring-gold" /> : <ClientAvatar size={56} />}
        <div>
          <p className="font-bold text-[17px]">
            Adv. {me.user.name} <ShieldCheck className="inline size-4 text-green" />
          </p>
          <p className="text-[13px] text-muted">
            {me.enrolmentNumber} · {me.district}
          </p>
        </div>
      </Card>
      <Card className="overflow-hidden">
        {row(IdCard, 'Membership card', me.membership.planName + ' · ' + me.membership.memberId, () => nav('/advocate/membership'))}
        {row(FileCheck, 'My documents', 'All approved', () => nav('/advocate/profile?docs=1'))}
        {row(Briefcase, 'Practice details', me.practice.map((k) => catOf(meta, k).short).join(', '), () => nav('/advocate/profile?docs=1'))}
        {row(MessageCircle, 'Help and support', undefined, () => nav('/help'))}
      </Card>
      <DocsList me={me} />
      <Button variant="danger" icon={LogOut} onClick={onLogout}>
        Log out
      </Button>
    </div>
  )
}

function DocsList({ me }) {
  return (
    <Card className="px-4 py-1">
      <p className="py-2.5 text-[14px] font-bold">My documents</p>
      {me.documents.map((d) => (
        <div key={d.key} className="flex items-center gap-3 py-2.5 border-t border-line-soft">
          <SecureImage load={userFileUrl} path={'/advocate/documents/' + d.key + '/file'} version={d.version} alt="" className="size-10 rounded-lg object-cover bg-surface-2" />
          <span className="flex-1 text-[13px] font-semibold">{d.title}</span>
          <Pill tone="green" dot={false}>
            Approved
          </Pill>
        </div>
      ))}
    </Card>
  )
}
