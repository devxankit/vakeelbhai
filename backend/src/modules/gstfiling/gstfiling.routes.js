import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { withTransaction } from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAdmin, requireUser } from '../../middleware/auth.js'
import { singleImage } from '../../middleware/upload.js'
import { badRequest, conflict, notFound } from '../../utils/errors.js'
import { created, escapeRegex, ok, pageArgs, pageMeta } from '../../utils/http.js'
import { toPaise, toRupees } from '../../utils/money.js'
import { removePrivate, savePrivate, sendPrivate } from '../../providers/storage/privateFiles.js'
import { gateway } from '../../providers/payments/index.js'
import { toAdmins, toUser } from '../../realtime/io.js'
import { audit } from '../audit/audit.service.js'
import { nextSeq } from '../common/counter.model.js'
import { getSettings } from '../settings/settings.service.js'
import { membershipTotal } from '../pricing/pricing.js'
import { User } from '../users/user.model.js'
import { Payment } from '../payments/payment.models.js'
import { paymentView, refundPayment } from '../payments/payment.service.js'
import { SupportMessage, SupportTicket } from '../support/support.models.js'
import { notifyUser } from '../notifications/notifications.js'
import { GST_RETURN_TYPES, GST_STATUS, GstFiling } from './gstfiling.models.js'

const numberParam = z.object({ number: z.string().regex(/^GST-\d{4,9}$/, 'Invalid request') })
const MAX_DOCS = 10
const iso = (d) => (d ? new Date(d).toISOString() : null)
const STATUS_TEXT = { requested: 'Requested', in_review: 'In review', documents_needed: 'Documents needed', filed: 'Filed', closed: 'Closed' }

export function gstView(g, settings) {
  const gstBp = settings?.gstBp ?? 1800
  const t = g.feePaise != null ? membershipTotal(g.feePaise, gstBp) : null
  return {
    id: g.number,
    returnType: g.returnType,
    gstin: g.gstin,
    businessName: g.businessName,
    period: g.period,
    note: g.note,
    docs: g.docs.map((d) => ({ id: String(d._id), name: d.name ?? '', at: iso(d.createdAt) })),
    status: g.status,
    fee: t ? { fee: toRupees(t.basePaise), gst: toRupees(t.gstPaise), total: toRupees(t.totalPaise), gstPercent: gstBp / 100 } : null,
    paid: !!g.paidAt,
    paidAt: iso(g.paidAt),
    filedRef: g.filedRef || null,
    ticket: g.ticketNumber ?? null,
    events: g.events.map((e) => ({ status: e.status, at: iso(e.at), note: e.note ?? null })),
    createdAt: iso(g.createdAt),
  }
}

function notify(g) {
  toUser(g.user, 'gst:update', { number: g.number })
  toAdmins('gst:update', { number: g.number })
}

async function withTicket(g) {
  const t = g.ticket ? await SupportTicket.findById(g.ticket).select('number').lean() : null
  return Object.assign(g, { ticketNumber: t?.number ?? null })
}

/* ================================================================== client */

