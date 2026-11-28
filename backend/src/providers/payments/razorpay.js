import { env } from '../../config/env.js'
import { hmac, safeEqualHex } from '../../utils/crypto.js'
import { AppError } from '../../utils/errors.js'
import { logger } from '../../utils/logger.js'

/**
 * Razorpay (PROJECT-PLAN "Defaults": recommended, not yet confirmed by the client).
 * Server-side only: orders, signature checks, payment status, capture, refunds, webhooks.
 * Docs: https://razorpay.com/docs/api/ — Basic auth with key id + secret.
 * NOT YET RUN AGAINST RAZORPAY: needs the client's test-mode keys.
 */
const API = 'https://api.razorpay.com/v1'

async function call(method, path, body) {
  const auth = Buffer.from(env.RAZORPAY_KEY_ID + ':' + env.RAZORPAY_KEY_SECRET).toString('base64')
  let res
  try {
    res = await fetch(API + path, { method, headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
  } catch (e) {
    throw new AppError(502, 'GATEWAY_UNREACHABLE', 'The payment gateway did not respond. Please try again.', { cause: e.message })
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    logger.warn({ status: res.status, path, error: json?.error }, 'Razorpay error')
    throw new AppError(502, 'GATEWAY_ERROR', json?.error?.description || 'The payment gateway refused the request')
  }
  return json
}

export const razorpay = {
  name: 'razorpay',
  publicConfig: () => ({ provider: 'razorpay', keyId: env.RAZORPAY_KEY_ID }),

  async createOrder({ amountPaise, receipt, notes }) {
    const o = await call('POST', '/orders', { amount: amountPaise, currency: 'INR', receipt, notes })
    return { orderId: o.id }
  },

  /** The checkout handler returns razorpay_order_id, razorpay_payment_id, razorpay_signature. */
  verifySignature({ orderId, paymentId, signature }) {
    return safeEqualHex(hmac(env.RAZORPAY_KEY_SECRET, orderId + '|' + paymentId), String(signature ?? ''))
  },

  /** The payment as Razorpay sees it. Authorized payments are captured here. */
  async confirm({ paymentId, orderId, amountPaise }) {
    let p = await call('GET', '/payments/' + encodeURIComponent(paymentId))
    if (p.order_id !== orderId || p.amount !== amountPaise || p.currency !== 'INR') return { ok: false, reason: 'mismatch' }
    if (p.status === 'authorized') p = await call('POST', '/payments/' + encodeURIComponent(paymentId) + '/capture', { amount: amountPaise, currency: 'INR' })
    return p.status === 'captured' ? { ok: true, method: p.method } : { ok: false, reason: p.status }
  },

  verifyWebhook(rawBody, signature) {
    return safeEqualHex(hmac(env.RAZORPAY_WEBHOOK_SECRET, rawBody), String(signature ?? ''))
  },

  /** { eventId, kind: 'paid' | 'failed' | 'ignore', orderId, paymentId } */
  parseWebhook(json, headers) {
    const p = json?.payload?.payment?.entity
    const kind = json?.event === 'payment.captured' || json?.event === 'order.paid' ? 'paid' : json?.event === 'payment.failed' ? 'failed' : 'ignore'
    return { eventId: headers['x-razorpay-event-id'] || json?.event + ':' + p?.id, kind, orderId: p?.order_id, paymentId: p?.id, reason: p?.error_description }
  },

  async refund({ paymentId, amountPaise, notes }) {
    const r = await call('POST', '/payments/' + encodeURIComponent(paymentId) + '/refund', { amount: amountPaise, notes })
    return { refundId: r.id, status: r.status }
  },
}
