import crypto from 'node:crypto'
import express, { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { withTransaction } from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAdmin, requireUser } from '../../middleware/auth.js'
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js'
import { created, escapeRegex, ok, pageArgs, pageMeta } from '../../utils/http.js'
import { toPaise, toRupees } from '../../utils/money.js'
import { logger } from '../../utils/logger.js'
import { gateway } from '../../providers/payments/index.js'
import { sandbox } from '../../providers/payments/sandbox.js'
import { audit } from '../audit/audit.service.js'
import { nextSeq } from '../common/counter.model.js'
import { getSettings } from '../settings/settings.service.js'
import { User } from '../users/user.model.js'
import { AdvocateProfile } from '../advocates/advocate.models.js'
import { Message, ServiceRequest } from '../requests/request.models.js'
import { notifyChange, notifyMessage, requestFor } from '../requests/request.service.js'
import { Wallet, WalletTransaction } from '../wallet/wallet.models.js'
import { getWallet, post, txView, walletView } from '../wallet/wallet.service.js'
import { Payment, PayoutAccount, WebhookEvent, Withdrawal } from './payment.models.js'
import { notifyUser } from '../notifications/notifications.js'
import { completeRequest, finalizePaid, markFailed, paymentView, previewServiceBill, refundPayment, startMembershipCheckout, startServiceCheckout, verifyFromClient } from './payment.service.js'

const numberParam = z.object({ number: z.string().regex(/^VB-\d{4,9}$/, 'Invalid request number') })
const payParam = z.object({ pay: z.string().regex(/^PAY-[A-Z0-9]{6,20}$/, 'Invalid payment') })
const billView = ({ bill, rates, walletBalancePaise, gstOnService, offer, cashbackPaise }) => ({
  offer: offer ? { title: offer.title, code: offer.code ?? null, kind: offer.kind, autoApplied: !offer.code || offer.autoApply, cashback: toRupees(cashbackPaise ?? 0) } : null,
  fee: toRupees(bill.feePaise),
  discount: toRupees(bill.discountPaise),
  base: toRupees(bill.basePaise),
  gst: toRupees(bill.gstPaise),
  gstPercent: rates.gstBp / 100,
  gstOnService,
  wallet: toRupees(bill.walletPaise),
  walletBalance: toRupees(walletBalancePaise),
  total: toRupees(bill.totalPaise),
})
const checkoutView = ({ payment, gateway: g }) => ({ payment: paymentView(payment), gateway: g ? { provider: g.provider, keyId: g.keyId ?? null, orderId: g.orderId, amount: g.amountPaise, currency: g.currency } : null })

/* ------------------------------------------------------------------ bank details (encrypted) */

const encKey = () => Buffer.from(env.FILES_ENC_KEY, 'base64')
function encrypt(text) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv)
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64')
}
const accountView = (a) => (a ? { holder: a.holder, accountLast4: a.accountLast4 ?? '', ifsc: a.ifsc, upi: a.upi } : null)
const destination = (a) => (a.upi ? a.upi : 'Bank ••' + a.accountLast4)

/* ================================================================== client */

