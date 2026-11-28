import { env } from '../../config/env.js'
import { unavailable } from '../../utils/errors.js'
import { razorpay } from './razorpay.js'
import { sandbox } from './sandbox.js'

/** The configured payment gateway, or an error when payments are switched off. */
let override = null
export const setPaymentProvider = (p) => (override = p)

export function gateway() {
  if (override) return override
  if (env.PAYMENT_PROVIDER === 'razorpay') return razorpay
  if (env.PAYMENT_PROVIDER === 'sandbox') return sandbox
  throw unavailable('Online payment is not available yet', 'PAYMENTS_DISABLED')
}

export const paymentsEnabled = () => !!override || env.PAYMENT_PROVIDER !== 'disabled'
