import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Chip, Field, Modal, Note, PageLoader, Pill, Table, useToast } from '@/components/ui'
import { adminApi, errText } from '@/lib/api'
import { inr } from '@/lib/money'
import { ago, dateShort, time } from '@/lib/format'
import { PageHead } from '../portal/common'
import { useAdmin, useAdminData } from './context'
import { adminDownload } from './growth'

/** Payments, withdrawals and the wallet ledger (SCOPE-OF-WORK 12: payments and wallet). */

const when = (d) => (d ? dateShort(new Date(d).getTime()) + ', ' + time(new Date(d).getTime()) : '—')
const PAY_TONE = { created: 'neutral', paid: 'green', failed: 'red', expired: 'neutral', cancelled: 'neutral', refunded: 'orange' }

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

/* ---------------- payments + ledger ---------------- */

const PAY_TABS = [
  ['paid', 'Paid'],
  ['attention', 'Needs attention'],
  ['refunded', 'Refunded'],
  ['created', 'Open checkouts'],
  ['', 'All'],
  ['ledger', 'Wallet ledger'],
]

export function Payments() {
  const [tab, setTab] = useState('paid')
  const [page, setPage] = useState(1)
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Payments" sub="Every checkout, with the GST and commission fixed at payment time. Amounts include wallet use." />
      <div className="flex flex-wrap gap-2">
        {PAY_TABS.map(([k, l]) => (
          <Chip key={k} active={tab === k} onClick={() => (setTab(k), setPage(1))}>
            {l}
          </Chip>
        ))}
      </div>
      {tab === 'ledger' ? <Ledger page={page} setPage={setPage} /> : <PaymentList tab={tab} page={page} setPage={setPage} />}
    </div>
  )
}

function PaymentList({ tab, page, setPage }) {
  const { isSuper } = useAdmin()
  const q = tab === 'attention' ? '&attention=1&status=paid' : tab ? '&status=' + tab : ''
  const { data, meta, error, loading, reload } = useAdminData('/admin/payments?limit=25&page=' + page + q)
  const [refund, setRefund] = useState(null)
  if (error) return <LoadError error={error} onRetry={reload} />
  if (loading && !data) return <PageLoader />
  return (
    <>
      <Table
        head={['Payment', 'For', 'Who', 'Amount', 'GST', 'Commission', 'Status', '']}
        empty="No payments here"
        rowKey={(_r, i) => data[i].id}
        rows={data.map((p) => ({
          cells: [
            <div key="n">
              <p className="font-bold">{p.id}</p>
              <p className="text-[12px] text-muted">{when(p.paidAt ?? p.at)}</p>
            </div>,
            p.purpose === 'service' ? (
              <Link key="r" to={'/admin/requests/' + p.request} className="font-semibold text-gold-text hover:underline">
                {p.request}
              </Link>
            ) : p.purpose === 'gst' ? (
              <Link key="r" to={'/admin/gst-filings/' + p.request} className="font-semibold text-gold-text hover:underline">
                GST filing · {p.request}
              </Link>
            ) : p.purpose === 'challan' ? (
              <Link key="r" to={'/admin/challans/' + p.request} className="font-semibold text-gold-text hover:underline">
                e-Challan · {p.request}
              </Link>
            ) : (
              'Membership · ' + p.plan
            ),
            p.who + (p.role ? ' (' + p.role + ')' : ''),
            <span key="a" className="font-semibold">
              {inr(p.total + p.wallet)}
              {p.wallet ? <span className="block text-[11.5px] text-muted font-normal">{inr(p.wallet)} from wallet</span> : null}
            </span>,
            inr(p.gst + p.gstOnCommission),
            p.purpose === 'service' ? inr(p.commission) : '—',
            <span key="s" className="flex flex-col gap-1">
              <Pill tone={PAY_TONE[p.status]}>{p.status}</Pill>
              {p.refund ? <span className="text-[11.5px] text-muted">refund {p.refund.status}</span> : null}
              {p.needsAttention ? <span className="text-[11.5px] text-red max-w-[200px] whitespace-normal">{p.needsAttention}</span> : null}
            </span>,
            <span key="x" className="flex gap-2 justify-end">
              {p.invoiceNo ? (
                <Button size="sm" variant="line" onClick={() => adminDownload('/admin/payments/' + p.id + '/invoice', 'invoice-' + p.invoiceNo.replaceAll('/', '-') + '.pdf')}>
                  Invoice
                </Button>
              ) : null}
              {p.needsAttention && p.status === 'paid' && isSuper ? (
                <Button size="sm" variant="danger" onClick={() => setRefund(p)}>
                  Refund
                </Button>
              ) : null}
            </span>,
          ],
        }))}
      />
      <Pager meta={meta} page={page} setPage={setPage} />
      <ReasonModal
        open={!!refund}
        title={'Refund ' + (refund?.id ?? '')}
        intro={refund ? inr(refund.total) + ' goes back to the original payment method' + (refund.wallet ? ' and ' + inr(refund.wallet) + ' to the wallet' : '') + '.' : ''}
        action="Refund in full"
        danger
        onClose={() => setRefund(null)}
        onSubmit={async (reason) => {
          await adminApi('/admin/payments/' + refund.id + '/refund', { method: 'POST', body: { reason } })
          setRefund(null)
          reload()
        }}
      />
    </>
  )
}