export function clientPaymentRoutes() {
  const r = Router()
  r.use(requireUser('client'))

  r.get('/requests/:number/checkout', validate({ params: numberParam, query: z.object({ useWallet: z.enum(['0', '1']).default('0'), code: z.string().trim().max(20).optional() }) }), async (req, res) => {
    const doc = await requestFor(req.valid.params.number, req.auth)
    const preview = await previewServiceBill(doc, req.auth.id, { useWallet: req.valid.query.useWallet === '1', code: req.valid.query.code || undefined })
    ok(res, billView(preview))
  })

  r.post('/requests/:number/checkout', validate({ params: numberParam, body: z.object({ useWallet: z.boolean().default(false), code: z.string().trim().max(20).optional() }) }), async (req, res) => {
    const doc = await requestFor(req.valid.params.number, req.auth)
    created(res, checkoutView(await startServiceCheckout(doc, req.auth, { useWallet: req.valid.body.useWallet, code: req.valid.body.code || undefined })))
  })

  r.post('/requests/:number/confirm', validate({ params: numberParam, body: z.object({ rating: z.number().int().min(1).max(5), review: z.string().trim().max(1000).optional() }) }), async (req, res) => {
    const doc = await requestFor(req.valid.params.number, req.auth)
    await completeRequest(doc.number, { by: 'client', rating: req.valid.body.rating, review: req.valid.body.review })
    ok(res, { status: 'completed' })
  })

  /** Instead of confirming: the payment stays on hold until the admin decides (SCOPE-OF-WORK 1.6). */
  r.post('/requests/:number/dispute', validate({ params: numberParam, body: z.object({ reason: z.string().trim().min(10, 'Tell us what went wrong').max(1000) }) }), async (req, res) => {
    const doc = await requestFor(req.valid.params.number, req.auth)
    const upd = await ServiceRequest.findOneAndUpdate({ _id: doc._id, status: { $in: ['paid', 'done'] } }, { $set: { status: 'disputed', dispute: { reason: req.valid.body.reason, at: new Date(), status: 'open' } }, $unset: { autoConfirmAt: 1 } }, { new: true })
    if (!upd) throw conflict('A dispute can be raised after paying and before confirming', 'CANNOT_DISPUTE')
    const m = await Message.create({ request: upd._id, from: 'system', kind: 'text', text: 'Dispute raised. Our team will reply in this chat within 24 hours. The payment stays on hold.' })
    notifyChange(upd)
    notifyMessage(upd, m)
    notifyUser(upd.advocate, 'Dispute raised', 'The client raised a dispute on case ' + upd.number + '. The payment stays on hold while our team reviews it.', { kind: 'case', id: upd.number })
    ok(res, { status: 'disputed' })
  })

  r.get('/wallet', async (req, res) => {
    const [w, tx] = await Promise.all([getWallet(req.auth.id, 'client'), WalletTransaction.find({ user: req.auth.id }).sort({ createdAt: -1 }).limit(100)])
    ok(res, { ...walletView(w), tx: tx.map(txView) })
  })

  return r
}

/* ================================================================== advocate */

