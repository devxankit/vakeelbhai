import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { withTransaction } from '../../config/db.js'
import { badRequest, conflict, notFound, unavailable } from '../../utils/errors.js'
import { toRupees } from '../../utils/money.js'
import { logger } from '../../utils/logger.js'
import { gateway, paymentsEnabled } from '../../providers/payments/index.js'
import { Category } from '../categories/category.model.js'
import { getSettings } from '../settings/settings.service.js'
import { Membership, addMonths, memberIdFor } from '../membership/membership.model.js'
import { MembershipPlan } from '../membership/plan.model.js'
import { AdvocateProfile } from '../advocates/advocate.models.js'
import { Message, ServiceRequest } from '../requests/request.models.js'
import { notifyChange, notifyMessage } from '../requests/request.service.js'
import { getWallet, post } from '../wallet/wallet.service.js'
import { advocatePayout, challanBill, clientBill, membershipTotal, ratesFor } from '../pricing/pricing.js'
import { toAdmins, toUser } from '../../realtime/io.js'
import { nextSeq } from '../common/counter.model.js'
import { ChallanLock, ChallanOrder, Vehicle } from '../challans/challan.models.js'
import { challanProvider } from '../../providers/challan/index.js'
import { Payment } from './payment.models.js'
import { markOfferUsed, offerAmounts, pickOffer, releaseOffer, reserveOffer } from '../offers/offer.service.js'
import { rewardReferral } from '../referrals/referral.service.js'
import { GstFiling } from '../gstfiling/gstfiling.models.js'
import { notifyUser } from '../notifications/notifications.js'

const inr = (p) => '₹' + toRupees(p).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const payNumber = () => 'PAY-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase()

/* ------------------------------------------------------------------ quotes → checkout */

/** The bill for a quoted request, from current settings. Used for the preview and the checkout. */
export async function previewServiceBill(r, clientId, { useWallet, code }, session) {
  if (r.status !== 'quoted' || !r.quote) throw conflict('There is no quote to pay', 'NOTHING_TO_PAY')
  if (r.quote.validTill < new Date()) throw conflict('This quote has expired. Ask your advocate for a new one in the chat.', 'QUOTE_EXPIRED')
  const [settings, category, wallet] = await Promise.all([getSettings(), Category.findOne({ key: r.category }).lean(), getWallet(clientId, 'client', session)])
  // Money already reserved by this client's own open checkout for the same request is available again.
  const reserved = session ? 0 : await openWalletFor(r._id, clientId)
  const available = wallet.balancePaise + reserved
  const rates = ratesFor(category, settings)
  const offer = await pickOffer({ code, userId: clientId, scope: 'service', category: r.category, feePaise: r.quote.feePaise }, session)
  const oa = offer ? offerAmounts(offer, r.quote.feePaise) : { discountPaise: 0, cashbackPaise: 0 }
  const bill = clientBill({ feePaise: r.quote.feePaise, discountPaise: oa.discountPaise, gstOnService: category?.gstOnService ?? true, gstBp: rates.gstBp, walletAvailablePaise: available, useWallet, walletMaxUseBp: settings.walletMaxUseBp })
  return { bill, rates, payout: advocatePayout(bill.basePaise, rates), walletBalancePaise: available, gstOnService: category?.gstOnService ?? true, offer, cashbackPaise: oa.cashbackPaise }
}

async function openWalletFor(requestId, userId) {
  const open = await Payment.find({ request: requestId, user: userId, status: 'created' }).select('amounts.walletPaise').lean()
  return open.reduce((a, p) => a + (p.amounts.walletPaise ?? 0), 0)
}

/** Cancel open checkouts for the same thing and give back any wallet amount they took. */
async function cancelOpen(session, filter, why) {
  const open = await Payment.find({ ...filter, status: 'created' }).session(session)
  for (const p of open) await closeUnpaid(session, p, 'cancelled', why)
}

