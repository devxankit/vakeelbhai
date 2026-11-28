import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, FolderTree, Pencil, Plus } from 'lucide-react'
import { Button, Card, Drawer, EmptyState, Field, Modal, Note, PageLoader, Pill, Select, Stat, Table, Toggle, cx, useToast } from '@/components/ui'
import { adminApi, adminSession, errText } from '@/lib/api'
import { inr } from '@/lib/money'
import { ago, dateShort, time } from '@/lib/format'
import { PageHead } from '../portal/common'
import { useAdmin, useAdminData } from './context'

/* ---------------- shared bits ---------------- */


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

function Section({ title, sub, children }) {
  return (
    <Card className="p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-[16px] font-bold">{title}</h2>
        {sub ? <p className="text-[13px] text-muted mt-0.5">{sub}</p> : null}
      </div>
      {children}
    </Card>
  )
}

/** Number input that keeps what the admin typed; '' means "not set". */
const numOrNull = (v) => (v === '' || v == null ? null : Number(v))

/* ---------------- dashboard ---------------- */

export function Dashboard() {
  const nav = useNavigate()
  const { data, error, loading, reload } = useAdminData('/admin/dashboard')
  if (loading && !data) return <PageLoader />
  if (error) return <LoadError error={error} onRetry={reload} />
  const v = data.verification
  const m = data.money
  const q = data.requests
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Dashboard" sub="Live figures from the database" />
      {v.pending ? (
        <Note tone="gold">
          {v.pending} advocate{v.pending === 1 ? ' is' : 's are'} waiting for verification.{' '}
          <button onClick={() => nav('/admin/advocates')} className="font-bold underline">
            Review now
          </button>
        </Note>
      ) : null}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Clients" value={data.clients.total} sub={data.clients.last30Days + ' joined in the last 30 days'} onClick={() => nav('/admin/clients')} />
        <Stat label="Advocates" value={data.advocates.total} sub={data.advocates.last30Days + ' joined in the last 30 days'} onClick={() => nav('/admin/advocates')} />
        <Stat label="Pending verification" value={v.pending} sub={v.reupload + ' waiting for retakes'} onClick={() => nav('/admin/advocates')} />
        <Stat label="Verified advocates" value={v.approved} sub={v.rejected + ' rejected'} />
        <Stat label="Blocked accounts" value={data.clients.blocked + data.advocates.blocked} sub={data.clients.blocked + ' clients · ' + data.advocates.blocked + ' advocates'} />
        <Stat label="Active categories" value={data.activeCategories} onClick={() => nav('/admin/categories')} />
      </div>
      {q.unassigned || q.disputed || m.paymentsNeedingAttention || m.withdrawalsPending.count || data.support?.open || data.challans?.processing || data.gstFilings?.open ? (
        <div className="flex flex-col gap-2">
          {q.unassigned ? (
            <Note tone="gold">
              {q.unassigned} request{q.unassigned === 1 ? '' : 's'} waiting for an advocate.{' '}
              <button onClick={() => nav('/admin/requests')} className="font-bold underline">
                Assign
              </button>
            </Note>
          ) : null}
          {q.disputed ? (
            <Note tone="orange">
              {q.disputed} open dispute{q.disputed === 1 ? '' : 's'}.{' '}
              <button onClick={() => nav('/admin/requests')} className="font-bold underline">
                Review
              </button>
            </Note>
          ) : null}
          {m.withdrawalsPending.count ? (
            <Note tone="gold">
              {m.withdrawalsPending.count} withdrawal{m.withdrawalsPending.count === 1 ? '' : 's'} to pay ({inr(m.withdrawalsPending.amount)}).{' '}
              <button onClick={() => nav('/admin/withdrawals')} className="font-bold underline">
                Open
              </button>
            </Note>
          ) : null}
          {data.gstFilings?.open ? (
            <Note tone="gold">
              {data.gstFilings.open} GST filing request{data.gstFilings.open === 1 ? '' : 's'} open.{' '}
              <button onClick={() => nav('/admin/gst-filings')} className="font-bold underline">
                Open
              </button>
            </Note>
          ) : null}
          {data.support?.open ? (
            <Note tone="gold">
              {data.support.open} help desk ticket{data.support.open === 1 ? '' : 's'} waiting for a reply.{' '}
              <button onClick={() => nav('/admin/support')} className="font-bold underline">
                Reply
              </button>
            </Note>
          ) : null}
          {data.challans?.processing ? (
            <Note tone={data.challans.overdue ? 'orange' : 'gold'}>
              {data.challans.processing} e-Challan order{data.challans.processing === 1 ? '' : 's'} to pay to the department{data.challans.overdue ? ' (' + data.challans.overdue + ' overdue)' : ''}.{' '}
              <button onClick={() => nav('/admin/challans')} className="font-bold underline">
                Open
              </button>
            </Note>
          ) : null}
          {m.paymentsNeedingAttention ? (
            <Note tone="orange">
              {m.paymentsNeedingAttention} payment{m.paymentsNeedingAttention === 1 ? ' needs' : 's need'} attention.{' '}
              <button onClick={() => nav('/admin/payments')} className="font-bold underline">
                Open
              </button>
            </Note>
          ) : null}
        </div>
      ) : null}
      <h2 className="text-[16px] font-bold mt-2">Money</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Collected this month" value={inr(m.thisMonth.collected)} sub={inr(m.allTime.collected) + ' all time'} onClick={() => nav('/admin/payments')} />
        <Stat label="Commission this month" value={inr(m.thisMonth.commission)} sub={inr(m.allTime.commission) + ' all time'} />
        <Stat label="GST this month" value={inr(m.thisMonth.gst)} sub="On fees, memberships and commission" />
        <Stat label="Memberships this month" value={inr(m.thisMonth.memberships)} sub={inr(m.allTime.memberships) + ' all time'} />
      </div>
      <h2 className="text-[16px] font-bold mt-2">Requests</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Waiting for an advocate" value={q.unassigned + q.waiting} sub={q.waiting + ' assigned, not answered'} onClick={() => nav('/admin/requests')} />
        <Stat label="Active" value={q.active} onClick={() => nav('/admin/requests')} />
        <Stat label="Disputed" value={q.disputed} />
        <Stat label="Completed" value={q.completed} />
      </div>
    </div>
  )
}

