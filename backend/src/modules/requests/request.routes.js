import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireAdmin, requireUser } from '../../middleware/auth.js'
import { singleImage } from '../../middleware/upload.js'
import { withTransaction } from '../../config/db.js'
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js'
import { created, escapeRegex, ok, pageArgs, pageMeta } from '../../utils/http.js'
import { toPaise } from '../../utils/money.js'
import { removePrivate, savePrivate, sendPrivate } from '../../providers/storage/privateFiles.js'
import { toUser } from '../../realtime/io.js'
import { audit } from '../audit/audit.service.js'
import { nextSeq } from '../common/counter.model.js'
import { Category } from '../categories/category.model.js'
import { AdvocateProfile } from '../advocates/advocate.models.js'
import { activeMembership } from '../membership/membership.model.js'
import { getSettings } from '../settings/settings.service.js'
import { User } from '../users/user.model.js'
import { Message, ServiceRequest } from './request.models.js'
import { Payment } from '../payments/payment.models.js'
import {
  CHAT_OPEN,
  advocateCard,
  caseView,
  chatSide,
  clientInfo,
  clientTabFilter,
  clientView,
  eligibleAdvocates,
  messageView,
  notifyChange,
  notifyMessage,
  requestFor,
  systemMessage,
  toClientStatus,
} from './request.service.js'
import { notifyUser } from '../notifications/notifications.js'

const numberParam = z.object({ number: z.string().regex(/^VB-\d{4,9}$/, 'Invalid request number') })
const MAX_ATTACHMENTS = 5

/* ================================================================== client */

export function clientRequestRoutes() {
  const r = Router()
  r.use(requireUser('client'))

  r.post(
    '/',
    validate({
      body: z.object({
        category: z.string().trim().min(1).max(40),
        issue: z.string().trim().min(15, 'Write at least a sentence about your problem').max(1000),
        district: z.string().trim().min(2).max(60),
        language: z.string().trim().min(2).max(30),
      }),
    }),
    async (req, res) => {
      const b = req.valid.body
      if (!(await Category.exists({ key: b.category, active: true }))) throw badRequest('Choose a legal service')
      const reqDoc = await withTransaction(async (session) => {
        const number = 'VB-' + (await nextSeq('request', 1000, session))
        const [d] = await ServiceRequest.create([{ number, client: req.auth.id, ...b }], { session })
        await systemMessage(d, 'Request submitted. Our team will assign a verified advocate.', session)
        return d
      })
      notifyChange(reqDoc)
      created(res, await clientView(reqDoc))
    },
  )

  r.get('/', validate({ query: z.object({ tab: z.enum(['active', 'completed']).default('active') }) }), async (req, res) => {
    const list = await ServiceRequest.find({ client: req.auth.id, ...clientTabFilter(req.valid.query.tab) }).sort({ createdAt: -1 }).limit(100)
    ok(res, await Promise.all(list.map(clientView)))
  })

  r.get('/:number', validate({ params: numberParam }), async (req, res) => ok(res, await clientView(await requestFor(req.valid.params.number, req.auth))))

  /** Optional documents (SCOPE-OF-WORK 4.4), up to 5 images, until the request is completed. */
  r.post('/:number/attachments', validate({ params: numberParam }), singleImage('file'), async (req, res) => {
    const doc = await requestFor(req.valid.params.number, req.auth)
    if (doc.status === 'completed') throw conflict('This request is closed')
    const saved = await savePrivate(req.file.buffer, req.auth.id)
    const upd = await ServiceRequest.findOneAndUpdate(
      { _id: doc._id, [`attachments.${MAX_ATTACHMENTS - 1}`]: { $exists: false } },
      { $push: { attachments: { file: { ...saved, mime: req.file.mime, uploadedAt: new Date() } } } },
      { new: true },
    )
    if (!upd) {
      await removePrivate(saved.path)
      throw conflict('You can attach up to ' + MAX_ATTACHMENTS + ' documents')
    }
    notifyChange(upd)
    created(res, await clientView(upd))
  })

  r.get('/:number/attachments/:aid', validate({ params: numberParam.extend({ aid: z.string().regex(/^[a-f0-9]{24}$/) }) }), async (req, res) => {
    const doc = await requestFor(req.valid.params.number, req.auth)
    const a = doc.attachments.id(req.valid.params.aid)
    if (!a) throw notFound('Document')
    await sendPrivate(res, a.file)
  })

  /** The assigned advocate's photo, once they have accepted. */
  r.get('/:number/advocate/photo', validate({ params: numberParam }), async (req, res) => {
    const doc = await requestFor(req.valid.params.number, req.auth)
    const view = await clientView(doc)
    if (!view.advocate) throw notFound('Photo')
    const p = await AdvocateProfile.findOne({ user: doc.advocate }).lean()
    if (!p?.photo) throw notFound('Photo')
    await sendPrivate(res, p.photo)
  })

  return r
}