async function closeUnpaid(session, p, status, reason) {
  const u = await Payment.updateOne({ _id: p._id, status: 'created' }, { $set: { status, failureReason: reason } }, { session })
  if (!u.modifiedCount) return false
  if (p.offer?.id) await releaseOffer(session, p._id)
  if (p.purpose === 'challan' && p.challanOrder) {
    // The challans become payable again.
    await ChallanOrder.updateOne({ _id: p.challanOrder, status: 'awaiting_payment' }, { $set: { status: 'cancelled' } }, { session })
    await ChallanLock.deleteMany({ order: p.challanOrder }, { session })
  }
  if (p.amounts.walletPaise > 0) {
    await post(session, { userId: p.user, role: 'client', type: 'spend_release', amount: p.amounts.walletPaise, title: 'Wallet amount returned', sub: 'Checkout ' + p.number + ' was not completed', ref: { kind: 'payment', id: p.number }, key: 'pay:' + p.number + ':release' })
  }
  return true
}

/**
 * Start paying a quote. Server-side bill; the wallet part is taken now (and returned if the
 * checkout is not completed). If the wallet covers everything, the payment completes at once.
 */
export async function startServiceCheckout(r, client, { useWallet, code }) {
  await previewServiceBill(r, client.id, { useWallet, code }) // validates the quote and coupon before anything changes
  const provider = paymentsEnabled() ? gateway() : null
  let bill
  const payment = await withTransaction(async (session) => {
    // Close an earlier checkout first (returning its wallet amount), THEN price this one,
    // so the wallet balance used here is the real one.
    await cancelOpen(session, { request: r._id }, 'A new checkout was started')
    const priced = await previewServiceBill(r, client.id, { useWallet, code }, session)
    bill = priced.bill
    const { rates, payout, offer } = priced
    if (bill.totalPaise > 0 && !provider) throw unavailable('Online payment is not available yet', 'PAYMENTS_DISABLED')
    const [p] = await Payment.create(
      [
        {
          number: payNumber(),
          user: client.id,
          purpose: 'service',
          request: r._id,
          amounts: { feePaise: bill.feePaise, discountPaise: bill.discountPaise, basePaise: bill.basePaise, gstPaise: bill.gstPaise, walletPaise: bill.walletPaise, totalPaise: bill.totalPaise },
          rates,
          payout: { commissionPaise: payout.commissionPaise, gstOnCommissionPaise: payout.gstOnCommissionPaise, netPaise: payout.netPaise },
          offer: offer ? { id: offer._id, title: offer.title, code: offer.code, kind: offer.kind, cashbackPaise: priced.cashbackPaise } : undefined,
          provider: provider?.name ?? 'wallet',
          expiresAt: new Date(Date.now() + env.PAYMENT_EXPIRY_MINUTES * 60000),
        },
      ],
      { session },
    )
    if (offer) await reserveOffer(session, offer, { userId: client.id, paymentId: p._id, discountPaise: bill.discountPaise, cashbackPaise: priced.cashbackPaise })
    if (bill.walletPaise > 0) {
      await post(session, { userId: client.id, role: 'client', type: 'spend', amount: -bill.walletPaise, title: 'Used for request ' + r.number, sub: 'Checkout ' + p.number, ref: { kind: 'payment', id: p.number }, key: 'pay:' + p.number + ':spend' })
    }
    return p
  })
  if (bill.totalPaise === 0) {
    await finalizePaid(payment._id, { gatewayPaymentId: null, method: 'wallet' })
    return { payment: await Payment.findById(payment._id), gateway: null }
  }
  try {
    const { orderId } = await provider.createOrder({ amountPaise: bill.totalPaise, receipt: payment.number, notes: { request: r.number, payment: payment.number } })
    payment.orderId = orderId
    await payment.save()
  } catch (e) {
    await withTransaction((session) => closeUnpaid(session, payment, 'failed', 'Gateway order failed'))
    throw e
  }
  return { payment, gateway: { ...provider.publicConfig(), orderId: payment.orderId, amountPaise: bill.totalPaise, currency: 'INR' } }
}

