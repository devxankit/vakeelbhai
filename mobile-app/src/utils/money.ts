/**
 * Money rules from SCOPE-OF-WORK.md section 5. Pure functions so they can be unit-tested
 * and later mirrored exactly by the backend. Rates are admin-editable; these are defaults.
 */
export const DEFAULT_RATES = { commission: 0.2, gst: 0.18 };

export type Rates = { commission: number; gst: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Discount from an offer: percent of the fee, capped at `max` (both optional). */
export function offerDiscount(fee: number, offer?: { percent?: number; flat?: number; max?: number }) {
  if (!offer) return 0;
  let d = offer.flat ?? (offer.percent ? (fee * offer.percent) / 100 : 0);
  if (offer.max != null) d = Math.min(d, offer.max);
  return r2(Math.min(d, fee));
}

/** What the client pays at checkout. GST applies after the discount, and only where the category charges it. */
export function clientBill(fee: number, opts: { discount?: number; gstOnService?: boolean; wallet?: number; rates?: Rates } = {}) {
  const rates = opts.rates ?? DEFAULT_RATES;
  const discount = opts.discount ?? 0;
  const base = r2(fee - discount);
  const gst = opts.gstOnService === false ? 0 : r2(base * rates.gst);
  const beforeWallet = r2(base + gst);
  const wallet = r2(Math.min(opts.wallet ?? 0, beforeWallet));
  return { fee, discount, base, gst, wallet, total: r2(beforeWallet - wallet) };
}

/** What the advocate receives on completion, from the (discounted) fee the client paid. */
export function advocatePayout(base: number, rates: Rates = DEFAULT_RATES) {
  const commission = r2(base * rates.commission);
  const gstOnCommission = r2(commission * rates.gst);
  return { base, commission, gstOnCommission, net: r2(base - commission - gstOnCommission) };
}

/** Membership fee plus GST. */
export function membershipTotal(price: number, rates: Rates = DEFAULT_RATES) {
  const gst = r2(price * rates.gst);
  return { price, gst, total: r2(price + gst) };
}

/** Indian-style rupees: ₹1,23,456 (paise only when present). */
export function inr(n: number) {
  const neg = n < 0;
  const v = Math.abs(n);
  const whole = Math.floor(v);
  const paise = Math.round((v - whole) * 100);
  const s = whole.toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const body = rest ? rest + ',' + last3 : last3;
  return (neg ? '−' : '') + '₹' + body + (paise ? '.' + String(paise).padStart(2, '0') : '');
}