export function advocatePaymentRoutes() {
  const r = Router()
  r.use(requireUser('advocate'))

  /** Mark work as done: the client then confirms, disputes, or it confirms itself after N days. */
  r.post('/cases/:number/done', validate({ params: numberParam }), async (req, res) => {
    const settings = await getSettings()
    const now = new Date()
    const upd = await ServiceRequest.findOneAndUpdate(
      { number: req.valid.params.number, advocate: req.auth.id, status: 'paid' },
      { $set: { status: 'done', doneAt: now, autoConfirmAt: new Date(now.getTime() + settings.autoConfirmDays * 86400000) } },
      { new: true },
    )
    if (!upd) throw conflict('Work can be marked done after the client has paid', 'CANNOT_MARK_DONE')
    const m = await Message.create({ request: upd._id, from: 'system', kind: 'text', text: 'The advocate marked the work as done. Confirm or raise a dispute within ' + settings.autoConfirmDays + ' days.' })
    notifyChange(upd)
    notifyMessage(upd, m)
    notifyUser(upd.client, 'Work marked as done', 'Please confirm request ' + upd.number + ' or raise a dispute within ' + settings.autoConfirmDays + ' days.', { kind: 'request', id: upd.number })
    ok(res, { status: 'done', autoConfirmAt: upd.autoConfirmAt })
  })

  r.get('/wallet', async (req, res) => {
    const [w, tx] = await Promise.all([getWallet(req.auth.id, 'advocate'), WalletTransaction.find({ user: req.auth.id }).sort({ createdAt: -1 }).limit(100)])
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const month = await WalletTransaction.aggregate([{ $match: { user: new mongoose.Types.ObjectId(req.auth.id), type: 'earn', createdAt: { $gte: monthStart } } }, { $group: { _id: null, net: { $sum: '$amountPaise' }, n: { $sum: 1 } } }])
    const acct = await PayoutAccount.findOne({ user: req.auth.id }).lean()
    ok(res, { ...walletView(w), month: { earned: toRupees(month[0]?.net ?? 0), cases: month[0]?.n ?? 0 }, account: accountView(acct), tx: tx.map(txView) })
  })

  r.get('/payout-account', async (req, res) => ok(res, accountView(await PayoutAccount.findOne({ user: req.auth.id }).lean())))

  r.put(
    '/payout-account',
    validate({
      body: z
        .object({
          holder: z.string().trim().min(2).max(80),
          account: z.string().trim().regex(/^\d{9,18}$/, 'Account number: 9 to 18 digits').optional().or(z.literal('')),
          ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC').optional().or(z.literal('')),
          upi: z.string().trim().toLowerCase().regex(/^[a-z0-9.\-_]{2,256}@[a-z]{2,64}$/, 'Enter a valid UPI ID').optional().or(z.literal('')),
        })
        .refine((b) => b.upi || (b.account && b.ifsc), 'Add a UPI ID, or a bank account number with its IFSC'),
    }),
    async (req, res) => {
      const b = req.valid.body
      const set = { holder: b.holder, upi: b.upi || '', ifsc: b.ifsc || '' }
      if (b.account) Object.assign(set, { accountEnc: encrypt(b.account), accountLast4: b.account.slice(-4) })
      else Object.assign(set, { accountEnc: null, accountLast4: '' })
      ok(res, accountView(await PayoutAccount.findOneAndUpdate({ user: req.auth.id }, { $set: set }, { upsert: true, new: true })))
    },
  )

  r.get('/withdrawals', async (req, res) => {
    const list = await Withdrawal.find({ user: req.auth.id }).sort({ createdAt: -1 }).limit(100).lean()
    ok(res, list.map((w) => ({ id: w.number, amount: toRupees(w.amountPaise), to: w.to, status: w.status, utr: w.utr ?? null, reason: w.reason ?? null, at: w.createdAt })))
  })

  /** Withdraw from the balance. The amount is reserved now; the admin approves and pays it. */
  r.post('/withdrawals', validate({ body: z.object({ amount: z.number().positive().refine((n) => Math.round(n * 100) === n * 100, 'At most 2 decimal places') }) }), async (req, res) => {
    const amountPaise = toPaise(req.valid.body.amount)
    const [settings, acct, profile] = await Promise.all([getSettings(), PayoutAccount.findOne({ user: req.auth.id }).lean(), AdvocateProfile.findOne({ user: req.auth.id }).lean()])
    if (profile?.verification?.status !== 'approved') throw forbidden('Your profile is not verified', 'NOT_VERIFIED')
    if (!acct || (!acct.upi && !acct.accountLast4)) throw badRequest('Add your bank account or UPI ID first', { reason: 'NO_PAYOUT_ACCOUNT' })
    if (settings.minWithdrawalPaise != null && amountPaise < settings.minWithdrawalPaise) throw badRequest('The minimum withdrawal is ₹' + toRupees(settings.minWithdrawalPaise))
    const w = await withTransaction(async (session) => {
      const number = 'WD-' + (await nextSeq('withdrawal', 200, session))
      const [doc] = await Withdrawal.create([{ number, user: req.auth.id, amountPaise, to: destination(acct) }], { session })
      await post(session, { userId: req.auth.id, role: 'advocate', type: 'withdraw', amount: -amountPaise, title: 'Withdrawal ' + number, sub: 'To ' + doc.to, ref: { kind: 'withdrawal', id: number }, status: 'Requested · admin approves', key: 'wd:' + number })
      return doc
    })
    created(res, { id: w.number, amount: toRupees(w.amountPaise), to: w.to, status: w.status })
  })

  r.post('/membership/checkout', validate({ body: z.object({ planId: z.string().regex(/^[a-f0-9]{24}$/, 'Choose a plan'), code: z.string().trim().max(20).optional() }) }), async (req, res) => {
    created(res, checkoutView(await startMembershipCheckout(req.auth, req.valid.body.planId, req.valid.body.code || undefined)))
  })

  return r
}