const TX_LABEL = { spend: 'Wallet used', spend_release: 'Wallet returned', refund: 'Refund to wallet', hold: 'On hold', hold_release: 'Hold removed', earn: 'Earning credited', withdraw: 'Withdrawal', withdraw_reversal: 'Withdrawal returned', adjustment: 'Adjustment', referral: 'Referral', cashback: 'Cashback' }

function Ledger({ page, setPage }) {
  const { data, meta, error, loading, reload } = useAdminData('/admin/wallet-transactions?page=' + page)
  if (error) return <LoadError error={error} onRetry={reload} />
  if (loading && !data) return <PageLoader />
  return (
    <>
      <Note tone="neutral">Every change to any wallet, newest first. Balances only ever change through these entries.</Note>
      <Table
        head={['When', 'Who', 'Entry', 'Balance change', 'Hold change', 'Details']}
        empty="No wallet entries yet"
        rowKey={(_r, i) => data[i].id}
        rows={data.map((t) => ({
          cells: [
            when(t.at),
            t.who + ' (' + t.role + ')',
            <div key="e">
              <p className="font-semibold">{TX_LABEL[t.type] ?? t.type}</p>
              <p className="text-[12px] text-muted">{t.title}</p>
            </div>,
            t.amount ? <span className={t.amount > 0 ? 'text-green font-semibold' : 'font-semibold'}>{(t.amount > 0 ? '+' : '') + inr(t.amount)}</span> : '—',
            t.hold ? (t.hold > 0 ? '+' : '') + inr(t.hold) : '—',
            <span key="d" className="text-[12.5px] text-muted whitespace-normal">
              {t.sub}
              {t.status ? ' · ' + t.status : ''}
            </span>,
          ],
        }))}
      />
      <Pager meta={meta} page={page} setPage={setPage} />
    </>
  )
}

/* ---------------- withdrawals ---------------- */

const WD_TONE = { requested: 'orange', approved: 'blue', paid: 'green', rejected: 'red' }