/* ================================================================== advocate */

async function requireApproved(req) {
  const p = await AdvocateProfile.findOne({ user: req.auth.id }).select('verification.status').lean()
  if (p?.verification?.status !== 'approved') throw forbidden('Your profile is not verified yet', 'NOT_VERIFIED')
}

export function advocateCaseRoutes() {
  const r = Router()
  r.use(requireUser('advocate'), async (req, _res, next) => {
    await requireApproved(req)
    next()
  })

  /** Tabs as in the app: new · active · completed (completed includes declined). */
  r.get('/', validate({ query: z.object({ tab: z.enum(['new', 'active', 'completed', 'all']).default('all') }) }), async (req, res) => {
    const me = new mongoose.Types.ObjectId(req.auth.id)
    const q = { tab: req.valid.query.tab }
    const filter =
      q.tab === 'new'
        ? { advocate: me, status: 'assigned' }
        : q.tab === 'active'
          ? { advocate: me, status: { $in: ['accepted', 'quoted', 'paid', 'done', 'disputed'] } }
          : q.tab === 'completed'
            ? { $or: [{ advocate: me, status: { $in: ['completed', 'refunded'] } }, { assignments: { $elemMatch: { advocate: me, response: 'declined' } }, advocate: { $ne: me } }] }
            : { $or: [{ advocate: me }, { assignments: { $elemMatch: { advocate: me, response: 'declined' } } }] }
    const list = await ServiceRequest.find(filter).sort({ updatedAt: -1 }).limit(200)
    ok(res, await Promise.all(list.map((d) => caseView(d, req.auth.id))))
  })

  r.get('/:number', validate({ params: numberParam }), async (req, res) => ok(res, await caseView(await requestFor(req.valid.params.number, req.auth), req.auth.id)))

  r.get('/:number/attachments/:aid', validate({ params: numberParam.extend({ aid: z.string().regex(/^[a-f0-9]{24}$/) }) }), async (req, res) => {
    const doc = await requestFor(req.valid.params.number, req.auth)
    if (String(doc.advocate) !== req.auth.id) throw notFound('Document')
    const a = doc.attachments.id(req.valid.params.aid)
    if (!a) throw notFound('Document')
    await sendPrivate(res, a.file)
  })

  r.post('/:number/accept', validate({ params: numberParam }), async (req, res) => {
    if (!(await activeMembership(req.auth.id))) throw forbidden('You need an active membership to accept requests', 'NO_MEMBERSHIP')
    const now = new Date()
    const doc = await ServiceRequest.findOneAndUpdate(
      { number: req.valid.params.number, advocate: req.auth.id, status: 'assigned' },
      { $set: { status: 'accepted', acceptedAt: now, 'assignments.$[a].response': 'accepted', 'assignments.$[a].respondedAt': now } },
      { new: true, arrayFilters: [{ 'a.advocate': new mongoose.Types.ObjectId(req.auth.id), 'a.response': 'pending' }] },
    )
    if (!doc) throw conflict('This request is no longer waiting for you', 'NOT_ASSIGNED')
    const m = await systemMessage(doc, 'Adv. ' + req.auth.user.name + ' accepted your request')
    notifyChange(doc)
    notifyMessage(doc, m)
    notifyUser(doc.client, 'Advocate assigned', 'Adv. ' + req.auth.user.name + ' will help you with request ' + doc.number + '. Chat with them in the app.', { kind: 'request', id: doc.number })
    ok(res, await caseView(doc, req.auth.id))
  })

  /** Decline with a reason: the request goes back to the admin queue (SCOPE-OF-WORK 1.2). */
  r.post('/:number/decline', validate({ params: numberParam, body: z.object({ reason: z.string().trim().min(3).max(200) }) }), async (req, res) => {
    const now = new Date()
    const doc = await ServiceRequest.findOneAndUpdate(
      { number: req.valid.params.number, advocate: req.auth.id, status: 'assigned' },
      { $set: { status: 'submitted', advocate: null, 'assignments.$[a].response': 'declined', 'assignments.$[a].respondedAt': now, 'assignments.$[a].reason': req.valid.body.reason }, $unset: { assignedAt: 1 } },
      { new: true, arrayFilters: [{ 'a.advocate': new mongoose.Types.ObjectId(req.auth.id), 'a.response': 'pending' }] },
    )
    if (!doc) throw conflict('This request is no longer waiting for you', 'NOT_ASSIGNED')
    notifyChange(doc)
    ok(res, await caseView(doc, req.auth.id))
  })

  /**
   * Fee quote, sent as a chat card (SCOPE-OF-WORK 1.5). Allowed after accepting and until the
   * client pays; a new quote replaces the previous one (re-quote rules are an open business decision).
   */
  r.post(
    '/:number/quote',
    validate({ params: numberParam, body: z.object({ fee: z.number().int('Whole rupees').min(100, 'At least ₹100').max(10_000_000), scope: z.string().trim().min(10, 'Say what the fee covers').max(600) }) }),
    async (req, res) => {
      const { fee, scope } = req.valid.body
      const settings = await getSettings()
      const now = new Date()
      const quote = { feePaise: toPaise(fee), scope, validTill: new Date(now.getTime() + settings.quoteValidityDays * 86400000), sentAt: now }
      const doc = await ServiceRequest.findOneAndUpdate({ number: req.valid.params.number, advocate: req.auth.id, status: { $in: ['accepted', 'quoted'] } }, { $set: { status: 'quoted', quote } }, { new: true })
      if (!doc) throw conflict('A quote can be sent after accepting and before the client pays', 'CANNOT_QUOTE')
      const [m] = await Message.create([{ request: doc._id, from: 'advocate', sender: req.auth.id, kind: 'quote', quote: { feePaise: quote.feePaise, scope, validTill: quote.validTill } }])
      notifyChange(doc)
      notifyMessage(doc, m)
      notifyUser(doc.client, 'Fee quote received', '₹' + fee.toLocaleString('en-IN') + ' for request ' + doc.number + '. Review and pay in the app.', { kind: 'request', id: doc.number })
      ok(res, await caseView(doc, req.auth.id))
    },
  )

  return r
}

