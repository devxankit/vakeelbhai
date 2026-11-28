import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireAdmin, requireUser } from '../../middleware/auth.js'
import { singleImage } from '../../middleware/upload.js'
import { badRequest, conflict, notFound } from '../../utils/errors.js'
import { created, ok } from '../../utils/http.js'
import { percentToBp, toPaise, toRupees } from '../../utils/money.js'
import { readPrivate, removePrivate, savePrivate } from '../../providers/storage/privateFiles.js'
import { audit } from '../audit/audit.service.js'
import { ClientProfile } from '../clients/clientProfile.model.js'
import { Payment } from '../payments/payment.models.js'
import { User } from '../users/user.model.js'
import { WalletTransaction } from '../wallet/wallet.models.js'
import { Banner, Offer, OfferRedemption } from './offer.models.js'
import { liveOffers, offerLabel, offerView } from './offer.service.js'
import { referralView } from '../referrals/referral.service.js'

const idParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) })
const now = () => new Date()

/* ================================================================== client / advocate */

export function clientOfferRoutes() {
  const r = Router()
  r.use(requireUser('client'))

  r.get('/offers', async (req, res) => ok(res, await liveOffers('service', req.auth.id)))

  r.get('/referral', async (req, res) => ok(res, await referralView(req.auth.id)))

  /** Enter a friend's code: once, and only before the first paid service. */
  r.post('/referral/apply', validate({ body: z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{5,20}$/, 'Enter the code as your friend shared it') }) }), async (req, res) => {
    const mine = await ClientProfile.findOneAndUpdate({ user: req.auth.id }, { $setOnInsert: { user: req.auth.id } }, { upsert: true, new: true })
    if (mine.referredBy) throw conflict('You have already used a referral code', 'ALREADY_REFERRED')
    if (await Payment.exists({ user: req.auth.id, purpose: 'service', status: { $in: ['paid', 'refunded'] } })) throw conflict('Referral codes can only be used before your first paid service', 'TOO_LATE')
    const owner = await ClientProfile.findOne({ referralCode: req.valid.body.code }).lean()
    if (!owner || !(await User.exists({ _id: owner.user, status: 'active' }))) throw badRequest('This referral code is not valid', { reason: 'BAD_CODE' })
    if (String(owner.user) === req.auth.id) throw badRequest('You cannot use your own code', { reason: 'OWN_CODE' })
    const upd = await ClientProfile.updateOne({ _id: mine._id, referredBy: null }, { $set: { referredBy: owner.user, referredAt: now() } })
    if (!upd.modifiedCount) throw conflict('You have already used a referral code', 'ALREADY_REFERRED')
    ok(res, await referralView(req.auth.id))
  })

  return r
}

export function advocateOfferRoutes() {
  const r = Router()
  r.use(requireUser('advocate'))
  r.get('/offers', async (req, res) => ok(res, await liveOffers('membership', req.auth.id)))
  return r
}

/* ================================================================== public banners */

const bannerView = (b) => ({ id: String(b._id), title: b.title, sub: b.sub, tag: b.tag, hasImage: !!b.image, imageVersion: b.image?.uploadedAt ? new Date(b.image.uploadedAt).getTime() : 0, link: { kind: b.link?.kind ?? 'none', value: b.link?.value ?? '' }, audience: b.audience })