/** Advocate membership checkout (SOW 4.4: membership becomes active only after approval AND payment). */
export async function startMembershipCheckout(advocate, planId, code) {
  const profile = await AdvocateProfile.findOne({ user: advocate.id }).lean()
  if (profile?.verification?.status !== 'approved') throw conflict('Your documents must be approved first', 'NOT_VERIFIED')
  const plan = await MembershipPlan.findOne({ _id: planId, active: true })
  if (!plan) throw notFound('Plan')
  if (plan.pricePaise == null) throw conflict('This plan has no price yet', 'NO_PRICE')
  const settings = await getSettings()
  const offer = await pickOffer({ code, userId: advocate.id, scope: 'membership', feePaise: plan.pricePaise })
  const oa = offer ? offerAmounts(offer, plan.pricePaise) : { discountPaise: 0 }
  const t = membershipTotal(plan.pricePaise, settings.gstBp, oa.discountPaise)
  if (t.totalPaise <= 0) throw badRequest('This plan has no price to pay')
  const provider = gateway()
  const payment = await withTransaction(async (session) => {
    await cancelOpen(session, { user: advocate.id, purpose: 'membership' }, 'A new checkout was started')
    const [p] = await Payment.create(
      [
        {
          number: payNumber(),
          user: advocate.id,
          purpose: 'membership',
          plan: plan._id,
          planName: plan.name,
          planMonths: plan.durationMonths,
          amounts: { feePaise: t.pricePaise, discountPaise: t.discountPaise, basePaise: t.basePaise, gstPaise: t.gstPaise, totalPaise: t.totalPaise },
          rates: { gstBp: settings.gstBp },
          offer: offer ? { id: offer._id, title: offer.title, code: offer.code, kind: offer.kind, cashbackPaise: 0 } : undefined,
          provider: provider.name,
          expiresAt: new Date(Date.now() + env.PAYMENT_EXPIRY_MINUTES * 60000),
        },
      ],
      { session },
    )
    if (offer) await reserveOffer(session, offer, { userId: advocate.id, paymentId: p._id, discountPaise: t.discountPaise, cashbackPaise: 0 })
    return p
  })
  try {
    const { orderId } = await provider.createOrder({ amountPaise: t.totalPaise, receipt: payment.number, notes: { purpose: 'membership', plan: plan.name, payment: payment.number } })
    payment.orderId = orderId
    await payment.save()
  } catch (e) {
    await withTransaction((session) => closeUnpaid(session, payment, 'failed', 'Gateway order failed'))
    throw e
  }
  return { payment, gateway: { ...provider.publicConfig(), orderId: payment.orderId, amountPaise: t.totalPaise, currency: 'INR' } }
}

/**
 * e-Challan checkout (SCOPE-OF-WORK 9). The challans and their amounts are fetched again
 * from the provider here, never taken from the app. Each challan is locked to this order,
 * so the same challan cannot be paid twice. Vakeel Bhai then pays the department within
 * settings.challanPayHours.
 */
export async function startChallanCheckout(client, { vehicleId, challanNos }) {
  const [settings, vehicle] = await Promise.all([getSettings(), Vehicle.findOne({ _id: vehicleId, user: client.id, removedAt: null }).lean()])
  if (!vehicle) throw notFound('Vehicle')
  if (settings.challanFeePaise == null) throw unavailable('e-Challan payments open soon', 'CHALLAN_CLOSED')
  const live = await challanProvider().lookup({ plate: vehicle.plate, type: vehicle.type })
  const wanted = [...new Set(challanNos)]
  const items = wanted.map((no) => live.find((c) => c.challanNo === no))
  if (items.some((x) => !x)) throw conflict('One of these challans is no longer due. Refresh and try again.', 'CHALLAN_CHANGED')
  const bill = challanBill({ challanPaise: items.map((c) => c.amountPaise), feePerChallanPaise: settings.challanFeePaise, gstBp: settings.gstBp })
  const provider = gateway()
  const { payment, order } = await withTransaction(async (session) => {
    await cancelOpen(session, { user: client.id, purpose: 'challan' }, 'A new checkout was started')
    const [o] = await ChallanOrder.create(
      [
        {
          number: 'EC-' + (await nextSeq('challanOrder', 1000, session)),
          user: client.id,
          vehicle: { plate: vehicle.plate, type: vehicle.type },
          items,
          amounts: { challanPaise: bill.challanPaise, feePaise: bill.feePaise, gstPaise: bill.gstPaise, totalPaise: bill.totalPaise },
          rates: { feePerChallanPaise: settings.challanFeePaise, gstBp: settings.gstBp, payHours: settings.challanPayHours ?? 24 },
        },
      ],
      { session },
    )
    try {
      await ChallanLock.insertMany(items.map((c) => ({ _id: c.challanNo, order: o._id })), { session })
    } catch (e) {
      if (e?.code === 11000) throw conflict('One of these challans is already paid or being paid', 'CHALLAN_HELD')
      throw e
    }
    const [p] = await Payment.create(
      [
        {
          number: payNumber(),
          user: client.id,
          purpose: 'challan',
          challanOrder: o._id,
          amounts: { feePaise: bill.challanPaise + bill.feePaise, basePaise: bill.challanPaise + bill.feePaise, gstPaise: bill.gstPaise, totalPaise: bill.totalPaise },
          rates: { gstBp: settings.gstBp },
          provider: provider.name,
          expiresAt: new Date(Date.now() + env.PAYMENT_EXPIRY_MINUTES * 60000),
        },
      ],
      { session },
    )
    o.payment = p._id
    await o.save({ session })
    return { payment: p, order: o }
  })
  try {
    const { orderId } = await provider.createOrder({ amountPaise: bill.totalPaise, receipt: payment.number, notes: { purpose: 'challan', order: order.number, payment: payment.number } })
    payment.orderId = orderId
    await payment.save()
  } catch (e) {
    await withTransaction((session) => closeUnpaid(session, payment, 'failed', 'Gateway order failed'))
    throw e
  }
  return { payment, order, gateway: { ...provider.publicConfig(), orderId: payment.orderId, amountPaise: bill.totalPaise, currency: 'INR' } }
}