/* ---------------- categories ---------------- */

const blankCategory = { key: '', name: '', short: '', covers: '', description: '', typicalDocs: '', gstOnService: true, active: true, commissionPercent: '' }

export function Categories() {
  const { isSuper } = useAdmin()
  const toast = useToast()
  const { data, error, loading, reload, setData } = useAdminData('/admin/categories')
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)

  const move = async (i, dir) => {
    const ids = data.map((c) => c.id)
    const j = i + dir
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setBusy(true)
    try {
      setData((await adminApi('/admin/categories/order', { method: 'PUT', body: { ids } })).data)
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (c) => {
    try {
      const j = await adminApi('/admin/categories/' + c.id, { method: 'PATCH', body: { active: !c.active } })
      setData(data.map((x) => (x.id === c.id ? j.data : x)))
      toast(j.data.active ? c.name + ' is visible to clients' : c.name + ' is hidden from clients', 'green')
    } catch (e) {
      toast(errText(e), 'red')
    }
  }

  if (loading && !data) return <PageLoader />
  if (error) return <LoadError error={error} onRetry={reload} />
  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Service categories"
        sub="What clients choose from. Hidden categories stay on old requests but cannot be picked for new ones."
        right={
          <Button icon={Plus} onClick={() => setEdit({ ...blankCategory })}>
            Add category
          </Button>
        }
      />
      {data.length === 0 ? (
        <Card>
          <EmptyState icon={FolderTree} title="No categories yet" sub="Run `npm run seed:categories` in backend/ to add the seven from the SOW, or add one here." />
        </Card>
      ) : (
        <Table
          head={['Order', 'Category', 'GST on fee', 'Commission', 'Visible', '']}
          rowKey={(_r, i) => data[i].id}
          rows={data.map((c, i) => ({
            cells: [
              <div key="o" className="flex gap-1">
                <button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={'Move ' + c.name + ' up'} className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-30">
                  <ArrowUp className="size-4" />
                </button>
                <button disabled={busy || i === data.length - 1} onClick={() => move(i, 1)} aria-label={'Move ' + c.name + ' down'} className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-30">
                  <ArrowDown className="size-4" />
                </button>
              </div>,
              <div key={c.id}>
                <p className="font-bold">{c.name}</p>
                <p className="text-[12px] text-muted">
                  {c.key} · {c.short}
                </p>
              </div>,
              c.gstOnService ? <Pill tone="gold">Charged</Pill> : <Pill>Not charged</Pill>,
              c.commissionPercent == null ? <span className="text-muted">Default</span> : <span className="font-semibold">{c.commissionPercent}%</span>,
              <Toggle key="t" checked={c.active} onChange={() => toggle(c)} label={'Show ' + c.name} />,
              <Button key="e" size="sm" variant="line" icon={Pencil} onClick={() => setEdit({ ...c, typicalDocs: c.typicalDocs.join('\n'), commissionPercent: c.commissionPercent ?? '' })}>
                Edit
              </Button>,
            ],
          }))}
        />
      )}
      <CategoryDrawer
        value={edit}
        isSuper={isSuper}
        onClose={() => setEdit(null)}
        onSaved={(saved, isNew) => {
          setData(isNew ? [...data, saved] : data.map((x) => (x.id === saved.id ? saved : x)))
          setEdit(null)
          toast(isNew ? 'Category added' : 'Category saved', 'green')
        }}
      />
    </div>
  )
}