export function bannerRoutes() {
  const r = Router()
  r.get('/', validate({ query: z.object({ audience: z.enum(['client', 'advocate']).default('client') }) }), async (req, res) => {
    const t = now()
    const list = await Banner.find({ active: true, audience: { $in: [req.valid.query.audience, 'all'] }, $and: [{ $or: [{ startAt: null }, { startAt: { $lte: t } }] }, { $or: [{ endAt: null }, { endAt: { $gt: t } }] }] }).sort({ order: 1, createdAt: -1 }).limit(10).lean()
    res.set('Cache-Control', 'public, max-age=60')
    ok(res, list.map(bannerView))
  })
  /** Banner pictures are public marketing images. */
  r.get('/:id/image', validate({ params: idParam }), async (req, res) => {
    const b = await Banner.findById(req.valid.params.id).lean()
    if (!b?.image) throw notFound('Image')
    const buf = await readPrivate(b.image.path)
    res.set({ 'Content-Type': b.image.mime, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' })
    res.end(buf)
  })
  return r
}

/* ================================================================== admin */

const offerBody = z
  .object({
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(300).default(''),
    code: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, 'Code: 3 to 20 letters or digits')]).default(''),
    autoApply: z.boolean().default(false),
    kind: z.enum(['discount', 'cashback']).default('discount'),
    valueType: z.enum(['percent', 'flat']),
    /** Percent (e.g. 10) or rupees (e.g. 100). */
    value: z.number().positive(),
    max: z.number().positive().nullable().default(null),
    minOrder: z.number().min(0).default(0),
    scope: z.enum(['service', 'membership']).default('service'),
    categories: z.array(z.string().trim().max(40)).max(20).default([]),
    firstServiceOnly: z.boolean().default(false),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    usageLimit: z.number().int().positive().nullable().default(null),
    perUserLimit: z.number().int().positive().default(1),
    active: z.boolean().default(true),
  })
  .refine((b) => b.endAt > b.startAt, { message: 'The end date must be after the start date', path: ['endAt'] })
  .refine((b) => b.valueType !== 'percent' || b.value <= 100, { message: 'A percentage cannot be more than 100', path: ['value'] })
  .refine((b) => b.code || b.autoApply, { message: 'Give a coupon code, or make it apply automatically', path: ['code'] })

const toDoc = (b) => ({
  title: b.title,
  description: b.description,
  code: b.code || undefined,
  autoApply: b.autoApply,
  kind: b.kind,
  valueType: b.valueType,
  value: b.valueType === 'percent' ? percentToBp(b.value) : toPaise(b.value),
  maxPaise: b.max == null ? null : toPaise(b.max),
  minOrderPaise: toPaise(b.minOrder),
  scope: b.scope,
  categories: b.scope === 'service' ? b.categories : [],
  firstServiceOnly: b.firstServiceOnly,
  startAt: b.startAt,
  endAt: b.endAt,
  usageLimit: b.usageLimit,
  perUserLimit: b.perUserLimit,
  active: b.active,
})