/* ------------------------------------------------------------------ verification */

/**
 * The browser reports the gateway's answer; the server checks the signature AND asks the
 * gateway about the payment (status, order, amount) before anything is marked paid.
 */
export async function verifyFromClient(payment, { orderId, paymentId, signature }) {
  if (payment.status === 'paid') return payment
  if (payment.status !== 'created') throw conflict('This checkout is no longer open', 'CHECKOUT_CLOSED')
  const provider = gateway()
  if (!payment.orderId || orderId !== payment.orderId) throw badRequest('Payment does not match this checkout')
  if (!provider.verifySignature({ orderId, paymentId, signature })) throw badRequest('Payment could not be verified', { reason: 'BAD_SIGNATURE' })
  const c = await provider.confirm({ paymentId, orderId, amountPaise: payment.amounts.totalPaise })
  if (!c.ok) throw conflict('The gateway has not confirmed this payment (' + c.reason + ')', 'NOT_CAPTURED')
  await finalizePaid(payment._id, { gatewayPaymentId: paymentId, method: c.method })
  return Payment.findById(payment._id)
}

/**
 * Mark a payment paid and apply its effects, exactly once (safe for the browser call and the
 * webhook arriving together, and for retries).
 */
export async function finalizePaid(paymentId, { gatewayPaymentId, method }) {
  let after = null
  await withTransaction(async (session) => {
    const p = await Payment.findOneAndUpdate({ _id: paymentId, status: 'created' }, { $set: { status: 'paid', paidAt: new Date(), gatewayPaymentId: gatewayPaymentId ?? undefined, method } }, { new: true, session })
    if (!p) return // already handled
    await Payment.updateOne({ _id: p._id }, { $set: { invoiceNo: await nextInvoiceNo(session) } }, { session })
    if (p.offer?.id) await markOfferUsed(session, p._id)
    if (p.purpose === 'gst') {
      const g = await GstFiling.findOneAndUpdate({ _id: p.gstFiling, paidAt: null }, { $set: { paidAt: new Date(), payment: p._id }, $push: { events: { status: 'paid', at: new Date(), note: 'Service fee paid' } } }, { new: true, session })
      if (g) after = { gst: { user: p.user, number: g.number } }
      return
    }
    if (p.purpose === 'membership') {
      const latest = await Membership.findOne({ user: p.user, revokedAt: null }).sort({ endAt: -1 }).session(session)
      const startAt = latest && latest.endAt > new Date() ? latest.endAt : new Date()
      await Membership.create([{ user: p.user, plan: p.plan, planName: p.planName, memberId: await memberIdFor(p.user, session), startAt, endAt: addMonths(startAt, p.planMonths), source: 'payment' }], { session })
      after = { note: [p.user, 'Membership active', p.planName + ' plan. New client requests will appear on your dashboard.', { kind: 'membership' }] }
      return
    }
    if (p.purpose === 'challan') {
      const o = await ChallanOrder.findOne({ _id: p.challanOrder }).session(session)
      const now = new Date()
      const u = o && (await ChallanOrder.updateOne({ _id: o._id, status: 'awaiting_payment' }, { $set: { status: 'processing', paidAt: now, dueBy: new Date(now.getTime() + (o.rates?.payHours ?? 24) * 3600000) } }, { session }))
      if (!u?.modifiedCount) {
        await Payment.updateOne({ _id: p._id }, { $set: { needsAttention: 'e-Challan order was no longer waiting for payment' } }, { session })
        logger.error({ payment: p.number }, 'Payment for an e-Challan order that is no longer open')
        return
      }
      after = { challan: { user: p.user, number: o.number } }
      return
    }
    const r = await ServiceRequest.findOneAndUpdate({ _id: p.request, status: 'quoted' }, { $set: { status: 'paid', payment: p._id, paidAt: new Date() } }, { new: true, session })
    if (!r) {
      // Paid at the gateway but the request changed meanwhile: keep the record and flag it for an admin refund.
      await Payment.updateOne({ _id: p._id }, { $set: { needsAttention: 'Request was no longer waiting for payment' } }, { session })
      logger.error({ payment: p.number }, 'Payment for a request that is no longer quoted')
      return
    }
    await post(session, {
      userId: r.advocate,
      role: 'advocate',
      type: 'hold',
      hold: p.payout.netPaise,
      title: 'Case ' + r.number + ' · on hold',
      sub: 'Released when the client confirms the work',
      lines: [
        { k: 'Client paid (before GST)', paise: p.amounts.basePaise },
        { k: 'Platform commission', paise: -p.payout.commissionPaise },
        { k: 'GST on commission', paise: -p.payout.gstOnCommissionPaise },
      ],
      ref: { kind: 'request', id: r.number },
      status: 'On hold',
      key: 'pay:' + p.number + ':hold',
    })
    const [m] = await Message.create([{ request: r._id, from: 'system', kind: 'text', text: 'Payment of ' + inr(p.amounts.walletPaise + p.amounts.totalPaise) + ' received. It is held safely until the client confirms the work is done.' }], { session })
    after = { r, m, note: [r.advocate, 'Client paid', 'The client paid for case ' + r.number + '. ' + inr(p.payout.netPaise) + ' is on hold for you. Start the work.', { kind: 'case', id: r.number }] }
  })
  if (after?.note) notifyUser(...after.note)
  if (after?.gst) {
    toUser(after.gst.user, 'gst:update', { number: after.gst.number })
    toAdmins('gst:update', { number: after.gst.number })
  }
  if (after?.challan) {
    toUser(after.challan.user, 'challan:update', { number: after.challan.number })
    toAdmins('challan:update', { number: after.challan.number })
  } else if (after?.r) {
    notifyChange(after.r)
    notifyMessage(after.r, after.m)
  }
}

