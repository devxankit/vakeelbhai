import { env } from '../../config/env.js'
import { hmac, otpCode, safeEqualHex } from '../../utils/crypto.js'
import { badRequest, tooMany } from '../../utils/errors.js'
import { sendOtpSms } from '../../providers/sms/index.js'
import { Otp } from './otp.model.js'

const HOUR = 3600 * 1000
const DAY = 24 * HOUR
const hashFor = (phone, role, code) => hmac(env.OTP_SECRET, phone + '|' + role + '|' + code)

/**
 * Send a login code. Limits per phone and role: one send every OTP_RESEND_SECONDS and
 * OTP_MAX_SENDS_PER_HOUR per hour. Store-review numbers (OTP_TEST_NUMBERS) skip the SMS.
 */
export async function sendOtp(phone, role) {
  const now = Date.now()
  const doc = (await Otp.findOne({ phone, role })) ?? new Otp({ phone, role, sends: [] })
  if (doc.lastSentAt) {
    const wait = Math.ceil((doc.lastSentAt.getTime() + env.OTP_RESEND_SECONDS * 1000 - now) / 1000)
    if (wait > 0) throw tooMany('Please wait ' + wait + ' seconds before asking for a new code', wait)
  }
  const recent = (doc.sends ?? []).filter((d) => d.getTime() > now - HOUR)
  if (recent.length >= env.OTP_MAX_SENDS_PER_HOUR) {
    const wait = Math.ceil((recent[0].getTime() + HOUR - now) / 1000)
    throw tooMany('Too many codes requested. Try again later.', wait)
  }

  const testCode = env.otpTestNumbers.get(phone)
  const code = testCode ?? otpCode()
  doc.codeHash = hashFor(phone, role, code)
  doc.expiresAt = new Date(now + env.OTP_TTL_SECONDS * 1000)
  doc.attempts = 0
  doc.lastSentAt = new Date(now)
  doc.sends = [...recent, new Date(now)]
  doc.purgeAt = new Date(now + DAY)
  // Save first: if the SMS then fails, the cooldown still applies, which stops SMS flooding.
  await doc.save()
  if (!testCode) await sendOtpSms(phone, code)
  return { expiresInSeconds: env.OTP_TTL_SECONDS, resendInSeconds: env.OTP_RESEND_SECONDS }
}

/** Check a code. Each code allows OTP_MAX_ATTEMPTS tries and works once. */
export async function verifyOtp(phone, role, code) {
  // Count the attempt atomically before comparing, so parallel guesses cannot exceed the limit.
  const doc = await Otp.findOneAndUpdate(
    { phone, role, codeHash: { $type: 'string' }, expiresAt: { $gt: new Date() }, attempts: { $lt: env.OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true },
  )
  if (!doc) throw badRequest('The code has expired or too many attempts were made. Request a new code.', { reason: 'OTP_EXPIRED' })
  if (!safeEqualHex(hashFor(phone, role, code), doc.codeHash)) {
    const left = Math.max(0, env.OTP_MAX_ATTEMPTS - doc.attempts)
    throw badRequest(left ? 'Wrong code. ' + left + ' attempt(s) left.' : 'Wrong code. Request a new code.', { reason: 'OTP_WRONG', attemptsLeft: left })
  }
  // Single use.
  await Otp.updateOne({ _id: doc._id, codeHash: doc.codeHash }, { $unset: { codeHash: 1, expiresAt: 1 } })
}