/* ================================================================== payments (verify, cancel, sandbox, webhook) */

async function ownPayment(req) {
  const p = await Payment.findOne({ number: req.valid.params.pay })
  if (!p || String(p.user) !== req.auth.id) throw notFound('Payment')
  return p
}

export function paymentRoutes() {
  const r = Router()

  r.get('/:pay', requireUser(), validate({ params: payParam }), async (req, res) => ok(res, paymentView(await ownPayment(req))))

  /** The gateway's answer from the browser. Checked on the server before anything changes. */
  r.post(
    '/:pay/verify',
    requireUser(),
    validate({ params: payParam, body: z.object({ orderId: z.string().min(5).max(80), paymentId: z.string().min(5).max(80), signature: z.string().min(10).max(200) }) }),
    async (req, res) => ok(res, paymentView(await verifyFromClient(await ownPayment(req), req.valid.body))),
  )

  /** The user closed the payment window: release the checkout (and any wallet amount). */
  r.post('/:pay/cancel', requireUser(), validate({ params: payParam }), async (req, res) => {
    const p = await ownPayment(req)
    if (p.status === 'created') await markFailed(p._id, 'Cancelled by the user')
    ok(res, paymentView(await Payment.findById(p._id)))
  })

  /** DEVELOPMENT SANDBOX ONLY: stands in for the gateway's payment window. */
  r.post('/:pay/sandbox-pay', requireUser(), validate({ params: payParam }), async (req, res) => {
    if (gateway().name !== 'sandbox') throw notFound('Endpoint')
    const p = await ownPayment(req)
    if (p.status !== 'created' || !p.orderId) throw conflict('This checkout is no longer open', 'CHECKOUT_CLOSED')
    const out = sandbox.pay(p.orderId)
    if (!out) throw conflict('Sandbox order not found (the server restarted). Start the checkout again.', 'CHECKOUT_CLOSED')
    ok(res, out)
  })

  return r
}

/**
 * Gateway webhook: raw body (the signature covers the exact bytes). Mounted BEFORE the JSON
 * parser. Duplicate deliveries are ignored; always answers 200 once the event is recorded.
 */
export function webhookRoutes() {
  const r = Router()
  r.post('/razorpay', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    let provider
    try {
      provider = gateway()
    } catch {
      return res.status(503).end()
    }
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : ''
    if (provider.name !== 'razorpay' || !provider.verifyWebhook(raw, req.get('x-razorpay-signature'))) return res.status(400).json({ success: false, error: { code: 'BAD_SIGNATURE', message: 'Invalid webhook signature' } })
    const ev = provider.parseWebhook(JSON.parse(raw), req.headers)
    try {
      await WebhookEvent.create({ _id: ev.eventId, provider: 'razorpay', kind: ev.kind, orderId: ev.orderId })
    } catch (e) {
      if (e?.code === 11000) return res.json({ success: true, data: { duplicate: true } })
      throw e
    }
    if (ev.kind !== 'ignore' && ev.orderId) {
      const p = await Payment.findOne({ orderId: ev.orderId })
      if (p && p.status === 'created') {
        if (ev.kind === 'paid') {
          const c = await provider.confirm({ paymentId: ev.paymentId, orderId: ev.orderId, amountPaise: p.amounts.totalPaise })
          if (c.ok) await finalizePaid(p._id, { gatewayPaymentId: ev.paymentId, method: c.method })
          else logger.warn({ payment: p.number, reason: c.reason }, 'Webhook payment not confirmed')
        } else if (ev.kind === 'failed') await markFailed(p._id, ev.reason || 'Payment failed')
      }
    }
    res.json({ success: true, data: { received: true } })
  })
  return r
}

/* ================================================================== admin */