export function adminOfferRoutes() {
  const r = Router()
  r.use(requireAdmin())

  r.get('/offers', async (_req, res) => {
    const list = await Offer.find().sort({ createdAt: -1 }).lean()
    const stats = await OfferRedemption.aggregate([{ $match: { status: { $in: ['used', 'credited'] } } }, { $group: { _id: '$offer', n: { $sum: 1 }, discount: { $sum: '$discountPaise' }, cashback: { $sum: '$cashbackPaise' } } }])
    const by = new Map(stats.map((s) => [String(s._id), s]))
    const t = now()
    ok(
      res,
      list.map((o) => {
        const s = by.get(String(o._id))
        return { ...offerView(o), label: offerLabel(o), active: o.active, usageLimit: o.usageLimit, perUserLimit: o.perUserLimit, usedCount: o.usedCount, live: o.active && o.startAt <= t && o.endAt > t, redeemed: s?.n ?? 0, totalDiscount: toRupees(s?.discount ?? 0), totalCashback: toRupees(s?.cashback ?? 0) }
      }),
    )
  })

  r.post('/offers', requireAdmin('super_admin'), validate({ body: offerBody }), async (req, res) => {
    try {
      const o = await Offer.create(toDoc(req.valid.body))
      await audit(req, { action: 'offer.created', entityType: 'Offer', entityId: String(o._id), after: req.valid.body })
      created(res, offerView(o))
    } catch (e) {
      if (e?.code === 11000) throw conflict('Another offer already uses this code', 'DUPLICATE_CODE')
      throw e
    }
  })

  r.put('/offers/:id', requireAdmin('super_admin'), validate({ params: idParam, body: offerBody }), async (req, res) => {
    const o = await Offer.findById(req.valid.params.id)
    if (!o) throw notFound('Offer')
    const d = toDoc(req.valid.body)
    if (o.usedCount > 0 && (d.value !== o.value || d.valueType !== o.valueType || d.kind !== o.kind)) throw conflict('This offer has been used: its value cannot change. End it and create a new one.', 'OFFER_USED')
    try {
      const upd = await Offer.findByIdAndUpdate(o._id, { $set: d, ...(d.code ? {} : { $unset: { code: 1 } }) }, { new: true })
      await audit(req, { action: 'offer.updated', entityType: 'Offer', entityId: String(o._id), after: req.valid.body })
      ok(res, offerView(upd))
    } catch (e) {
      if (e?.code === 11000) throw conflict('Another offer already uses this code', 'DUPLICATE_CODE')
      throw e
    }
  })

  /* banners */
  r.get('/banners', async (_req, res) => ok(res, (await Banner.find().sort({ order: 1, createdAt: -1 }).lean()).map((b) => ({ ...bannerView(b), active: b.active, order: b.order, startAt: b.startAt, endAt: b.endAt }))))

  const bannerBody = z.object({
    title: z.string().trim().min(3).max(70),
    sub: z.string().trim().max(100).default(''),
    tag: z.string().trim().max(20).default(''),
    link: z.object({ kind: z.enum(['offers', 'challan', 'categories', 'category', 'gst', 'none']), value: z.string().trim().max(40).default('') }).default({ kind: 'none', value: '' }),
    audience: z.enum(['client', 'advocate', 'all']).default('client'),
    startAt: z.coerce.date().nullable().default(null),
    endAt: z.coerce.date().nullable().default(null),
    active: z.boolean().default(true),
    order: z.number().int().min(0).max(999).default(0),
  })

  r.post('/banners', requireAdmin('super_admin'), validate({ body: bannerBody }), async (req, res) => {
    const b = await Banner.create(req.valid.body)
    await audit(req, { action: 'banner.created', entityType: 'Banner', entityId: String(b._id), after: req.valid.body })
    created(res, bannerView(b))
  })

  r.put('/banners/:id', requireAdmin('super_admin'), validate({ params: idParam, body: bannerBody }), async (req, res) => {
    const b = await Banner.findByIdAndUpdate(req.valid.params.id, { $set: req.valid.body }, { new: true })
    if (!b) throw notFound('Banner')
    await audit(req, { action: 'banner.updated', entityType: 'Banner', entityId: String(b._id), after: req.valid.body })
    ok(res, bannerView(b))
  })

  r.put('/banners/:id/image', requireAdmin('super_admin'), validate({ params: idParam }), singleImage('file'), async (req, res) => {
    const b = await Banner.findById(req.valid.params.id)
    if (!b) throw notFound('Banner')
    const saved = await savePrivate(req.file.buffer, String(b._id))
    const old = b.image?.path
    b.image = { ...saved, mime: req.file.mime, uploadedAt: new Date() }
    await b.save()
    await removePrivate(old)
    ok(res, bannerView(b))
  })

  r.delete('/banners/:id', requireAdmin('super_admin'), validate({ params: idParam }), async (req, res) => {
    const b = await Banner.findByIdAndDelete(req.valid.params.id)
    if (!b) throw notFound('Banner')
    await removePrivate(b.image?.path)
    await audit(req, { action: 'banner.deleted', entityType: 'Banner', entityId: String(b._id) })
    ok(res, { deleted: true })
  })

  /* referrals (admin: who referred whom, rewards paid) */
  r.get('/referrals', async (_req, res) => {
    const list = await ClientProfile.find({ referredBy: { $ne: null } }).sort({ referredAt: -1 }).limit(300).lean()
    const ids = [...new Set(list.flatMap((p) => [String(p.user), String(p.referredBy)]))]
    const users = new Map((await User.find({ _id: { $in: ids } }).select('name phone').lean()).map((u) => [String(u._id), u]))
    const paid = new Map((await WalletTransaction.find({ type: 'referral' }).lean()).map((t) => [t.ref?.id, t]))
    ok(
      res,
      list.map((p) => {
        const t = paid.get(String(p.user))
        return { referrer: users.get(String(p.referredBy))?.name || '—', friend: users.get(String(p.user))?.name || '—', at: p.referredAt, rewarded: !!t, reward: t ? toRupees(t.amountPaise) : null }
      }),
    )
  })

  return r
}