export async function markFailed(paymentId, reason) {
  await withTransaction(async (session) => {
    const p = await Payment.findById(paymentId).session(session)
    if (p) await closeUnpaid(session, p, 'failed', reason)
  })
}

/** Close checkouts nobody completed, returning wallet amounts (runs on a timer). */
export async function expireCheckouts() {
  const stale = await Payment.find({ status: 'created', expiresAt: { $lt: new Date() } }).limit(200)
  for (const p of stale) await withTransaction((session) => closeUnpaid(session, p, 'expired', 'Checkout expired'))
  return stale.length
}

/* ------------------------------------------------------------------ completion */

/** Release the held fee to the advocate's wallet (client confirms, auto-confirm, or admin release). */
export async function completeRequest(number, { by, rating, review, fromStatuses = ['done'], adminId, note }) {
  let after = null
  let cashback = 0
  let referral = null
  await withTransaction(async (session) => {
    const r = await ServiceRequest.findOne({ number, status: { $in: fromStatuses } }).session(session)
    if (!r) throw conflict('This request cannot be completed now', 'CANNOT_COMPLETE')
    const p = await Payment.findOne({ _id: r.payment, status: 'paid' }).session(session)
    if (!p) throw conflict('No payment found for this request', 'NO_PAYMENT')
    const set = { status: 'completed', completedAt: new Date(), completedBy: by }
    if (rating) set.rating = rating
    if (review) set.review = review
    if (r.status === 'disputed') Object.assign(set, { 'dispute.status': 'released', 'dispute.resolvedAt': new Date(), 'dispute.resolvedBy': adminId, 'dispute.note': note })
    const u = await ServiceRequest.updateOne({ _id: r._id, status: r.status }, { $set: set }, { session })
    if (!u.modifiedCount) throw conflict('This request changed just now', 'STALE')
    const net = p.payout.netPaise
    await post(session, {
      userId: r.advocate,
      role: 'advocate',
      type: 'earn',
      amount: net,
      hold: -net,
      lifetime: net,
      title: 'Case ' + r.number,
      sub: by === 'auto' ? 'Confirmed automatically' : by === 'admin' ? 'Released by Vakeel Bhai' : 'Confirmed by the client',
      lines: [
        { k: 'Client paid (before GST)', paise: p.amounts.basePaise },
        { k: 'Platform commission (' + p.rates.commissionBp / 100 + '%)', paise: -p.payout.commissionPaise },
        { k: 'GST on commission (' + p.rates.gstBp / 100 + '%)', paise: -p.payout.gstOnCommissionPaise },
      ],
      ref: { kind: 'request', id: r.number },
      status: 'Credited',
      key: 'req:' + r.number + ':earn',
    })
    if (p.offer?.kind === 'cashback' && p.offer.cashbackPaise > 0) {
      await post(session, { userId: r.client, role: 'client', type: 'cashback', amount: p.offer.cashbackPaise, title: 'Cashback · ' + (p.offer.code || p.offer.title), sub: 'Request ' + r.number, ref: { kind: 'request', id: r.number }, status: 'Credited', key: 'cashback:' + p.number })
      const { OfferRedemption } = await import('../offers/offer.models.js')
      await OfferRedemption.updateOne({ payment: p._id }, { $set: { status: 'credited' } }, { session })
      cashback = p.offer.cashbackPaise
    }
    referral = await rewardReferral(session, r.client, p)
    const text = by === 'client' ? 'The client confirmed the work. ' + inr(net) + " was credited to the advocate's wallet." : by === 'auto' ? 'The request was confirmed automatically. ' + inr(net) + " was credited to the advocate's wallet." : 'Our team reviewed the dispute and released the payment to the advocate.'
    const [m] = await Message.create([{ request: r._id, from: 'system', kind: 'text', text }], { session })
    after = { r: await ServiceRequest.findById(r._id).session(session), m, net }
  })
  notifyChange(after.r)
  notifyMessage(after.r, after.m)
  notifyUser(after.r.advocate, 'Payment credited', inr(after.net) + ' for case ' + after.r.number + ' is in your wallet.', { kind: 'wallet' })
  if (cashback) notifyUser(after.r.client, 'Cashback credited', inr(cashback) + ' cashback for request ' + after.r.number + ' is in your wallet.', { kind: 'wallet' })
  if (referral) notifyUser(referral.referrer, 'Referral reward', inr(referral.amountPaise) + ' is in your wallet: your friend completed their first paid service.', { kind: 'wallet' })
  if (by === 'admin') notifyUser(after.r.client, 'Dispute resolved', 'Our team reviewed request ' + after.r.number + ' and released the payment to the advocate.', { kind: 'request', id: after.r.number })
  return after.r
}

