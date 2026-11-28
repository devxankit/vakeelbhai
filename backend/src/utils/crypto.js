import crypto from 'node:crypto'

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
export const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex')

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

/** A 6-digit code from a cryptographic source (no modulo bias). */
export const otpCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