function CategoryDrawer({ value, isSuper, onClose, onSaved }) {
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
    const body = {
      name: f.name,
      short: f.short,
      covers: f.covers,
      description: f.description,
      typicalDocs: f.typicalDocs.split('\n').map((s) => s.trim()).filter(Boolean),
      gstOnService: f.gstOnService,
      active: f.active,
      ...(isSuper ? { commissionPercent: numOrNull(f.commissionPercent) } : {}),
      ...(isNew ? { key: f.key } : {}),
    }
    try {
      const j = await adminApi(isNew ? '/admin/categories' : '/admin/categories/' + value.id, { method: isNew ? 'POST' : 'PATCH', body })
      onSaved(j.data, isNew)
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
      title={isNew ? 'Add category' : 'Edit ' + value.name}
      footer={
        <>
          <Button variant="line" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!f.name || !f.short || (isNew && !f.key)} className="flex-1">
            {isNew ? 'Add' : 'Save'}
          </Button>
        </>
      }>
      {isNew ? (
        <Field label="Key" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} hint="Permanent ID used by the apps, e.g. tax. Lowercase, cannot be changed later." />
      ) : (
        <p className="text-[13px] text-muted">
          Key: <span className="font-semibold text-text">{value.key}</span> (permanent)
        </p>
      )}
      <Field label="Name" value={f.name} onChange={set('name')} maxLength={60} placeholder="Criminal lawyer" />
      <Field label="Short name" value={f.short} onChange={set('short')} maxLength={30} hint="Used on tags and small tiles" />
      <Field label="What it covers" value={f.covers} onChange={set('covers')} maxLength={160} hint="One line under the name" />
      <Field label="Description" as="textarea" value={f.description} onChange={set('description')} maxLength={1000} />
      <Field label="Typical documents" as="textarea" value={f.typicalDocs} onChange={set('typicalDocs')} hint="One per line, shown to clients before they submit" />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold">Charge GST on the client's fee</p>
          <p className="text-[12px] text-muted">To be confirmed by the client's CA for each category</p>
        </div>
        <Toggle checked={f.gstOnService} onChange={set('gstOnService')} label="GST on fee" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-semibold">Visible to clients</p>
        <Toggle checked={f.active} onChange={set('active')} label="Visible" />
      </div>
      {isSuper ? (
        <Field label="Commission for this category (%)" type="number" min={0} max={100} step="0.01" value={f.commissionPercent} onChange={set('commissionPercent')} hint="Leave empty to use the global rate from Commission & settings" />
      ) : (
        <p className="text-[13px] text-muted">Commission: {f.commissionPercent === '' ? 'global rate' : f.commissionPercent + '%'}. Only a super admin can change it.</p>
      )}
      {error ? <Note tone="orange">{error}</Note> : null}
    </Drawer>
  )
}

