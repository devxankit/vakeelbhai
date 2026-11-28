import mongoose from 'mongoose'
import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { ok } from '../../utils/http.js'
import { logger } from '../../utils/logger.js'
import { toUser } from '../../realtime/io.js'

/**
 * In-app notifications for clients and advocates (the bell in the app and on the website).
 * Written when something happens that the user should know about; pushed live as
 * "notification". Phone push (FCM) can later send the same rows.
 *
 * `link` tells the app where to go: { kind: 'request' | 'case' | 'ticket' | 'challan' | 'verification' | 'wallet' | 'membership', id? }
 */
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 400 },
    link: { kind: String, id: String },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
notificationSchema.index({ user: 1, createdAt: -1 })
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 })
export const Notification = mongoose.model('Notification', notificationSchema)

const view = (n) => ({ id: String(n._id), title: n.title, body: n.body, link: n.link?.kind ? { kind: n.link.kind, id: n.link.id ?? null } : null, read: !!n.readAt, at: n.createdAt })

/**
 * Tell a user something. Never throws: a failed notification must not undo the action
 * that caused it (call it after the transaction has committed).
 */
export async function notifyUser(userId, title, body, link) {
  if (!userId) return
  try {
    const n = await Notification.create({ user: userId, title, body, link })
    toUser(userId, 'notification', view(n))
  } catch (err) {
    logger.error({ err }, 'Notification failed')
  }
}

export function notificationRoutes() {
  const r = Router()
  r.use(requireUser())

  r.get('/', async (req, res) => {
    const [list, unread] = await Promise.all([Notification.find({ user: req.auth.id }).sort({ createdAt: -1 }).limit(100).lean(), Notification.countDocuments({ user: req.auth.id, readAt: null })])
    ok(res, list.map(view), { unread })
  })

  /** Mark all (or the given ones) as read. */
  r.post('/read', validate({ body: z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(100).optional() }) }), async (req, res) => {
    const f = { user: req.auth.id, readAt: null }
    if (req.valid.body.ids) f._id = { $in: req.valid.body.ids }
    await Notification.updateMany(f, { $set: { readAt: new Date() } })
    ok(res, { unread: await Notification.countDocuments({ user: req.auth.id, readAt: null }) })
  })

  return r
}
