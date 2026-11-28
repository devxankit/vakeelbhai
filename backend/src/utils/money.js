/**
 * Money helpers. The server stores every amount as INTEGER PAISE and every rate as
 * BASIS POINTS (1% = 100 bp), so no rupee is ever lost to floating point.
 *
 * Rounding: each derived amount is rounded to the nearest paisa (half away from zero),
 * which matches r2() in mobile-app/src/utils/money.ts and frontend/src/lib/money.js.
 * The pricing engine (Phase 4) builds on these and is tested against the same numbers.
 */

export const toPaise = (rupees) => Math.round(Number(rupees) * 100)
export const toRupees = (paise) => paise / 100

/** Percent (e.g. 20 or 18.5) to basis points (2000, 1850). Two decimals at most. */
export const percentToBp = (p) => Math.round(Number(p) * 100)
export const bpToPercent = (bp) => bp / 100
/** Basis points to the fraction the apps use for display (2000 -> 0.2). */
export const bpToFraction = (bp) => bp / 10000

/** amount × rate, in paise, rounded half away from zero. */
export function applyBp(paise, bp) {
  if (!Number.isInteger(paise) || !Number.isInteger(bp)) throw new TypeError('applyBp needs integer paise and basis points')
  const raw = (paise * bp) / 10000
  return Math.sign(raw) * Math.round(Math.abs(raw))
}
