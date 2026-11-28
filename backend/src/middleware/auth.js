import { verifyAccess } from '../modules/auth/tokens.js'
import { Session } from '../modules/auth/session.model.js'
import { User } from '../modules/users/user.model.js'
import { AdminUser } from '../modules/admin/adminUser.model.js'
import { forbidden, unauthorized } from '../utils/errors.js'

/**
 * Reads "Authorization: Bearer <access token>", checks that its session is still live
 * and that the account is active, and sets req.auth:
 *   { kind: 'user' | 'admin', id, role, sid, user? , admin? }
 */
async function resolve(req) {
  const h = req.get('authorization') ?? ''
  const m = /^Bearer (.+)$/.exec(h)
  if (!m) throw unauthorized('Please log in')
  return authenticate(m[1])
}

/** Check an access token (HTTP header or Socket.IO handshake) and load the live account. */
export async function authenticate(token) {
  const p = verifyAccess(token)
  const session = await Session.findById(p.sid).select('revokedAt expiresAt subject kind').lean()
  if (!session || session.revokedAt || session.expiresAt < new Date() || String(session.subject) !== p.sub || session.kind !== p.kind) {
    throw unauthorized('Session ended. Please log in again.', 'SESSION_ENDED')
  }
  if (p.kind === 'admin') {
    const admin = await AdminUser.findById(p.sub)
    if (!admin || admin.status !== 'active') throw forbidden('This admin account is disabled', 'ACCOUNT_DISABLED')
    return { kind: 'admin', id: admin.id, role: admin.role, sid: p.sid, admin }
  }
  const user = await User.findById(p.sub)
  if (!user || user.status === 'deleted') throw unauthorized('Account not found', 'SESSION_ENDED')
  if (user.status === 'blocked') throw forbidden('Your account is on hold. Please contact support.', 'ACCOUNT_BLOCKED')
  return { kind: 'user', id: user.id, role: user.role, sid: p.sid, user }
}

/** Any logged-in client or advocate. Pass roles to narrow it: requireUser('advocate'). */
export const requireUser =
  (...roles) =>
  async (req, _res, next) => {
    const auth = await resolve(req)
    if (auth.kind !== 'user') throw forbidden()
    if (roles.length && !roles.includes(auth.role)) throw forbidden()
    req.auth = auth
    next()
  }

/** Any active admin. Pass roles to narrow it: requireAdmin('super_admin'). */
export const requireAdmin =
  (...roles) =>
  async (req, _res, next) => {
    const auth = await resolve(req)
    if (auth.kind !== 'admin') throw forbidden()
    if (roles.length && !roles.includes(auth.role)) throw forbidden('Only a super admin can do this')
    req.auth = auth
    next()
  }