/* ---------------- settings ---------------- */

const toForm = (s) => ({
  commissionPercent: String(s.commissionPercent),
  gstPercent: String(s.gstPercent),
  autoConfirmDays: String(s.autoConfirmDays),
  quoteValidityDays: String(s.quoteValidityDays),
  walletMaxUsePercent: s.walletMaxUsePercent == null ? '' : String(s.walletMaxUsePercent),
  supportWhatsApp: s.supportWhatsApp,
  minWithdrawal: s.minWithdrawal == null ? '' : String(s.minWithdrawal),
  challanFee: s.challanFee == null ? '' : String(s.challanFee),
  challanPayHours: String(s.challanPayHours ?? 24),
  invLegalName: s.invoice?.legalName ?? '',
  invGstin: s.invoice?.gstin ?? '',
  invAddress: s.invoice?.address ?? '',
  invEmail: s.invoice?.email ?? '',
  refEnabled: s.referral.enabled,
  refType: s.referral.rewardType ?? '',
  refValue: s.referral.rewardValue == null ? '' : String(s.referral.rewardValue),
  refCap: s.referral.monthlyCap == null ? '' : String(s.referral.monthlyCap),
})

/** Only the fields that changed, in the API's units. */
function settingsPatch(f, s) {
  const p = {}
  const num = (k) => {
    const v = numOrNull(f[k])
    if (v !== s[k]) p[k] = v
  }
  num('commissionPercent')
  num('gstPercent')
  num('autoConfirmDays')
  num('quoteValidityDays')
  num('walletMaxUsePercent')
  num('minWithdrawal')
  num('challanFee')
  num('challanPayHours')
  const inv = {}
  if (f.invLegalName.trim() !== (s.invoice?.legalName ?? '')) inv.legalName = f.invLegalName.trim()
  if (f.invGstin.trim() !== (s.invoice?.gstin ?? '')) inv.gstin = f.invGstin.trim()
  if (f.invAddress.trim() !== (s.invoice?.address ?? '')) inv.address = f.invAddress.trim()
  if (f.invEmail.trim() !== (s.invoice?.email ?? '')) inv.email = f.invEmail.trim()
  if (Object.keys(inv).length) p.invoice = inv
  if (f.supportWhatsApp.trim() !== s.supportWhatsApp) p.supportWhatsApp = f.supportWhatsApp.trim()
  const ref = {}
  if (f.refEnabled !== s.referral.enabled) ref.enabled = f.refEnabled
  if ((f.refType || null) !== s.referral.rewardType) ref.rewardType = f.refType || null
  if (numOrNull(f.refValue) !== s.referral.rewardValue || 'rewardType' in ref) ref.rewardValue = numOrNull(f.refValue)
  if (numOrNull(f.refCap) !== s.referral.monthlyCap) ref.monthlyCap = numOrNull(f.refCap)
  if (Object.keys(ref).length) p.referral = ref
  return p
}

