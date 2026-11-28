import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { hmac, safeEqualHex } from '../../utils/crypto.js'

/**
 * DEVELOPMENT-ONLY stand-in for the gateway, so the whole payment flow can be exercised
 * before Razorpay keys exist. It behaves like Razorpay's checkout from the server's point
 * of view: an order id, then a signed (paymentId, signature) that the server verifies.
 * No money moves. env.js refuses PAYMENT_PROVIDER=sandbox in production.
 */
const orders = new Map() // orderId -> { amountPaise, paid: paymentId | null }
const secret = () => 'sandbox:' + env.JWT_ACCESS_SECRET

export const sandbox = {
  name: 'sandbox',
  publicConfig: () => ({ provider: 'sandbox' }),

  async createOrder({ amountPaise }) {
    const orderId = 'sbx_order_' + crypto.randomBytes(8).toString('hex')
    orders.set(orderId, { amountPaise, paid: null })
    return { orderId }
  },

  /** What the sandbox "checkout" returns to the browser after the tester clicks Pay. */
  pay(orderId) {
    const o = orders.get(orderId)
    if (!o) return null
    const paymentId = 'sbx_pay_' + crypto.randomBytes(8).toString('hex')
    o.paid = paymentId
    return { orderId, paymentId, signature: hmac(secret(), orderId + '|' + paymentId) }
  },

  verifySignature({ orderId, paymentId, signature }) {
    return safeEqualHex(hmac(secret(), orderId + '|' + paymentId), String(signature ?? ''))
  },

  async confirm({ paymentId, orderId, amountPaise }) {
    const o = orders.get(orderId)
    if (!o || o.paid !== paymentId || o.amountPaise !== amountPaise) return { ok: false, reason: 'mismatch' }
    return { ok: true, method: 'sandbox' }
  },

  verifyWebhook: () => false,
  parseWebhook: () => ({ kind: 'ignore' }),

  async refund() {
    return { refundId: 'sbx_rfnd_' + crypto.randomBytes(6).toString('hex'), status: 'processed' }
  },
}
