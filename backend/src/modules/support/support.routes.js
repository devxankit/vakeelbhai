import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireAdmin, requireUser } from '../../middleware/auth.js'
import { singleImage } from '../../middleware/upload.js'
import { withTransaction } from '../../config/db.js'
import { notFound } from '../../utils/errors.js'
import { created, escapeRegex, ok, pageArgs, pageMeta } from '../../utils/http.js'
import { savePrivate, sendPrivate } from '../../providers/storage/privateFiles.js'
import { toAdmins, toUser } from '../../realtime/io.js'
import { audit } from '../audit/audit.service.js'
import { nextSeq } from '../common/counter.model.js'
import { User } from '../users/user.model.js'
import { notifyUser } from '../notifications/notifications.js'
import { SUPPORT_TOPICS, SupportMessage, SupportTicket, TICKET_STATUS } from './support.models.js'

const iso = (d) => (d ? new Date(d).toISOString() : null)
const numberParam = z.object({ number: z.string().regex(/^HD-\d{4,9}$/, 'Invalid ticket') })
const fileParam = numberParam.extend({ mid: z.string().regex(/^[a-f0-9]{24}$/) })
const text = z.string().trim().min(1, 'Write a message').max(2000)

export const ticketView = (t) => ({ id: t.number, topic: t.topic, subject: t.subject, ref: t.ref ?? null, status: t.status, createdAt: iso(t.createdAt), lastMessageAt: iso(t.lastMessageAt), closedAt: iso(t.closedAt) })

const messageView = (m) => ({ id: String(m._id), from: m.from, name: m.from === 'support' ? m.senderName || 'Vakeel Bhai support' : null, kind: m.kind, text: m.text ?? null, hasFile: !!m.file, at: iso(m.createdAt) })

function notify(t, m) {
  const payload = { number: t.number, status: t.status, message: m ? messageView(m) : null }
  toUser(t.user, 'support:update', payload)
  toAdmins('support:update', payload)
}

/** Post a message and move the ticket to the right status, in one transaction. */
async function addMessage(ticket, msg, side) {
  return withTransaction(async (session) => {
    const [m] = await SupportMessage.create([{ ticket: ticket._id, ...msg }], { session })
    const set = side === 'user' ? { status: 'open', adminUnread: true, userUnread: false } : { status: 'answered', userUnread: true, adminUnread: false }
    const t = await SupportTicket.findByIdAndUpdate(ticket._id, { $set: { ...set, lastMessageAt: m.createdAt }, $unset: { closedAt: 1, closedBy: 1 } }, { new: true, session })
    return { t, m }
  })
}

/* ================================================================== clients and advocates */

export function supportRoutes() {
  const r = Router()
  r.use(requireUser())

  const own = async (req) => {
    const t = await SupportTicket.findOne({ number: req.valid.params.number, user: req.auth.id })
    if (!t) throw notFound('Ticket')
    return t
  }

  r.get('/tickets', async (req, res) => {
    const list = await SupportTicket.find({ user: req.auth.id }).sort({ lastMessageAt: -1 }).limit(100).lean()
    ok(res, list.map((t) => ({ ...ticketView(t), unread: t.userUnread })))
  })

  r.post(
    '/tickets',
    validate({ body: z.object({ topic: z.enum(SUPPORT_TOPICS), subject: z.string().trim().min(3, 'Add a short subject').max(120), message: z.string().trim().min(5, 'Describe the problem').max(2000), ref: z.string().trim().regex(/^(VB|EC|HD|PAY|WD|GST)-[A-Z0-9]{3,20}$/, 'Invalid reference').optional() }) }),
    async (req, res) => {
      const b = req.valid.body
      const { t, m } = await withTransaction(async (session) => {
        const number = 'HD-' + (await nextSeq('supportTicket', 1000, session))
        const [doc] = await SupportTicket.create([{ number, user: req.auth.id, role: req.auth.role, topic: b.topic, subject: b.subject, ref: b.ref ?? null }], { session })
        const [first] = await SupportMessage.create([{ ticket: doc._id, from: 'user', sender: req.auth.id, kind: 'text', text: b.message }], { session })
        await SupportMessage.create([{ ticket: doc._id, from: 'system', kind: 'text', text: 'Ticket ' + number + ' created. Our support team replies here, usually within a few hours.' }], { session })
        return { t: doc, m: first }
      })
      notify(t, m)
      created(res, ticketView(t))
    },
  )

  r.get('/tickets/:number', validate({ params: numberParam }), async (req, res) => {
    const t = await own(req)
    const msgs = await SupportMessage.find({ ticket: t._id }).sort({ createdAt: 1, _id: 1 }).limit(500)
    if (t.userUnread) await SupportTicket.updateOne({ _id: t._id }, { $set: { userUnread: false } })
    ok(res, { ...ticketView(t), messages: msgs.map(messageView) })
  })

  r.post('/tickets/:number/messages', validate({ params: numberParam, body: z.object({ text }) }), async (req, res) => {
    const out = await addMessage(await own(req), { from: 'user', sender: req.auth.id, kind: 'text', text: req.valid.body.text }, 'user')
    notify(out.t, out.m)
    created(res, messageView(out.m))
  })

  r.post('/tickets/:number/messages/image', validate({ params: numberParam }), singleImage('file'), async (req, res) => {
    const t = await own(req)
    const saved = await savePrivate(req.file.buffer, String(t._id))
    const out = await addMessage(t, { from: 'user', sender: req.auth.id, kind: 'image', file: { ...saved, mime: req.file.mime, uploadedAt: new Date() } }, 'user')
    notify(out.t, out.m)
    created(res, messageView(out.m))
  })

  r.get('/tickets/:number/messages/:mid/file', validate({ params: fileParam }), async (req, res) => {
    const t = await own(req)
    const m = await SupportMessage.findOne({ _id: req.valid.params.mid, ticket: t._id }).lean()
    if (!m?.file) throw notFound('File')
    await sendPrivate(res, m.file)
  })

  /** The user says it is solved. */
  r.post('/tickets/:number/close', validate({ params: numberParam }), async (req, res) => {
    const t = await own(req)
    const upd = await SupportTicket.findOneAndUpdate({ _id: t._id, status: { $ne: 'closed' } }, { $set: { status: 'closed', closedAt: new Date(), closedBy: 'user', adminUnread: false } }, { new: true })
    if (upd) notify(upd)
    ok(res, ticketView(upd ?? t))
  })

  return r
}