export function clientGstRoutes() {
  const r = Router()
  r.use(requireUser('client'))

  const own = async (req) => {
    const g = await GstFiling.findOne({ number: req.valid.params.number, user: req.auth.id })
    if (!g) throw notFound('GST request')
    return g
  }

  r.get('/', async (req, res) => {
    const [list, settings] = await Promise.all([GstFiling.find({ user: req.auth.id }).sort({ createdAt: -1 }).limit(100), getSettings()])
    ok(res, await Promise.all(list.map(async (g) => gstView(await withTicket(g), settings))))
  })

  r.post(
    '/',
    validate({
      body: z
        .object({
          returnType: z.enum(GST_RETURN_TYPES),
          gstin: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z0-9]{13}$/, 'Enter a valid 15-character GSTIN')]).default(''),
          businessName: z.string().trim().max(120).default(''),
          period: z.string().trim().max(40).default(''),
          note: z.string().trim().max(1000).default(''),
        })
        .refine((b) => b.returnType === 'New GST registration' || b.gstin, { message: 'Enter your GSTIN', path: ['gstin'] })
        .refine((b) => b.returnType !== 'New GST registration' || b.businessName.length >= 2, { message: 'Enter the business name', path: ['businessName'] })
        .refine((b) => b.returnType === 'New GST registration' || b.period.length >= 3, { message: 'Enter the return period, e.g. October 2026', path: ['period'] }),
    }),
    async (req, res) => {
      const b = req.valid.body
      const g = await withTransaction(async (session) => {
        const number = 'GST-' + (await nextSeq('gstFiling', 1000, session))
        const tnum = 'HD-' + (await nextSeq('supportTicket', 1000, session))
        const [t] = await SupportTicket.create([{ number: tnum, user: req.auth.id, role: 'client', topic: 'gst', subject: b.returnType + (b.period ? ' · ' + b.period : '') + ' (' + number + ')', ref: number }], { session })
        await SupportMessage.create([{ ticket: t._id, from: 'system', kind: 'text', text: 'GST request ' + number + ' received. Our team reviews it, tells you the fee, and replies here.' }], { session })
        const [doc] = await GstFiling.create([{ number, user: req.auth.id, ...b, ticket: t._id, events: [{ status: 'requested', at: new Date() }] }], { session })
        return doc
      })
      notify(g)
      created(res, gstView(await withTicket(g), await getSettings()))
    },
  )

  r.get('/:number', validate({ params: numberParam }), async (req, res) => ok(res, gstView(await withTicket(await own(req)), await getSettings())))

  r.post('/:number/documents', validate({ params: numberParam }), singleImage('file'), async (req, res) => {
    const g = await own(req)
    if (['filed', 'closed'].includes(g.status)) throw conflict('This request is closed')
    const saved = await savePrivate(req.file.buffer, req.auth.id)
    const upd = await GstFiling.findOneAndUpdate({ _id: g._id, [`docs.${MAX_DOCS - 1}`]: { $exists: false } }, { $push: { docs: { file: { ...saved, mime: req.file.mime, uploadedAt: new Date() }, name: String(req.body?.name ?? '').slice(0, 80) } } }, { new: true })
    if (!upd) {
      await removePrivate(saved.path)
      throw conflict('You can add up to ' + MAX_DOCS + ' documents')
    }
    notify(upd)
    created(res, gstView(await withTicket(upd), await getSettings()))
  })

  r.get('/:number/documents/:did', validate({ params: numberParam.extend({ did: z.string().regex(/^[a-f0-9]{24}$/) }) }), async (req, res) => {
    const g = await own(req)
    const d = g.docs.id(req.valid.params.did)
    if (!d) throw notFound('Document')
    await sendPrivate(res, d.file)
  })

  /** Pay the fee the team set (fee + GST). */
  r.post('/:number/checkout', validate({ params: numberParam }), async (req, res) => {
    const g = await own(req)
    if (g.feePaise == null) throw conflict('Our team has not set the fee yet', 'NO_FEE')
    if (g.paidAt) throw conflict('Already paid', 'ALREADY_PAID')
    if (g.status === 'closed') throw conflict('This request is closed')
    const settings = await getSettings()
    const t = membershipTotal(g.feePaise, settings.gstBp)
    if (t.totalPaise <= 0) throw badRequest('Nothing to pay')
    const provider = gateway()
    const payment = await withTransaction(async (session) => {
      const open = await Payment.find({ gstFiling: g._id, status: 'created' }).session(session)
      for (const p of open) await Payment.updateOne({ _id: p._id, status: 'created' }, { $set: { status: 'cancelled', failureReason: 'A new checkout was started' } }, { session })
      const [p] = await Payment.create(
        [{ number: 'PAY-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase(), user: req.auth.id, purpose: 'gst', gstFiling: g._id, amounts: { feePaise: t.pricePaise, basePaise: t.basePaise, gstPaise: t.gstPaise, totalPaise: t.totalPaise }, rates: { gstBp: settings.gstBp }, provider: provider.name, expiresAt: new Date(Date.now() + env.PAYMENT_EXPIRY_MINUTES * 60000) }],
        { session },
      )
      return p
    })
    try {
      const { orderId } = await provider.createOrder({ amountPaise: t.totalPaise, receipt: payment.number, notes: { purpose: 'gst', request: g.number, payment: payment.number } })
      payment.orderId = orderId
      await payment.save()
    } catch (e) {
      await Payment.updateOne({ _id: payment._id, status: 'created' }, { $set: { status: 'failed', failureReason: 'Gateway order failed' } })
      throw e
    }
    const pc = provider.publicConfig()
    created(res, { payment: paymentView(payment), gateway: { provider: pc.provider, keyId: pc.keyId ?? null, orderId: payment.orderId, amount: t.totalPaise, currency: 'INR' } })
  })

  return r
}

/* ================================================================== admin */

export function adminGstRoutes() {
  const r = Router()
  r.use(requireAdmin())

  r.get('/', validate({ query: z.object({ status: z.enum([...GST_STATUS, 'open', 'all']).default('open'), q: z.string().trim().max(30).optional(), page: z.coerce.number().int().min(1).optional() }) }), async (req, res) => {
    const q = req.valid.query
    const pg = pageArgs({ ...q, limit: 25 })
    const f = q.status === 'all' ? {} : q.status === 'open' ? { status: { $in: ['requested', 'in_review', 'documents_needed'] } } : { status: q.status }
    if (q.q) f.$or = [{ number: new RegExp(escapeRegex(q.q), 'i') }, { gstin: new RegExp(escapeRegex(q.q.toUpperCase()), 'i') }]
    const [items, total, settings] = await Promise.all([GstFiling.find(f).sort({ updatedAt: q.status === 'open' ? 1 : -1 }).skip(pg.skip).limit(pg.limit).populate('user', 'name phone'), GstFiling.countDocuments(f), getSettings()])
    ok(res, await Promise.all(items.map(async (g) => ({ ...gstView(await withTicket(g), settings), client: g.user?.name || 'Client', clientPhone: g.user?.phone ?? null }))), pageMeta(pg, total))
  })

  r.get('/:number', validate({ params: numberParam }), async (req, res) => {
    const g = await GstFiling.findOne({ number: req.valid.params.number })
    if (!g) throw notFound('GST request')
    const u = await User.findById(g.user).select('name phone email').lean()
    const p = g.payment ? await Payment.findById(g.payment).lean() : null
    ok(res, { ...gstView(await withTicket(g), await getSettings()), client: { id: String(g.user), name: u?.name ?? '', phone: u?.phone ?? '', email: u?.email ?? '' }, payment: p ? paymentView(p) : null })
  })

  r.get('/:number/documents/:did', validate({ params: numberParam.extend({ did: z.string().regex(/^[a-f0-9]{24}$/) }) }), async (req, res) => {
    const g = await GstFiling.findOne({ number: req.valid.params.number })
    const d = g?.docs.id(req.valid.params.did)
    if (!d) throw notFound('Document')
    await sendPrivate(res, d.file)
  })

  /** Move the request on: set the fee, ask for documents, mark it filed (with the ARN), close it. */
  r.post(
    '/:number/update',
    validate({
      params: numberParam,
      body: z
        .object({
          status: z.enum(GST_STATUS),
          fee: z.number().min(0).max(1_000_000).optional(),
          filedRef: z.string().trim().max(40).optional(),
          note: z.string().trim().max(500).optional(),
        })
        .refine((b) => b.status !== 'filed' || (b.filedRef && b.filedRef.length >= 5), { message: 'Enter the acknowledgement number (ARN)', path: ['filedRef'] }),
    }),
    async (req, res) => {
      const b = req.valid.body
      const g = await GstFiling.findOne({ number: req.valid.params.number })
      if (!g) throw notFound('GST request')
      if (g.status === 'closed') throw conflict('This request is closed')
      if (b.fee !== undefined && g.paidAt) throw conflict('The fee is already paid and cannot change', 'ALREADY_PAID')
      if (b.status === 'filed' && g.feePaise != null && g.feePaise > 0 && !g.paidAt) throw conflict('The client has not paid the fee yet', 'NOT_PAID')
      const set = { status: b.status }
      if (b.fee !== undefined) set.feePaise = toPaise(b.fee)
      if (b.filedRef) set.filedRef = b.filedRef
      const upd = await GstFiling.findByIdAndUpdate(g._id, { $set: set, $push: { events: { status: b.status, at: new Date(), note: b.note ?? (b.fee !== undefined ? 'Fee set: ₹' + b.fee : undefined) } } }, { new: true })
      if (g.ticket) {
        const text = 'Status: ' + STATUS_TEXT[b.status] + (b.fee !== undefined ? ' · Fee ₹' + b.fee + ' + GST. Pay it in the app to start.' : '') + (b.filedRef ? ' · ARN ' + b.filedRef : '') + (b.note ? ' · ' + b.note : '')
        await SupportMessage.create({ ticket: g.ticket, from: 'system', kind: 'text', text })
        await SupportTicket.updateOne({ _id: g.ticket }, { $set: { status: b.status === 'closed' ? 'closed' : 'answered', userUnread: true, lastMessageAt: new Date() } })
      }
      await audit(req, { action: 'gst.' + b.status, entityType: 'GstFiling', entityId: g.number, after: b })
      notify(upd)
      notifyUser(g.user, 'GST request ' + g.number, STATUS_TEXT[b.status] + (b.fee !== undefined ? '. Fee: ₹' + b.fee + ' + GST.' : '') + (b.note ? ' ' + b.note : ''), { kind: 'gst', id: g.number })
      ok(res, gstView(await withTicket(upd), await getSettings()))
    },
  )

  /** Refund a paid fee (the filing will not go ahead). Super admin; audited. */
  r.post('/:number/refund', requireAdmin('super_admin'), validate({ params: numberParam, body: z.object({ reason: z.string().trim().min(5).max(300) }) }), async (req, res) => {
    const g = await GstFiling.findOne({ number: req.valid.params.number })
    if (!g?.payment) throw conflict('Nothing was paid on this request', 'NOT_PAID')
    const p = await Payment.findById(g.payment)
    await refundPayment(p, { adminId: req.auth.id, reason: req.valid.body.reason })
    const upd = await GstFiling.findByIdAndUpdate(g._id, { $set: { status: 'closed' }, $push: { events: { status: 'closed', at: new Date(), note: 'Fee refunded: ' + req.valid.body.reason } } }, { new: true })
    await audit(req, { action: 'gst.refunded', entityType: 'GstFiling', entityId: g.number, after: { reason: req.valid.body.reason } })
    notify(upd)
    notifyUser(g.user, 'GST fee refunded', 'The fee for ' + g.number + ' is being refunded: ' + req.valid.body.reason, { kind: 'gst', id: g.number })
    ok(res, gstView(await withTicket(upd), await getSettings()))
  })

  return r
}