export function Withdrawals() {
  const { isSuper } = useAdmin()
  const toast = useToast()
  const [status, setStatus] = useState('requested')
  const [page, setPage] = useState(1)
  const { data, meta, error, loading, reload } = useAdminData('/admin/withdrawals?page=' + page + (status ? '&status=' + status : ''))
  const [paying, setPaying] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  if (error) return <LoadError error={error} onRetry={reload} />
  const approve = async (w) => {
    try {
      await adminApi('/admin/withdrawals/' + w.id + '/approve', { method: 'POST' })
      toast(w.id + ' approved. Transfer the money, then mark it paid.', 'green')
      reload()
    } catch (e) {
      toast(errText(e), 'red')
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Withdrawals" sub="The amount already left the advocate's balance when they asked. Transfer it, then mark it paid with the bank reference. Rejecting returns it to their wallet." />
      <div className="flex flex-wrap gap-2">
        {[
          ['requested', 'Requested'],
          ['approved', 'Approved'],
          ['paid', 'Paid'],
          ['rejected', 'Rejected'],
          ['', 'All'],
        ].map(([k, l]) => (
          <Chip key={k} active={status === k} onClick={() => (setStatus(k), setPage(1))}>
            {l}
          </Chip>
        ))}
      </div>
      {!isSuper ? <Note tone="neutral">Only a super admin can approve, pay or reject withdrawals.</Note> : null}
      {loading && !data ? (
        <PageLoader />
      ) : (
        <Table
          head={['Withdrawal', 'Advocate', 'Amount', 'To', 'Status', '']}
          empty="Nothing here"
          rowKey={(_r, i) => data[i].id}
          rows={data.map((w) => ({
            cells: [
              <div key="n">
                <p className="font-bold">{w.id}</p>
                <p className="text-[12px] text-muted">{ago(new Date(w.at).getTime())}</p>
              </div>,
              <Link key="a" to={'/admin/advocates/' + w.advocateId} className="font-semibold text-gold-text hover:underline">
                Adv. {w.advocate}
              </Link>,
              <span key="m" className="font-bold">
                {inr(w.amount)}
              </span>,
              w.to,
              <span key="s" className="flex flex-col gap-1">
                <Pill tone={WD_TONE[w.status]}>{w.status}</Pill>
                {w.utr ? <span className="text-[11.5px] text-muted">UTR {w.utr}</span> : null}
                {w.reason ? <span className="text-[11.5px] text-muted whitespace-normal max-w-[200px]">{w.reason}</span> : null}
              </span>,
              isSuper && ['requested', 'approved'].includes(w.status) ? (
                <div key="x" className="flex gap-2 justify-end">
                  {w.status === 'requested' ? (
                    <Button size="sm" variant="line" onClick={() => approve(w)}>
                      Approve
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => setPaying(w)}>
                    Mark paid
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setRejecting(w)}>
                    Reject
                  </Button>
                </div>
              ) : null,
            ],
          }))}
        />
      )}
      <Pager meta={meta} page={page} setPage={setPage} />
      <ReasonModal
        open={!!paying}
        title={'Mark ' + (paying?.id ?? '') + ' paid'}
        intro={paying ? 'Transfer ' + inr(paying.amount) + ' to ' + paying.to + ' first, then enter the bank reference.' : ''}
        label="Bank reference (UTR)"
        minLength={6}
        multiline={false}
        action="Mark paid"
        onClose={() => setPaying(null)}
        onSubmit={async (utr) => {
          await adminApi('/admin/withdrawals/' + paying.id + '/paid', { method: 'POST', body: { utr } })
          setPaying(null)
          reload()
        }}
      />
      <ReasonModal
        open={!!rejecting}
        title={'Reject ' + (rejecting?.id ?? '')}
        intro={rejecting ? inr(rejecting.amount) + ' goes back to the advocate\'s wallet. They see your reason.' : ''}
        action="Reject"
        danger
        onClose={() => setRejecting(null)}
        onSubmit={async (reason) => {
          await adminApi('/admin/withdrawals/' + rejecting.id + '/reject', { method: 'POST', body: { reason } })
          setRejecting(null)
          reload()
        }}
      />
    </div>
  )
}

/** A confirm dialog that needs a short text (reason, UTR, note). */
export function ReasonModal({ open, title, intro, label = 'Reason (kept in the audit log)', action, danger, minLength = 5, multiline = true, onClose, onSubmit }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return null
  const go = async () => {
    setBusy(true)
    try {
      await onSubmit(text.trim())
      setText('')
      toast('Done', 'green')
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={() => (setText(''), onClose())}
      title={title}
      footer={
        <Button variant={danger ? 'danger' : 'gold'} loading={busy} disabled={text.trim().length < minLength} onClick={go}>
          {action}
        </Button>
      }>
      {intro ? <p className="text-[14px] text-text-2">{intro}</p> : null}
      <Field label={label} as={multiline ? 'textarea' : 'input'} value={text} onChange={(e) => setText(e.target.value)} maxLength={multiline ? 500 : 40} />
    </Modal>
  )
}