export function SettingsPage() {
  const { isSuper } = useAdmin()
  const toast = useToast()
  const { data, error, loading, reload, setData } = useAdminData('/admin/settings')
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  useEffect(() => {
    if (data) setF(toForm(data))
  }, [data])
  const patch = useMemo(() => (f && data ? settingsPatch(f, data) : {}), [f, data])
  const dirty = Object.keys(patch).length > 0

  if (loading && !data) return <PageLoader />
  if (error) return <LoadError error={error} onRetry={reload} />
  if (!f) return null
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e })
  const ro = !isSuper

  const save = async () => {
    setBusy(true)
    setSaveError('')
    try {
      setData((await adminApi('/admin/settings', { method: 'PATCH', body: patch })).data)
      toast('Settings saved', 'green')
    } catch (e) {
      setSaveError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-24">
      <PageHead title="Commission & settings" sub={'Last changed ' + (data.updatedAt ? dateShort(new Date(data.updatedAt).getTime()) : 'never')} />
      {ro ? <Note tone="neutral">Only a super admin can change these settings.</Note> : null}

      <Section title="Commission and GST" sub="Applied to new payments. Each paid request keeps the rates that applied when it was paid.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Platform commission (%)" type="number" min={0} max={100} step="0.01" disabled={ro} value={f.commissionPercent} onChange={set('commissionPercent')} hint="SOW: 20%. Categories can override it." />
          <Field label="GST rate (%)" type="number" min={0} max={100} step="0.01" disabled={ro} value={f.gstPercent} onChange={set('gstPercent')} hint="Default 18%. The CA must confirm the GST treatment." />
        </div>
      </Section>

      <Section title="Requests">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Auto-confirm after (days)" type="number" min={1} max={90} disabled={ro} value={f.autoConfirmDays} onChange={set('autoConfirmDays')} hint="After the advocate marks work done, if the client neither confirms nor disputes" />
          <Field label="Fee quote valid for (days)" type="number" min={1} max={90} disabled={ro} value={f.quoteValidityDays} onChange={set('quoteValidityDays')} />
        </div>
      </Section>

      <Section title="Client wallet and support">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Max wallet use per order (%)" type="number" min={0} max={100} step="0.01" disabled={ro} value={f.walletMaxUsePercent} onChange={set('walletMaxUsePercent')} hint="Leave empty for no cap" />
          <Field label="Support WhatsApp number" inputMode="numeric" disabled={ro} value={f.supportWhatsApp} onChange={(e) => setF({ ...f, supportWhatsApp: e.target.value.replace(/\D/g, '') })} placeholder="919876543210" hint="Digits with country code. Empty hides the number." />
        </div>
      </Section>

      <Section title="Advocate withdrawals">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Minimum withdrawal (₹)" type="number" min={0} step="0.01" disabled={ro} value={f.minWithdrawal} onChange={set('minWithdrawal')} hint="Leave empty for no minimum" />
        </div>
      </Section>

      <Section title="GST invoices" sub="Printed on every invoice PDF. The GST treatment must be confirmed by the CA.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Legal name" disabled={ro} value={f.invLegalName} onChange={set('invLegalName')} />
          <Field label="GSTIN" disabled={ro} value={f.invGstin} onChange={(e) => setF({ ...f, invGstin: e.target.value.toUpperCase() })} maxLength={15} hint="Empty prints “to be added”" />
          <Field label="Registered address" disabled={ro} value={f.invAddress} onChange={set('invAddress')} />
          <Field label="Billing email" type="email" disabled={ro} value={f.invEmail} onChange={set('invEmail')} />
        </div>
      </Section>

      <Section title="e-Challan" sub="Vakeel Bhai pays the client’s challans to the department. The client pays the challan amounts plus this charge per challan, plus GST on the charge.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Charge per challan (₹)" type="number" min={0} step="0.01" disabled={ro} value={f.challanFee} onChange={set('challanFee')} hint="Leave empty until decided: clients cannot pay challans until it is set. 0 = free." />
          <Field label="Pay to the department within (hours)" type="number" min={1} max={240} disabled={ro} value={f.challanPayHours} onChange={set('challanPayHours')} hint="Shown to the client after paying. Default 24." />
        </div>
      </Section>

      <Section title="Refer and earn (clients)" sub="The referrer is rewarded when the referred client completes their first paid service.">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] font-semibold">Referral rewards on</p>
          <Toggle checked={f.refEnabled} onChange={ro ? () => {} : set('refEnabled')} label="Referral rewards" />
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Select label="Reward type" disabled={ro} value={f.refType} onChange={set('refType')} options={[{ value: '', label: 'Not set' }, { value: 'flat', label: 'Fixed amount (₹)' }, { value: 'percent', label: '% of first service fee' }]} />
          <Field label={f.refType === 'percent' ? 'Reward (%)' : 'Reward (₹)'} type="number" min={0} step="0.01" disabled={ro || !f.refType} value={f.refValue} onChange={set('refValue')} />
          <Field label="Monthly cap per user (₹)" type="number" min={0} step="0.01" disabled={ro} value={f.refCap} onChange={set('refCap')} hint="Empty = no cap" />
        </div>
      </Section>

      {saveError ? <Note tone="orange">{saveError}</Note> : null}
      {isSuper ? (
        <div className={cx('fixed bottom-0 inset-x-0 lg:left-[248px] z-20 border-t border-line bg-white px-4 sm:px-6 py-3 flex items-center justify-end gap-2 transition', dirty ? 'translate-y-0' : 'translate-y-full')}>
          <span className="mr-auto text-[13px] text-muted">Unsaved changes</span>
          <Button variant="line" onClick={() => setF(toForm(data))}>
            Discard
          </Button>
          <Button onClick={save} loading={busy}>
            Save changes
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/* ---------------- team ---------------- */

export function Team() {
  const { admin: me } = useAdmin()
  const toast = useToast()
  const { data, error, loading, reload, setData } = useAdminData('/admin/users')
  const [adding, setAdding] = useState(false)
  const [resetFor, setResetFor] = useState(null)

  const update = async (a, body) => {
    try {
      const j = await adminApi('/admin/users/' + a.id, { method: 'PATCH', body })
      setData(data.map((x) => (x.id === a.id ? j.data : x)))
      toast('Saved', 'green')
    } catch (e) {
      toast(errText(e), 'red')
    }
  }

  if (loading && !data) return <PageLoader />
  if (error) return <LoadError error={error} onRetry={reload} />
  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Admin team"
        sub="Super admins manage settings and the team. Staff handle day-to-day work."
        right={
          <Button icon={Plus} onClick={() => setAdding(true)}>
            Add admin
          </Button>
        }
      />
      <Table
        head={['Name', 'Role', 'Status', 'Last login', '']}
        rowKey={(_r, i) => data[i].id}
        rows={data.map((a) => ({
          cells: [
            <div key="n">
              <p className="font-bold">
                {a.name}
                {a.id === me.id ? <span className="text-muted font-medium"> (you)</span> : null}
              </p>
              <p className="text-[12px] text-muted">{a.email}</p>
            </div>,
            <select key="r" disabled={a.id === me.id} value={a.role} onChange={(e) => update(a, { role: e.target.value })} className="h-9 rounded-lg border border-line-strong bg-white px-2 text-[13px] disabled:opacity-60" aria-label={'Role of ' + a.name}>
              <option value="super_admin">Super admin</option>
              <option value="staff">Staff</option>
            </select>,
            a.status === 'active' ? <Pill tone="green">Active</Pill> : <Pill tone="red">Disabled</Pill>,
            a.lastLoginAt ? ago(new Date(a.lastLoginAt).getTime()) : 'Never',
            <div key="x" className="flex gap-2 justify-end">
              <Button size="sm" variant="line" onClick={() => setResetFor(a)}>
                Set password
              </Button>
              {a.id !== me.id ? (
                <Button size="sm" variant={a.status === 'active' ? 'danger' : 'line'} onClick={() => update(a, { status: a.status === 'active' ? 'disabled' : 'active' })}>
                  {a.status === 'active' ? 'Disable' : 'Enable'}
                </Button>
              ) : null}
            </div>,
          ],
        }))}
      />
      <AddAdmin
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(a) => {
          setData([...data, a])
          setAdding(false)
          toast('Admin added. Share the password with them privately.', 'green')
        }}
      />
      <ResetPassword admin={resetFor} onClose={() => setResetFor(null)} onDone={() => (setResetFor(null), toast('Password changed. Their sessions were ended.', 'green'))} />
    </div>
  )
}

function AddAdmin({ open, onClose, onAdded }) {
  const [f, setF] = useState({ name: '', email: '', role: 'staff', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      onAdded((await adminApi('/admin/users', { method: 'POST', body: f })).data)
      setF({ name: '', email: '', role: 'staff', password: '' })
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add admin"
      footer={
        <Button className="flex-1" onClick={save} loading={busy} disabled={!f.name || !f.email || f.password.length < 10}>
          Add admin
        </Button>
      }>
      <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <Field label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={[{ value: 'staff', label: 'Staff' }, { value: 'super_admin', label: 'Super admin' }]} />
      <Field label="Temporary password" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} hint="At least 10 characters. Ask them to change it after their first login." />
      {error ? <Note tone="orange">{error}</Note> : null}
    </Drawer>
  )
}

function ResetPassword({ admin, onClose, onDone }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setPw('')
    setError('')
  }, [admin])
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await adminApi('/admin/users/' + admin.id + '/password', { method: 'POST', body: { password: pw } })
      onDone()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={!!admin}
      onClose={onClose}
      title={'Set a password for ' + (admin?.name ?? '')}
      footer={
        <Button onClick={save} loading={busy} disabled={pw.length < 10}>
          Set password
        </Button>
      }>
      <Field label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="At least 10 characters. This logs them out everywhere." />
      {error ? <Note tone="orange">{error}</Note> : null}
    </Modal>
  )
}

