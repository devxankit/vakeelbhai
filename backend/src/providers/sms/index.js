import { env } from '../../config/env.js'
import { unavailable } from '../../utils/errors.js'
import { logger } from '../../utils/logger.js'

/**
 * SMS for OTPs. The provider is chosen with SMS_PROVIDER:
 *  - console:     development only. Prints the code to the server log. Refused in production.
 *  - smsindiahub: the planned provider (PROJECT-PLAN "Defaults"). NOT integrated yet: it needs
 *                 the client's account, sender ID and a DLT-registered OTP template.
 *  - disabled:    login by OTP is switched off (only OTP_TEST_NUMBERS work).
 */
const providers = {
  console: async (phone, code) => {
    logger.warn({ phone }, '[DEV SMS] OTP for +91' + phone + ' is ' + code)
  },
  smsindiahub: async () => {
    throw unavailable('SMS sending is not set up yet', 'SMS_NOT_CONFIGURED')
  },
  disabled: async () => {
    throw unavailable('OTP login is switched off', 'SMS_DISABLED')
  },
}

let override = null
/** Tests capture codes instead of printing them. */
export const setSmsSender = (fn) => (override = fn)

export function sendOtpSms(phone, code) {
  return (override ?? providers[env.SMS_PROVIDER])(phone, code)
}