/** Requests marked done whose confirmation window has passed (runs on a timer). */
export async function autoConfirmDue() {
  const due = await ServiceRequest.find({ status: 'done', autoConfirmAt: { $lte: new Date() } }).select('number').limit(200).lean()
  let n = 0
  for (const r of due) {
    try {
      await completeRequest(r.number, { by: 'auto' })
      n++
    } catch (e) {
      if (e.code !== 'CANNOT_COMPLETE') logger.error({ err: e, request: r.number }, 'Auto-confirm failed')
    }
  }
  return n
}

/* ------------------------------------------------------------------ refunds */

/**
 * Full refund after a dispute (or a payment flagged for attention): the advocate's hold is
 * removed, the wallet part goes back to the client's wallet, the gateway part is refunded to
 * the original payment method. Partial refunds are an open business decision.
 */
export async function refundPayment(payment, { adminId, reason, requestNumber }) {
  let after = null
  await withTransaction(async (session) => {
    const p = await Payment.findOneAndUpdate(
      { _id: payment._id, status: 'paid' },
      { $set: { status: 'refunded', refund: { status: payment.amounts.totalPaise > 0 ? 'pending' : 'processed', gatewayPaise: payment.amounts.totalPaise, walletPaise: payment.amounts.walletPaise, reason, by: adminId, at: new Date() } } },
      { new: true, session },
    )
    if (!p) throw conflict('This payment cannot be refunded', 'CANNOT_REFUND')
    if (p.offer?.id) await releaseOffer(session, p._id)
    if (p.amounts.walletPaise > 0) {
      await post(session, { userId: p.user, role: 'client', type: 'refund', amount: p.amounts.walletPaise, title: 'Refund to wallet', sub: requestNumber ? 'Request ' + requestNumber : 'Payment ' + p.number, ref: { kind: 'payment', id: p.number }, key: 'pay:' + p.number + ':refund-wallet' })
    }
    if (p.purpose !== 'service' || p.needsAttention) return
    const r = await ServiceRequest.findOneAndUpdate(
      { _id: p.request, status: { $in: ['disputed', 'paid', 'done'] } },
      { $set: { status: 'refunded', completedAt: new Date(), completedBy: 'admin', 'dispute.status': 'refunded', 'dispute.resolvedAt': new Date(), 'dispute.resolvedBy': adminId, 'dispute.note': reason } },
      { new: true, session },
    )
    if (!r) throw conflict('This request cannot be refunded now', 'CANNOT_REFUND')
    await post(session, { userId: r.advocate, role: 'advocate', type: 'hold_release', hold: -p.payout.netPaise, title: 'Case ' + r.number + ' · refunded to client', sub: reason, ref: { kind: 'request', id: r.number }, status: 'Refunded', key: 'pay:' + p.number + ':hold-release' })
    const [m] = await Message.create([{ request: r._id, from: 'system', kind: 'text', text: 'Our team reviewed the dispute and refunded ' + inr(p.amounts.totalPaise + p.amounts.walletPaise) + ' to the client.' }], { session })
    after = { r, m }
  })
  // The gateway part, after the books are updated. A failure is recorded for the admin to retry.
  if (payment.amounts.totalPaise > 0) {
    try {
      const g = await gateway().refund({ paymentId: payment.gatewayPaymentId, amountPaise: payment.amounts.totalPaise, notes: { payment: payment.number } })
      await Payment.updateOne({ _id: payment._id }, { $set: { 'refund.status': g.status === 'failed' ? 'failed' : 'processed', 'refund.gatewayRefundId': g.refundId } })
    } catch (e) {
      await Payment.updateOne({ _id: payment._id }, { $set: { 'refund.status': 'failed', 'refund.error': e.message } })
      logger.error({ err: e, payment: payment.number }, 'Gateway refund failed')
    }
  }
  if (after) {
    notifyChange(after.r)
    notifyMessage(after.r, after.m)
    notifyUser(after.r.client, 'Refund issued', inr(payment.amounts.totalPaise + payment.amounts.walletPaise) + ' for request ' + after.r.number + ' is being refunded to you.', { kind: 'request', id: after.r.number })
    notifyUser(after.r.advocate, 'Case refunded', 'Our team refunded the client for case ' + after.r.number + '.', { kind: 'case', id: after.r.number })
  }
  return Payment.findById(payment._id)
}

