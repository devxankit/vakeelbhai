import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { randomToken, safeEqualHex, sha256 } from '../../utils/crypto.js'
import { unauthorized } from '../../utils/errors.js'
import { Session } from './session.model.js'

const ISSUER = 'vakeelbhai-api'
const DAY = 24 * 60 * 60 * 1000

/**
 * Access token: short-lived JWT (15 min by default) carrying the session id, so a revoked
 * session stops working on the next request. Refresh token: "<sessionId>.<secret>",
 * stored only as a SHA-256 hash and rotated on each use.
 */
export function signAccess({ sub, kind, role, sid }) {
  return jwt.sign({ kind, role, sid }, env.JWT_ACCESS_SECRET, { subject: String(sub), expiresIn: env.ACCESS_TOKEN_TTL, issuer: ISSUER, audience: kind, algorithm: 'HS256' })
}

export function verifyAccess(token) {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISSUER, algorithms: ['HS256'] })
    if (!['user', 'admin'].includes(p.kind) || p.aud !== p.kind) throw new Error('bad kind')
    return p
  } catch (e) {
    throw e?.name === 'TokenExpiredError' ? unauthorized('Session expired', 'TOKEN_EXPIRED') : unauthorized('Invalid token', 'INVALID_TOKEN')
  }
}

const lifetime = (kind) => (kind === 'admin' ? env.ADMIN_REFRESH_TOKEN_HOURS * 3600 * 1000 : env.REFRESH_TOKEN_DAYS * DAY)

export async function createSession({ kind, subject, role, req }) {
  const secret = randomToken()
  const session = await Session.create({
    kind,
    subject,
    subjectModel: kind === 'admin' ? 'AdminUser' : 'User',
    role,
    refreshHash: sha256(secret),
    expiresAt: new Date(Date.now() + lifetime(kind)),
    userAgent: req?.get?.('user-agent')?.slice(0, 300),
    ip: req?.ip,
    lastUsedAt: new Date(),
  })
  return issue(session, secret)
}

function issue(session, secret) {
  return {
    accessToken: signAccess({ sub: session.subject, kind: session.kind, role: session.role, sid: session.id }),
    refreshToken: session.id + '.' + secret,
    refreshExpiresAt: session.expiresAt,
  }
}

/** Swap a refresh token for a new pair. Re-use of an old token revokes the session. */
export async function rotateSession(refreshToken, kind) {
  const [sid, secret] = String(refreshToken ?? '').split('.')
  if (!sid || !secret || !/^[a-f0-9]{24}$/.test(sid)) throw unauthorized('Invalid refresh token', 'INVALID_TOKEN')
  const session = await Session.findById(sid)
  if (!session || session.kind !== kind || session.revokedAt || session.expiresAt < new Date()) throw unauthorized('Session ended. Please log in again.', 'SESSION_ENDED')
  const hash = sha256(secret)
  if (!safeEqualHex(hash, session.refreshHash)) {
    if (session.previousHash && safeEqualHex(hash, session.previousHash)) {
      session.revokedAt = new Date()
      session.revokedReason = 'refresh_reuse'
      await session.save()
    }
    throw unauthorized('Session ended. Please log in again.', 'SESSION_ENDED')
  }
  const next = randomToken()
  // Only rotate if nobody rotated it in the meantime (two refreshes racing).
  const updated = await Session.findOneAndUpdate(
    { _id: session._id, refreshHash: session.refreshHash, revokedAt: null },
    { $set: { previousHash: session.refreshHash, refreshHash: sha256(next), lastUsedAt: new Date() } },
    { new: true },
  )
  if (!updated) throw unauthorized('Session ended. Please log in again.', 'SESSION_ENDED')
  return { session: updated, tokens: issue(updated, next) }
}

export async function revokeSession(sid, reason = 'logout') {
  await Session.updateOne({ _id: sid, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } })
}

export async function revokeAllFor(subject, reason) {
  await Session.updateMany({ subject, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } })
}
