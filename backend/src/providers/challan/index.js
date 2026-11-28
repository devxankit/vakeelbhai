import { env } from '../../config/env.js'
import { unavailable } from '../../utils/errors.js'
import { challanSandbox } from './sandbox.js'

/**
 * e-Challan data provider: looks up a vehicle's challans by number plate.
 *
 * Every provider returns the same shape:
 *   lookup({ plate, type }) → [{ challanNo, offence, amountPaise, date, place, court }]
 *     plate: normalised (MP09AB1234) · date: ISO string · court: true if the challan has gone to court
 *
 * The real provider (a BBPS biller or an aggregator API) is chosen and paid for by the client
 * (SCOPE-OF-WORK 9, open decision). Its adapter goes next to sandbox.js with the same shape.
 */
let override = null
export const setChallanProvider = (p) => (override = p)

export function challanProvider() {
  if (override) return override
  if (env.CHALLAN_PROVIDER === 'sandbox') return challanSandbox
  throw unavailable('e-Challan lookup is not connected yet', 'CHALLAN_DISABLED')
}

export const challanEnabled = () => !!override || env.CHALLAN_PROVIDER !== 'disabled'