/* ---------------- audit log ---------------- */

const ACTIONS = {
  'settings.updated': 'Changed settings',
  'category.created': 'Added a category',
  'category.updated': 'Edited a category',
  'category.reordered': 'Reordered categories',
  'admin_user.created': 'Added an admin',
  'admin_user.updated': 'Changed an admin',
  'admin_user.password_reset': "Set an admin's password",
  'admin.password_changed': 'Changed own password',
}

export function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [entity, setEntity] = useState('')
  const [open, setOpen] = useState(null)
  const { data, meta, error, loading, reload } = useAdminData('/admin/audit-logs?limit=25&page=' + page + (entity ? '&entityType=' + entity : ''))

  if (error) return <LoadError error={error} onRetry={reload} />
  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Audit log"
        sub="Every admin change, with who made it and what it was before. Entries cannot be edited."
        right={
          <Select
            value={entity}
            onChange={(e) => (setEntity(e.target.value), setPage(1))}
            options={[{ value: '', label: 'Everything' }, { value: 'Settings', label: 'Settings' }, { value: 'Category', label: 'Categories' }, { value: 'AdminUser', label: 'Admin team' }]}
          />
        }
      />
      {loading && !data ? (
        <PageLoader />
      ) : (
        <Table
          head={['When', 'Who', 'What', 'Item']}
          empty="No changes recorded yet"
          onRow={(_r, i) => setOpen(data[i])}
          rowKey={(_r, i) => data[i].id}
          rows={data.map((a) => ({
            cells: [dateShort(new Date(a.at).getTime()) + ', ' + time(new Date(a.at).getTime()), a.actorEmail ?? '—', ACTIONS[a.action] ?? a.action, a.entityType + (a.entityId && a.entityId !== 'global' ? ' · ' + a.entityId.slice(-6) : '')],
          }))}
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
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? ACTIONS[open.action] ?? open.action : ''}>
        {open ? (
          <>
            <p className="text-[13px] text-muted">
              {open.actorEmail} · {dateShort(new Date(open.at).getTime())}, {time(new Date(open.at).getTime())}
            </p>
            {open.before && Object.keys(open.before).length ? <JsonBlock title="Before" value={open.before} /> : null}
            {open.after && Object.keys(open.after).length ? <JsonBlock title="After" value={open.after} /> : null}
          </>
        ) : null}
      </Drawer>
    </div>
  )
}

