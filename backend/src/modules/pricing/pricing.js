import { applyBp } from '../../utils/money.js'

/**
 * THE pricing engine. Every amount the platform charges, holds, deducts or pays out is
 * calculated here and nowhere else (SCOPE-OF-WORK section 5). All values are integer paise;
 * rates are basis points. Same rules and rounding as mobile-app/src/utils/money.ts, so the
 * apps' previews and the server always agree (see tests/pricing.test.js).
 *
 * For a quoted fee F, discount D, commission rate c, GST rate g:
 *   base             B = F − D                    (offers: GST and commission after the discount)
 *   GST on the fee     = g × B   only if the category charges GST on the service
 *   client pays        = B + GST − wallet used
 *   commission       C = c × B
 *   GST on commission  = g × C
 *   advocate net       = B − C − g × C            (credited on completion)
 */

/** Rates that apply to a category now: its own commission if the admin set one, else the global rate. */
export function ratesFor(category, settings) {
  return { commissionBp: category?.commissionBp ?? settings.commissionBp, gstBp: settings.gstBp }
}

/**
 * What the client pays for a quote.
 * walletAvailable: client wallet balance · walletMaxUseBp: admin cap on the share of the order (null = no cap)
 */
export function clientBill({ feePaise, discountPaise = 0, gstOnService = true, gstBp, walletAvailablePaise = 0, useWallet = false, walletMaxUseBp = null }) {
  if (!Number.isInteger(feePaise) || feePaise <= 0) throw new Error('clientBill: bad fee')
  const discount = Math.min(Math.max(0, discountPaise), feePaise)
  const base = feePaise - discount
  const gst = gstOnService ? applyBp(base, gstBp) : 0
  const beforeWallet = base + gst
  let walletCap = beforeWallet
  if (walletMaxUseBp != null) walletCap = Math.min(walletCap, applyBp(beforeWallet, walletMaxUseBp))
  const wallet = useWallet ? Math.max(0, Math.min(walletAvailablePaise, walletCap)) : 0
  return { feePaise, discountPaise: discount, basePaise: base, gstPaise: gst, walletPaise: wallet, totalPaise: beforeWallet - wallet }
}

/** What the advocate receives from the (discounted) base the client paid. */
export function advocatePayout(basePaise, { commissionBp, gstBp }) {
  const commission = applyBp(basePaise, commissionBp)
  const gstOnCommission = applyBp(commission, gstBp)
  return { basePaise, commissionPaise: commission, gstOnCommissionPaise: gstOnCommission, netPaise: basePaise - commission - gstOnCommission, commissionBp, gstBp }
}

/**
 * e-Challan payment (SCOPE-OF-WORK 9): the challan amounts are passed on to the traffic
 * department as they are; Vakeel Bhai adds its charge per challan, and GST applies to that
 * charge only.
 */
export function challanBill({ challanPaise, feePerChallanPaise, gstBp }) {
  if (!challanPaise.length || challanPaise.some((p) => !Number.isInteger(p) || p <= 0)) throw new Error('challanBill: bad challan amounts')
  const challans = challanPaise.reduce((a, p) => a + p, 0)
  const fee = feePerChallanPaise * challanPaise.length
  const gst = applyBp(fee, gstBp)
  return { challanPaise: challans, feePaise: fee, gstPaise: gst, totalPaise: challans + fee + gst, gstBp }
}

/** Membership fee (after any offer discount) plus GST. */
export function membershipTotal(pricePaise, gstBp, discountPaise = 0) {
  const discount = Math.min(Math.max(0, discountPaise), pricePaise)
  const base = pricePaise - discount
  const gst = applyBp(base, gstBp)
  return { pricePaise, discountPaise: discount, basePaise: base, gstPaise: gst, totalPaise: base + gst, gstBp }
}