/* ================================================================== chat (client + advocate) */

export function chatRoutes() {
  const r = Router({ mergeParams: true })
  r.use(requireUser())

  const load = async (req) => {
    const doc = await requestFor(req.params.number, req.auth)
    const side = chatSide(doc, req.auth)
    if (!side) throw forbidden('This chat opens when the advocate accepts the request', 'CHAT_CLOSED')
    return { doc, side }
  }

  r.get('/', validate({ params: numberParam, query: z.object({ after: z.string().datetime().optional() }) }), async (req, res) => {
    const { doc } = await load(req)
    const filter = { request: doc._id }
    if (req.valid.query.after) filter.createdAt = { $gt: new Date(req.valid.query.after) }
    const list = await Message.find(filter).sort({ createdAt: 1, _id: 1 }).limit(500)
    ok(res, list.map(messageView), { status: toClientStatus(doc.status), open: CHAT_OPEN.includes(doc.status) })
  })

  const canPost = (doc, side) => {
    if (!CHAT_OPEN.includes(doc.status)) throw conflict(side === 'client' && ['submitted', 'assigned'].includes(doc.status) ? 'You can chat once an advocate accepts your request' : 'This case is closed. Contact support if you need help.', 'CHAT_CLOSED')
  }

  r.post('/', validate({ params: numberParam, body: z.object({ text: z.string().trim().min(1).max(2000) }) }), async (req, res) => {
    const { doc, side } = await load(req)
    canPost(doc, side)
    const [m] = await Message.create([{ request: doc._id, from: side, sender: req.auth.id, kind: 'text', text: req.valid.body.text }])
    notifyMessage(doc, m)
    created(res, messageView(m))
  })

  r.post('/image', validate({ params: numberParam }), singleImage('file'), async (req, res) => {
    const { doc, side } = await load(req)
    canPost(doc, side)
    const saved = await savePrivate(req.file.buffer, String(doc._id))
    const [m] = await Message.create([{ request: doc._id, from: side, sender: req.auth.id, kind: 'image', file: { ...saved, mime: req.file.mime, uploadedAt: new Date() } }])
    notifyMessage(doc, m)
    created(res, messageView(m))
  })

  r.get('/:mid/file', validate({ params: numberParam.extend({ mid: z.string().regex(/^[a-f0-9]{24}$/) }) }), async (req, res) => {
    const { doc } = await load(req)
    const m = await Message.findOne({ _id: req.valid.params.mid, request: doc._id }).lean()
    if (!m?.file) throw notFound('File')
    await sendPrivate(res, m.file)
  })

  return r
}

