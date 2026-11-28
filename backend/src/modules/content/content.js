import mongoose from 'mongoose'
import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { ok } from '../../utils/http.js'
import { audit } from '../audit/audit.service.js'
import { User } from '../users/user.model.js'
import { Notification } from '../notifications/notifications.js'
import { toUser } from '../../realtime/io.js'

/**
 * Content the admin manages (SCOPE-OF-WORK 12 "Content"): FAQs and the legal pages, shown in
 * the app and on the website. Until the admin edits them, the draft texts below are served
 * (marked as drafts) so the screens are never empty.
 */
export const DOC_KEYS = ['terms', 'privacy', 'refund']

const DEFAULTS = {
  faqs: [
    { q: 'Will the advocate see my phone number?', a: "No. You and your advocate talk through private chat in the app. Neither side's phone number is shared.", audience: 'all' },
    { q: 'When does the advocate get paid?', a: "Your payment is held by Vakeel Bhai. It is released after you confirm the work is done, or automatically after the auto-confirm period if you don't raise a dispute.", audience: 'all' },
    { q: 'How are advocates verified?', a: "Our team checks each advocate's District Bar Association card, State Bar Council certificate, enrolment certificate and Aadhaar before their profile goes live.", audience: 'all' },
    { q: 'Can I get a refund?', a: 'If the work is not done, raise a dispute from the request screen before confirming. Our team reviews it and can refund you.', audience: 'client' },
    { q: 'How does e-Challan payment work?', a: 'Add your vehicle, select the challans and pay in the app. Vakeel Bhai pays the traffic department for you and you get the department receipt here.', audience: 'client' },
    { q: 'How does the commission work for advocates?', a: 'Vakeel Bhai keeps a commission (set by the admin) plus GST on that commission. The rest goes to your wallet when the client confirms.', audience: 'advocate' },
  ],
  terms: {
    title: 'Terms of use',
    body: [
      'Vakeel Bhai is a technology platform that connects clients with independent, verified advocates. Vakeel Bhai is not a law firm and does not give legal advice.',
      'Advocates set their own fees. Payments are made through Vakeel Bhai and held until the client confirms the work, or until the auto-confirm period passes without a dispute.',
      "Vakeel Bhai keeps a platform commission from the advocate's fee, plus GST on it.",
    ],
  },
  privacy: {
    title: 'Privacy policy',
    body: [
      'We collect your mobile number, name, city and the details you share in requests and chats, so we can connect you with an advocate.',
      'Advocate documents, including Aadhaar, are visible only to the Vakeel Bhai verification team.',
      'Phone numbers are never shared between clients and advocates. You can delete your account from Settings.',
    ],
  },
  refund: {
    title: 'Refund policy',
    body: [
      'If the agreed work is not done, raise a dispute before confirming. The payment stays on hold while our team reviews it.',
      'If the dispute is upheld, the amount is refunded to your original payment method.',
      'If we cannot pay an e-Challan to the department, you get the full amount back.',
      'Membership fees are non-refundable once the membership is active.',
    ],
  },
}

const contentSchema = new mongoose.Schema(
  {
    _id: String,
    title: String,
    body: { type: [String], default: undefined },
    faqs: { type: [new mongoose.Schema({ q: String, a: String, audience: { type: String, enum: ['all', 'client', 'advocate'], default: 'all' } }, { _id: false })], default: undefined },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true },
)
export const Content = mongoose.model('Content', contentSchema)

/** Everything, with drafts filled in from DEFAULTS. */
export async function allContent() {
  const rows = new Map((await Content.find().lean()).map((c) => [c._id, c]))
  const faqs = rows.get('faqs')
  const docs = Object.fromEntries(
    DOC_KEYS.map((k) => {
      const c = rows.get(k)
      return [k, c ? { title: c.title, body: c.body, draft: false, updatedAt: c.updatedAt } : { ...DEFAULTS[k], draft: true, updatedAt: null }]
    }),
  )
  return { faqs: faqs ? faqs.faqs : DEFAULTS.faqs, faqsDraft: !faqs, ...docs }
}

export function contentRoutes() {
  const r = Router()
  r.get('/', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=120')
    ok(res, await allContent())
  })
  return r
}

export function adminContentRoutes() {
  const r = Router()
  r.use(requireAdmin())

  r.get('/content', async (_req, res) => ok(res, await allContent()))

  r.put(
    '/content/faqs',
    validate({ body: z.object({ faqs: z.array(z.object({ q: z.string().trim().min(5).max(200), a: z.string().trim().min(5).max(1500), audience: z.enum(['all', 'client', 'advocate']).default('all') })).max(60) }) }),
    async (req, res) => {
      await Content.findByIdAndUpdate('faqs', { $set: { faqs: req.valid.body.faqs, updatedBy: req.auth.id } }, { upsert: true })
      await audit(req, { action: 'content.faqs', entityType: 'Content', entityId: 'faqs', after: { count: req.valid.body.faqs.length } })
      ok(res, await allContent())
    },
  )

  r.put(
    '/content/:key',
    validate({ params: z.object({ key: z.enum(DOC_KEYS) }), body: z.object({ title: z.string().trim().min(3).max(80), body: z.array(z.string().trim().min(1).max(3000)).min(1).max(80) }) }),
    async (req, res) => {
      await Content.findByIdAndUpdate(req.valid.params.key, { $set: { ...req.valid.body, updatedBy: req.auth.id } }, { upsert: true })
      await audit(req, { action: 'content.' + req.valid.params.key, entityType: 'Content', entityId: req.valid.params.key })
      ok(res, await allContent())
    },
  )

  /** Notification broadcast to clients, advocates or everyone (in-app; push later). */
  r.post(
    '/notifications/broadcast',
    requireAdmin('super_admin'),
    validate({ body: z.object({ audience: z.enum(['clients', 'advocates', 'all']), title: z.string().trim().min(3).max(120), body: z.string().trim().min(5).max(400) }) }),
    async (req, res) => {
      const { audience, title, body } = req.valid.body
      const f = { status: 'active', ...(audience === 'all' ? {} : { role: audience === 'clients' ? 'client' : 'advocate' }) }
      let sent = 0
      let batch = []
      const flush = async () => {
        if (!batch.length) return
        const docs = await Notification.insertMany(batch.map((u) => ({ user: u, title, body })))
        docs.forEach((n) => toUser(n.user, 'notification', { id: String(n._id), title, body, link: null, read: false, at: n.createdAt }))
        sent += docs.length
        batch = []
      }
      for await (const u of User.find(f).select('_id').lean().cursor()) {
        batch.push(u._id)
        if (batch.length >= 500) await flush()
      }
      await flush()
      await audit(req, { action: 'notification.broadcast', entityType: 'Notification', entityId: audience, after: { title, sent } })
      ok(res, { sent })
    },
  )

  return r
}