export function paymentView(p) {
  return {
    id: p.number,
    purpose: p.purpose,
    status: p.status,
    fee: toRupees(p.amounts.feePaise),
    discount: toRupees(p.amounts.discountPaise),
    base: toRupees(p.amounts.basePaise),
    gst: toRupees(p.amounts.gstPaise),
    wallet: toRupees(p.amounts.walletPaise),
    total: toRupees(p.amounts.totalPaise),
    paidAt: p.paidAt ?? null,
    method: p.method ?? null,
    refund: p.refund?.status ? { status: p.refund.status, at: p.refund.at } : null,
    offer: p.offer?.title ? { title: p.offer.title, code: p.offer.code ?? null, kind: p.offer.kind, cashback: toRupees(p.offer.cashbackPaise ?? 0) } : null,
    invoiceNo: p.invoiceNo ?? null,
  }
}

/** Indian financial year (April–March) for invoice numbers: 2026-27. */
export function financialYear(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return y + '-' + String((y + 1) % 100).padStart(2, '0')
}

/** Next GST invoice number, gap-free within the financial year: VB/2026-27/00001 */
export async function nextInvoiceNo(session) {
  const fy = financialYear()
  return 'VB/' + fy + '/' + String(await nextSeq('invoice:' + fy, 0, session)).padStart(5, '0')
}