/* ================================================================== admin queue */

/** Everything staff need about the payment on a request, in rupees. */
async function adminPaymentSummary(paymentId) {
  const p = await Payment.findById(paymentId).lean()
  if (!p) return null
  const r = (x) => (x ?? 0) / 100
  return {
    id: p.number,
    status: p.status,
    paidAt: p.paidAt ?? null,
    fee: r(p.amounts.feePaise),
    discount: r(p.amounts.discountPaise),
    gst: r(p.amounts.gstPaise),
    wallet: r(p.amounts.walletPaise),
    gateway: r(p.amounts.totalPaise),
    commission: r(p.payout?.commissionPaise),
    gstOnCommission: r(p.payout?.gstOnCommissionPaise),
    advocateNet: r(p.payout?.netPaise),
    commissionPercent: (p.rates?.commissionBp ?? 0) / 100,
    provider: p.provider,
    refund: p.refund?.status ? { status: p.refund.status, at: p.refund.at, error: p.refund.error ?? null } : null,
  }
}

const ADMIN_TABS = {
  unassigned: { status: 'submitted' },
  waiting: { status: 'assigned' },
  active: { status: { $in: ['accepted', 'quoted', 'paid', 'done'] } },
  disputed: { status: 'disputed' },
  completed: { status: 'completed' },
  all: {},
}