export function adminMoneyRoutes() {
  const r = Router()
  r.use(requireAdmin())

  r.get(
    '/payments',
    validate({ query: z.object({ status: z.string().max(20).optional(), purpose: z.enum(['service', 'membership', 'challan', 'gst']).optional(), attention: z.enum(['1']).optional(), q: z.string().max(30).optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }) }),
    async (req, res) => {
      const q = req.valid.query
      const pg = pageArgs(q)
      const f = {}
      if (q.status) f.status = q.status
      if (q.purpose) f.purpose = q.purpose
      if (q.attention) f.needsAttention = { $ne: null }
      if (q.q) f.number = new RegExp(escapeRegex(q.q), 'i')
      const [items, total] = await Promise.all([Payment.find(f).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('user', 'name phone role').populate('request', 'number').populate('challanOrder', 'number').populate('gstFiling', 'number').lean(), Payment.countDocuments(f)])
      ok(
        res,
        items.map((p) => ({ ...paymentView(p), who: p.user?.name || '+91 ' + p.user?.phone, role: p.user?.role, request: p.request?.number ?? p.challanOrder?.number ?? p.gstFiling?.number ?? null, plan: p.planName ?? null, provider: p.provider, needsAttention: p.needsAttention, commission: toRupees(p.payout?.commissionPaise ?? 0), gstOnCommission: toRupees(p.payout?.gstOnCommissionPaise ?? 0), at: p.createdAt })),
        pageMeta(pg, total),
      )
    },
  )

  /** Refund a paid payment that needs attention (e.g. paid after the request changed). Disputes use /requests/:n/resolve. */
  r.post('/payments/:pay/refund', requireAdmin('super_admin'), validate({ params: payParam, body: z.object({ reason: z.string().trim().min(5).max(300) }) }), async (req, res) => {
    const p = await Payment.findOne({ number: req.valid.params.pay })
    if (!p) throw notFound('Payment')
    if (!p.needsAttention) throw conflict('Refund service payments by resolving the dispute on the request', 'USE_DISPUTE')
    const out = await refundPayment(p, { adminId: req.auth.id, reason: req.valid.body.reason })
    await audit(req, { action: 'payment.refunded', entityType: 'Payment', entityId: p.number, after: { amount: toRupees(p.amounts.totalPaise + p.amounts.walletPaise), reason: req.valid.body.reason } })
    ok(res, paymentView(out))
  })

  /** Disputes: release the payment to the advocate, or refund the client in full. */
  r.post('/requests/:number/resolve', validate({ params: numberParam, body: z.object({ outcome: z.enum(['release', 'refund']), note: z.string().trim().min(5, 'Explain the decision').max(500) }) }), async (req, res) => {
    const doc = await ServiceRequest.findOne({ number: req.valid.params.number })
    if (!doc || doc.status !== 'disputed') throw conflict('Only disputed requests can be resolved here', 'NOT_DISPUTED')
    const { outcome, note } = req.valid.body
    if (outcome === 'release') await completeRequest(doc.number, { by: 'admin', fromStatuses: ['disputed'], adminId: req.auth.id, note })
    else await refundPayment(await Payment.findById(doc.payment), { adminId: req.auth.id, reason: note, requestNumber: doc.number })
    await audit(req, { action: 'dispute.' + (outcome === 'release' ? 'released' : 'refunded'), entityType: 'ServiceRequest', entityId: doc.number, after: { outcome, note } })
    ok(res, { status: outcome === 'release' ? 'completed' : 'refunded' })
  })

  r.get('/withdrawals', validate({ query: z.object({ status: z.enum(['requested', 'approved', 'paid', 'rejected']).optional(), page: z.coerce.number().int().min(1).optional() }) }), async (req, res) => {
    const pg = pageArgs({ ...req.valid.query, limit: 25 })
    const f = req.valid.query.status ? { status: req.valid.query.status } : {}
    const [items, total] = await Promise.all([Withdrawal.find(f).sort({ createdAt: f.status === 'requested' ? 1 : -1 }).skip(pg.skip).limit(pg.limit).populate('user', 'name phone').lean(), Withdrawal.countDocuments(f)])
    ok(res, items.map((w) => ({ id: w.number, advocate: w.user?.name, advocateId: String(w.user?._id), amount: toRupees(w.amountPaise), to: w.to, status: w.status, utr: w.utr ?? null, reason: w.reason ?? null, at: w.createdAt, decidedAt: w.decidedAt ?? null })), pageMeta(pg, total))
  })

  const wdParam = z.object({ wd: z.string().regex(/^WD-\d+$/) })
  r.post('/withdrawals/:wd/approve', requireAdmin('super_admin'), validate({ params: wdParam }), async (req, res) => {
    const w = await Withdrawal.findOneAndUpdate({ number: req.valid.params.wd, status: 'requested' }, { $set: { status: 'approved', decidedBy: req.auth.id, decidedAt: new Date() } }, { new: true })
    if (!w) throw conflict('Only requested withdrawals can be approved', 'BAD_STATE')
    await audit(req, { action: 'withdrawal.approved', entityType: 'Withdrawal', entityId: w.number, after: { amount: toRupees(w.amountPaise) } })
    ok(res, { id: w.number, status: w.status })
  })

  r.post('/withdrawals/:wd/paid', requireAdmin('super_admin'), validate({ params: wdParam, body: z.object({ utr: z.string().trim().min(6, 'Enter the bank reference (UTR)').max(40) }) }), async (req, res) => {
    const w = await Withdrawal.findOneAndUpdate({ number: req.valid.params.wd, status: { $in: ['requested', 'approved'] } }, { $set: { status: 'paid', utr: req.valid.body.utr, decidedBy: req.auth.id, decidedAt: new Date() } }, { new: true })
    if (!w) throw conflict('This withdrawal is already closed', 'BAD_STATE')
    await WalletTransaction.updateOne({ key: 'wd:' + w.number }, { $set: { status: 'Paid · UTR ' + w.utr } })
    notifyUser(w.user, 'Withdrawal paid', '₹' + toRupees(w.amountPaise).toLocaleString('en-IN') + ' was sent to ' + w.to + '. Bank reference ' + w.utr + '.', { kind: 'wallet' })
    await audit(req, { action: 'withdrawal.paid', entityType: 'Withdrawal', entityId: w.number, after: { amount: toRupees(w.amountPaise), utr: w.utr } })
    ok(res, { id: w.number, status: w.status })
  })

  r.post('/withdrawals/:wd/reject', requireAdmin('super_admin'), validate({ params: wdParam, body: z.object({ reason: z.string().trim().min(5).max(300) }) }), async (req, res) => {
    const w = await withTransaction(async (session) => {
      const doc = await Withdrawal.findOneAndUpdate({ number: req.valid.params.wd, status: { $in: ['requested', 'approved'] } }, { $set: { status: 'rejected', reason: req.valid.body.reason, decidedBy: req.auth.id, decidedAt: new Date() } }, { new: true, session })
      if (!doc) throw conflict('This withdrawal is already closed', 'BAD_STATE')
      await post(session, { userId: doc.user, role: 'advocate', type: 'withdraw_reversal', amount: doc.amountPaise, title: 'Withdrawal ' + doc.number + ' rejected', sub: req.valid.body.reason, ref: { kind: 'withdrawal', id: doc.number }, status: 'Returned to wallet', key: 'wd:' + doc.number + ':reversal' })
      await WalletTransaction.updateOne({ key: 'wd:' + doc.number }, { $set: { status: 'Rejected' } }, { session })
      await audit(req, { action: 'withdrawal.rejected', entityType: 'Withdrawal', entityId: doc.number, after: { amount: toRupees(doc.amountPaise), reason: req.valid.body.reason } }, session)
      return doc
    })
    notifyUser(w.user, 'Withdrawal returned', '₹' + toRupees(w.amountPaise).toLocaleString('en-IN') + ' is back in your wallet: ' + req.valid.body.reason, { kind: 'wallet' })
    ok(res, { id: w.number, status: w.status })
  })

  r.get('/wallet-transactions', validate({ query: z.object({ type: z.string().max(30).optional(), page: z.coerce.number().int().min(1).optional() }) }), async (req, res) => {
    const pg = pageArgs({ ...req.valid.query, limit: 50 })
    const f = req.valid.query.type ? { type: req.valid.query.type } : {}
    const [items, total] = await Promise.all([WalletTransaction.find(f).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('user', 'name phone role'), WalletTransaction.countDocuments(f)])
    ok(res, items.map((t) => ({ ...txView(t), who: t.user?.name || '+91 ' + t.user?.phone, role: t.user?.role })), pageMeta(pg, total))
  })

  /** Manual wallet correction (SCOPE-OF-WORK 12: wallet adjustments). Always with a reason; audited. */
  r.post(
    '/wallets/:id/adjust',
    requireAdmin('super_admin'),
    validate({ params: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }), body: z.object({ amount: z.number().refine((n) => n !== 0 && Math.round(n * 100) === n * 100, 'A non-zero amount with at most 2 decimals'), reason: z.string().trim().min(5).max(300) }) }),
    async (req, res) => {
      const u = await User.findById(req.valid.params.id)
      if (!u) throw notFound('User')
      const amount = toPaise(req.valid.body.amount)
      const key = 'adj:' + crypto.randomUUID()
      await withTransaction(async (session) => {
        await post(session, { userId: u._id, role: u.role, type: 'adjustment', amount, title: amount > 0 ? 'Credit from Vakeel Bhai' : 'Correction by Vakeel Bhai', sub: req.valid.body.reason, ref: { kind: 'adjustment', id: key }, key })
        await audit(req, { action: 'wallet.adjusted', entityType: 'User', entityId: u.id, after: { amount: req.valid.body.amount, reason: req.valid.body.reason } }, session)
      })
      ok(res, walletView(await Wallet.findOne({ user: u._id })))
    },
  )

  return r
}