function JsonBlock({ title, value }) {
  return (
    <div>
      <p className="text-[13px] font-bold mb-1.5">{title}</p>
      <pre className="rounded-xl bg-surface-2 p-3 text-[12px] leading-relaxed overflow-x-auto thin-scroll">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

/* ---------------- my account ---------------- */

export function Account() {
  const { admin } = useAdmin()
  const toast = useToast()
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mismatch = f.confirm && f.confirm !== f.newPassword
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const j = await adminApi('/admin/auth/password', { method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } })
      adminSession.set(j.data.accessToken)
      setF({ currentPassword: '', newPassword: '', confirm: '' })
      toast('Password changed. Other devices were logged out.', 'green')
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-5 max-w-lg">
      <PageHead title="My account" sub={admin.email + ' · ' + (admin.role === 'super_admin' ? 'Super admin' : 'Staff')} />
      <Section title="Change password" sub="Changing it logs you out on every other device.">
        <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="Current password" type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />
          <Field label="New password" type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} hint="At least 10 characters" />
          <Field label="Type the new password again" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} error={mismatch ? 'The passwords do not match' : undefined} />
          {error ? <Note tone="orange">{error}</Note> : null}
          <Button type="submit" loading={busy} disabled={!f.currentPassword || f.newPassword.length < 10 || f.newPassword !== f.confirm}>
            Change password
          </Button>
        </form>
      </Section>
    </div>
  )
}