export function adminRequestRoutes() {
  const r = Router()
  r.use(requireAdmin())

  r.get(
    '/',
    validate({ query: z.object({ tab: z.enum(Object.keys(ADMIN_TABS)).default('unassigned'), category: z.string().max(40).optional(), q: z.string().trim().max(40).optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }) }),
    async (req, res) => {
      const q = req.valid.query
      const pg = pageArgs(q)
      const filter = { ...ADMIN_TABS[q.tab] }
      if (q.category) filter.category = q.category
      if (q.q) filter.$or = [{ number: new RegExp(escapeRegex(q.q), 'i') }, { district: new RegExp(escapeRegex(q.q), 'i') }]
      // The queue is first come, first served; other tabs show the latest first.
      const sort = q.tab === 'unassigned' || q.tab === 'waiting' ? { createdAt: 1 } : { updatedAt: -1 }
      const [items, total] = await Promise.all([ServiceRequest.find(filter).sort(sort).skip(pg.skip).limit(pg.limit).lean(), ServiceRequest.countDocuments(filter)])
      const userIds = [...new Set(items.flatMap((d) => [String(d.client), d.advocate ? String(d.advocate) : null]).filter(Boolean))]
      const users = new Map((await User.find({ _id: { $in: userIds } }).select('name phone').lean()).map((u) => [String(u._id), u]))
      ok(
        res,
        items.map((d) => ({
          id: d.number,
          category: d.category,
          issue: d.issue,
          district: d.district,
          lang: d.language,
          status: d.status,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          client: users.get(String(d.client))?.name || 'Client',
          advocate: d.advocate ? users.get(String(d.advocate))?.name ?? null : null,
          declines: d.assignments.filter((a) => a.response === 'declined').length,
        })),
        pageMeta(pg, total),
      )
    },
  )

  r.get('/:number', validate({ params: numberParam }), async (req, res) => {
    const d = await requestFor(req.valid.params.number, req.auth)
    const ids = [...new Set(d.assignments.map((a) => String(a.advocate)))]
    const advs = new Map((await User.find({ _id: { $in: ids } }).select('name phone').lean()).map((u) => [String(u._id), u]))
    const messages = await Message.find({ request: d._id }).sort({ createdAt: 1 }).limit(500)
    ok(res, {
      id: d.number,
      category: d.category,
      issue: d.issue,
      district: d.district,
      lang: d.language,
      status: d.status,
      createdAt: d.createdAt,
      acceptedAt: d.acceptedAt ?? null,
      client: await clientInfo(d.client),
      advocate: d.advocate ? { ...(await advocateCard(d.advocate)), phone: advs.get(String(d.advocate))?.phone ?? null } : null,
      quote: d.quote ? { fee: d.quote.feePaise / 100, scope: d.quote.scope, validTill: d.quote.validTill, at: d.quote.sentAt } : null,
      docs: d.attachments.map((a) => ({ id: String(a._id), at: a.createdAt })),
      payment: d.payment ? await adminPaymentSummary(d.payment) : null,
      doneAt: d.doneAt ?? null,
      autoConfirmAt: d.autoConfirmAt ?? null,
      completedAt: d.completedAt ?? null,
      completedBy: d.completedBy ?? null,
      rating: d.rating ?? null,
      review: d.review ?? null,
      dispute: d.dispute ?? null,
      assignments: d.assignments.map((a) => ({ advocateId: String(a.advocate), advocate: advs.get(String(a.advocate))?.name ?? '—', assignedAt: a.assignedAt, response: a.response, respondedAt: a.respondedAt ?? null, reason: a.reason ?? null })),
      messages: messages.map((m) => messageView(m)),
    })
  })

  r.get('/:number/eligible', validate({ params: numberParam }), async (req, res) => ok(res, await eligibleAdvocates(await requestFor(req.valid.params.number, req.auth))))

  /**
   * Assign (status submitted) or reassign before the advocate has answered (status assigned).
   * Once an advocate has accepted, the request can no longer be moved here.
   */
  r.post('/:number/assign', validate({ params: numberParam, body: z.object({ advocateId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid advocate') }) }), async (req, res) => {
    const d = await requestFor(req.valid.params.number, req.auth)
    const { advocateId } = req.valid.body
    if (!['submitted', 'assigned'].includes(d.status)) throw conflict('Only unassigned requests, or ones still waiting for the advocate, can be assigned', 'CANNOT_ASSIGN')
    if (d.advocate && String(d.advocate) === advocateId) throw conflict('Already assigned to this advocate')
    const eligible = await eligibleAdvocates(d)
    if (!eligible.some((a) => a.id === advocateId)) throw badRequest('This advocate cannot take this request (practice area, verification, membership, block or an earlier decline)', { reason: 'NOT_ELIGIBLE' })
    const prev = d.advocate
    const now = new Date()
    const adv = new mongoose.Types.ObjectId(advocateId)
    const updated = await withTransaction(async (session) => {
      // Precondition on the status and current advocate: two admins assigning at once cannot both win.
      const u = await ServiceRequest.findOneAndUpdate(
        { _id: d._id, status: d.status, advocate: d.advocate ?? null },
        {
          $set: { status: 'assigned', advocate: adv, assignedAt: now, ...(prev ? { 'assignments.$[p].response': 'withdrawn', 'assignments.$[p].respondedAt': now } : {}) },
        },
        { new: true, session, ...(prev ? { arrayFilters: [{ 'p.advocate': prev, 'p.response': 'pending' }] } : {}) },
      )
      if (!u) throw conflict('Someone changed this request just now. Reload and try again.', 'STALE')
      u.assignments.push({ advocate: adv, assignedAt: now, assignedBy: req.auth.id })
      await u.save({ session })
      await audit(req, { action: prev ? 'request.reassigned' : 'request.assigned', entityType: 'ServiceRequest', entityId: u.number, before: prev ? { advocate: String(prev) } : undefined, after: { advocate: advocateId } }, session)
      return u
    })
    notifyChange(updated, prev ? [prev] : [])
    toUser(adv, 'case:new', { number: updated.number })
    notifyUser(adv, 'New client request', 'Request ' + updated.number + ' was assigned to you. Accept or decline it.', { kind: 'case', id: updated.number })
    ok(res, { id: updated.number, status: updated.status })
  })

  r.get('/:number/attachments/:aid', validate({ params: numberParam.extend({ aid: z.string().regex(/^[a-f0-9]{24}$/) }) }), async (req, res) => {
    const d = await requestFor(req.valid.params.number, req.auth)
    const a = d.attachments.id(req.valid.params.aid)
    if (!a) throw notFound('Document')
    await sendPrivate(res, a.file)
  })

  r.get('/:number/messages/:mid/file', validate({ params: numberParam.extend({ mid: z.string().regex(/^[a-f0-9]{24}$/) }) }), async (req, res) => {
    const d = await requestFor(req.valid.params.number, req.auth)
    const m = await Message.findOne({ _id: req.valid.params.mid, request: d._id }).lean()
    if (!m?.file) throw notFound('File')
    await sendPrivate(res, m.file)
  })

  return r
}
