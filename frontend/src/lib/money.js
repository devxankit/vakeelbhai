/**
 * Money rules from docs/SCOPE-OF-WORK.md section 5. Same as mobile-app/src/utils/money.ts,
 * so the app, the website and (later) the backend agree on every rupee.
 * Rates come from the admin settings; these are the defaults.
 */
export const DEFAULT_RATES = { commission: 0.2, gst: 0.18 }

const r2 = (n) => Math.round(n * 100) / 100

export function offerDiscount(fee, offer) {
  if (!offer) return 0
  let d = offer.flat ?? (offer.percent ? (fee * offer.percent) / 100 : 0)
  if (offer.max != null) d = Math.min(d, offer.max)
  return r2(Math.min(d, fee))
}

export function clientBill(fee, { discount = 0, gstOnService = true, wallet = 0, rates = DEFAULT_RATES } = {}) {
  const base = r2(fee - discount)
  const gst = gstOnService ? r2(base * rates.gst) : 0
  const before = r2(base + gst)
  const w = r2(Math.min(wallet, before))
  return { fee, discount, base, gst, wallet: w, total: r2(before - w) }
}

export function advocatePayout(base, rates = DEFAULT_RATES) {
  const commission = r2(base * rates.commission)
  const gstOnCommission = r2(commission * rates.gst)
  return { base, commission, gstOnCommission, net: r2(base - commission - gstOnCommission) }
}

export function membershipTotal(price, rates = DEFAULT_RATES) {
  const gst = r2(price * rates.gst)
  return { price, gst, total: r2(price + gst) }
}

/** ₹1,23,456 */
export function inr(n) {
  if (n == null || Number.isNaN(n)) return '—'
  const neg = n < 0
  const v = Math.abs(n)
  const whole = Math.floor(v)
  const paise = Math.round((v - whole) * 100)
  const s = String(whole)
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return (neg ? '−' : '') + '₹' + (rest ? rest + ',' + last3 : last3) + (paise ? '.' + String(paise).padStart(2, '0') : '')
}