/** Money figures for the admin dashboard (SOW 15.1: total earnings, commission and GST reports). */
export async function moneyStats() {
  const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const agg = (match) =>
    Payment.aggregate([
      { $match: match },
      { $group: { _id: '$purpose', collected: { $sum: { $add: ['$amounts.totalPaise', '$amounts.walletPaise'] } }, gst: { $sum: '$amounts.gstPaise' }, commission: { $sum: { $ifNull: ['$payout.commissionPaise', 0] } }, gstOnCommission: { $sum: { $ifNull: ['$payout.gstOnCommissionPaise', 0] } }, n: { $sum: 1 } } },
    ])
  const [all, month, pendingWd, attention, disputes] = await Promise.all([
    agg({ status: 'paid' }),
    agg({ status: 'paid', paidAt: { $gte: since } }),
    Withdrawal.aggregate([{ $match: { status: { $in: ['requested', 'approved'] } } }, { $group: { _id: null, n: { $sum: 1 }, amount: { $sum: '$amountPaise' } } }]),
    Payment.countDocuments({ needsAttention: { $ne: null }, status: 'paid' }),
    ServiceRequest.countDocuments({ status: 'disputed' }),
  ])
  const sum = (rows) => {
    const s = (p, k) => rows.find((x) => x._id === p)?.[k] ?? 0
    return {
      collected: toRupees(s('service', 'collected') + s('membership', 'collected') + s('challan', 'collected') + s('gst', 'collected')),
      gstFiling: toRupees(s('gst', 'collected')),
      challans: toRupees(s('challan', 'collected')),
      services: toRupees(s('service', 'collected')),
      memberships: toRupees(s('membership', 'collected')),
      commission: toRupees(s('service', 'commission')),
      gst: toRupees(s('service', 'gst') + s('membership', 'gst') + s('challan', 'gst') + s('gst', 'gst') + s('service', 'gstOnCommission')),
    }
  }
  return { allTime: sum(all), thisMonth: sum(month), withdrawalsPending: { count: pendingWd[0]?.n ?? 0, amount: toRupees(pendingWd[0]?.amount ?? 0) }, paymentsNeedingAttention: attention, openDisputes: disputes }
}