/* ================================================================== admin */

export function adminSupportRoutes() {
  const r = Router()
  r.use(requireAdmin())

  const load = async (req) => {
    const t = await SupportTicket.findOne({ number: req.valid.params.number })
    if (!t) throw notFound('Ticket')
    return t
  }

  r.get(
    '/',
    validate({ query: z.object({ status: z.enum([...TICKET_STATUS, 'all']).default('open'), role: z.enum(['client', 'advocate']).optional(), topic: z.enum(SUPPORT_TOPICS).optional(), q: z.string().trim().max(40).optional(), page: z.coerce.number().int().min(1).optional() }) }),
    async (req, res) => {
      const q = req.valid.query
      const pg = pageArgs({ ...q, limit: 25 })
      const f = {}
      if (q.status !== 'all') f.status = q.status
      if (q.role) f.role = q.role
      if (q.topic) f.topic = q.topic
      if (q.q) f.$or = [{ number: new RegExp(escapeRegex(q.q), 'i') }, { subject: new RegExp(escapeRegex(q.q), 'i') }, { ref: new RegExp(escapeRegex(q.q), 'i') }]
      // Waiting tickets: oldest first (first come, first served).
      const sort = q.status === 'open' ? { lastMessageAt: 1 } : { lastMessageAt: -1 }
      const [items, total] = await Promise.all([SupportTicket.find(f).sort(sort).skip(pg.skip).limit(pg.limit).populate('user', 'name phone').lean(), SupportTicket.countDocuments(f)])
      ok(res, items.map((t) => ({ ...ticketView(t), role: t.role, user: t.user?.name || '+91 ' + (t.user?.phone ?? ''), userId: String(t.user?._id ?? ''), unread: t.adminUnread })), pageMeta(pg, total))
    },
  )

  r.get('/:number', validate({ params: numberParam }), async (req, res) => {
    const t = await load(req)
    const [msgs, u] = await Promise.all([SupportMessage.find({ ticket: t._id }).sort({ createdAt: 1, _id: 1 }).limit(1000), User.findById(t.user).select('name phone role status').lean()])
    if (t.adminUnread) await SupportTicket.updateOne({ _id: t._id }, { $set: { adminUnread: false } })
    ok(res, { ...ticketView(t), role: t.role, user: u ? { id: String(u._id), name: u.name, phone: u.phone, role: u.role, status: u.status } : null, messages: msgs.map(messageView) })
  })

  r.post('/:number/messages', validate({ params: numberParam, body: z.object({ text }) }), async (req, res) => {
    const first = String(req.auth.admin.name || '').split(/\s+/)[0]
    const out = await addMessage(await load(req), { from: 'support', sender: req.auth.id, senderName: first ? first + ' · Vakeel Bhai support' : 'Vakeel Bhai support', kind: 'text', text: req.valid.body.text }, 'support')
    notify(out.t, out.m)
    notifyUser(out.t.user, 'Support replied', out.t.number + ': ' + req.valid.body.text.slice(0, 120), { kind: 'ticket', id: out.t.number })
    created(res, messageView(out.m))
  })

  r.get('/:number/messages/:mid/file', validate({ params: fileParam }), async (req, res) => {
    const t = await load(req)
    const m = await SupportMessage.findOne({ _id: req.valid.params.mid, ticket: t._id }).lean()
    if (!m?.file) throw notFound('File')
    await sendPrivate(res, m.file)
  })

  r.post('/:number/close', validate({ params: numberParam, body: z.object({ note: z.string().trim().max(500).optional() }) }), async (req, res) => {
    const t = await load(req)
    const out = await withTransaction(async (session) => {
      const upd = await SupportTicket.findOneAndUpdate({ _id: t._id, status: { $ne: 'closed' } }, { $set: { status: 'closed', closedAt: new Date(), closedBy: 'admin', adminUnread: false, userUnread: true } }, { new: true, session })
      if (!upd) return { t, m: null }
      const [m] = await SupportMessage.create([{ ticket: t._id, from: 'system', kind: 'text', text: req.valid.body.note ? 'Ticket closed by our team: ' + req.valid.body.note : 'Ticket closed by our team. Write here again if you still need help.' }], { session })
      await audit(req, { action: 'support.closed', entityType: 'SupportTicket', entityId: t.number }, session)
      return { t: upd, m }
    })
    if (out.m) notify(out.t, out.m)
    ok(res, ticketView(out.t))
  })

  return r
}

/** Dashboard: tickets waiting for the team. */
export const openTicketCount = () => SupportTicket.countDocuments({ status: 'open' })
