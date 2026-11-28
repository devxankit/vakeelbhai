import { badRequest, conflict } from '../../utils/errors.js'
import { applyBp, toRupees } from '../../utils/money.js'
import { Payment } from '../payments/payment.models.js'
import { Offer, OfferRedemption } from './offer.models.js'

const LIVE_REDEMPTION = ['reserved', 'used', 'credited']

export const offerView = (o) => ({
  id: String(o._id),
  title: o.title,
  description: o.description,
  code: o.code ?? null,
  autoApply: o.autoApply,
  kind: o.kind,
  valueType: o.valueType,
  value: o.valueType === 'percent' ? o.value / 100 : toRupees(o.value),
  max: o.maxPaise == null ? null : toRupees(o.maxPaise),
  minOrder: toRupees(o.minOrderPaise ?? 0),
  scope: o.scope,
  categories: o.categories,
  firstServiceOnly: o.firstServiceOnly,
  startAt: o.startAt,
  endAt: o.endAt,
})

/** "10% off, up to ₹500" / "₹100 cashback" */
export function offerLabel(o) {
  const v = o.valueType === 'percent' ? o.value / 100 + '%' : '₹' + toRupees(o.value).toLocaleString('en-IN')
  const cap = o.valueType === 'percent' && o.maxPaise ? ', up to ₹' + toRupees(o.maxPaise).toLocaleString('en-IN') : ''
  return o.kind === 'cashback' ? v + ' cashback' + cap : v + ' off' + cap
}

/** Discount or cashback for a fee (paise). Never more than the fee. */
export function offerAmounts(o, feePaise) {
  let amt = o.valueType === 'percent' ? applyBp(feePaise, o.value) : o.value
  if (o.maxPaise != null) amt = Math.min(amt, o.maxPaise)
  amt = Math.max(0, Math.min(amt, feePaise))
  return o.kind === 'cashback' ? { discountPaise: 0, cashbackPaise: amt } : { discountPaise: amt, cashbackPaise: 0 }
}

const liveFilter = (now = new Date()) => ({ active: true, startAt: { $lte: now }, endAt: { $gt: now } })

async function userUses(offerId, userId, session) {
  return OfferRedemption.countDocuments({ offer: offerId, user: userId, status: { $in: LIVE_REDEMPTION } }).session(session ?? null)
}

async function hasPaidService(userId, session) {
  return !!(await Payment.exists({ user: userId, purpose: 'service', status: { $in: ['paid', 'refunded'] } }).session(session ?? null))
}

/** Why this offer cannot be used now (null if it can). */
export async function whyNot(o, { userId, scope, category, feePaise }, session) {
  const now = new Date()
  if (!o.active || o.startAt > now || o.endAt <= now) return 'This offer is not running now'
  if (o.scope !== scope) return scope === 'service' ? 'This offer is for advocate memberships' : 'This offer is for legal services'
  if (scope === 'service' && o.categories.length && !o.categories.includes(category)) return 'This offer does not apply to this service'
  if (feePaise < (o.minOrderPaise ?? 0)) return 'The fee is below the minimum for this offer (₹' + toRupees(o.minOrderPaise) + ')'
  if (o.usageLimit != null && o.usedCount >= o.usageLimit) return 'This offer has been fully used'
  if ((await userUses(o._id, userId, session)) >= o.perUserLimit) return 'You have already used this offer'
  if (o.firstServiceOnly && (await hasPaidService(userId, session))) return 'This offer is for your first paid service only'
  return null
}

/**
 * The offer for a checkout: the coupon the user typed (an error says why it cannot be used),
 * or else the best automatic offer, or none.
 */
export async function pickOffer({ code, userId, scope, category, feePaise }, session) {
  if (code) {
    const o = await Offer.findOne({ code: String(code).trim().toUpperCase() }).session(session ?? null)
    if (!o) throw badRequest('This coupon code is not valid', { reason: 'BAD_COUPON' })
    const why = await whyNot(o, { userId, scope, category, feePaise }, session)
    if (why) throw badRequest(why, { reason: 'COUPON_NOT_USABLE' })
    return o
  }
  const autos = await Offer.find({ ...liveFilter(), autoApply: true, scope }).session(session ?? null)
  let best = null
  let bestAmt = 0
  for (const o of autos) {
    if (await whyNot(o, { userId, scope, category, feePaise }, session)) continue
    const a = offerAmounts(o, feePaise)
    const amt = a.discountPaise + a.cashbackPaise
    if (amt > bestAmt) {
      best = o
      bestAmt = amt
    }
  }
  return best
}

/** Count a use (inside the checkout transaction). The usage limit is enforced atomically. */
export async function reserveOffer(session, o, { userId, paymentId, discountPaise, cashbackPaise }) {
  const u = await Offer.updateOne({ _id: o._id, ...(o.usageLimit != null ? { usedCount: { $lt: o.usageLimit } } : {}) }, { $inc: { usedCount: 1 } }, { session })
  if (!u.modifiedCount) throw conflict('This offer has just been fully used', 'OFFER_EXHAUSTED')
  if ((await userUses(o._id, userId, session)) >= o.perUserLimit) throw conflict('You have already used this offer', 'OFFER_USED')
  await OfferRedemption.create([{ offer: o._id, user: userId, payment: paymentId, discountPaise, cashbackPaise }], { session })
}

/** Give the use back (checkout not completed, or refunded). */
export async function releaseOffer(session, paymentId) {
  const r = await OfferRedemption.findOneAndUpdate({ payment: paymentId, status: { $in: ['reserved', 'used'] } }, { $set: { status: 'released' } }, { session })
  if (r) await Offer.updateOne({ _id: r.offer, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session })
}

export async function markOfferUsed(session, paymentId) {
  await OfferRedemption.updateOne({ payment: paymentId, status: 'reserved' }, { $set: { status: 'used' } }, { session })
}

/** Offers a user can see now (client: service offers; advocate: membership offers). */
export async function liveOffers(scope, userId) {
  const list = await Offer.find({ ...liveFilter(), scope }).sort({ endAt: 1 }).lean()
  const out = []
  for (const o of list) {
    if (o.usageLimit != null && o.usedCount >= o.usageLimit) continue
    const used = userId ? (await userUses(o._id, userId)) >= o.perUserLimit : false
    out.push({ ...offerView(o), label: offerLabel(o), used })
  }
  return out
}
