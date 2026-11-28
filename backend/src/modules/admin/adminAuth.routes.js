import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { validate } from '../../middleware/validate.js'
import { requireAdmin } from '../../middleware/auth.js'
import { authLimiter } from '../../middleware/rateLimit.js'
import { badRequest, forbidden, unauthorized } from '../../utils/errors.js'
import { ok } from '../../utils/http.js'
import { createSession, revokeAllFor, revokeSession, rotateSession } from '../auth/tokens.js'
import { audit } from '../audit/audit.service.js'
import { AdminUser } from './adminUser.model.js'

export const BCRYPT_COST = 12
export const passwordRule = z.string().min(10, 'Use at least 10 characters').max(128)
// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST)

/**
 * The admin panel is web-only, so its refresh token lives in an httpOnly, SameSite=Strict
 * cookie scoped to /api/admin/auth. JavaScript never sees it; the short-lived access token
 * is kept in memory by the panel. Refresh also requires the X-Requested-With header,
 * which a cross-site form cannot send.
 */
const COOKIE = 'vb_admin_rt'
const cookieOpts = () => ({ httpOnly: true, sameSite: 'strict', secure: env.isProd || env.COOKIE_SECURE, path: '/api/admin/auth' })

function setRefreshCookie(res, tokens) {
  res.cookie(COOKIE, tokens.refreshToken, { ...cookieOpts(), expires: tokens.refreshExpiresAt })
}

export function adminAuthRoutes() {
  const r = Router()
  const limiter = authLimiter()

  r.post('/login', limiter, validate({ body: z.object({ email: z.string().trim().toLowerCase().email().max(120), password: z.string().min(1).max(128) }) }), async (req, res) => {
    const { email, password } = req.valid.body
    const admin = await AdminUser.findOne({ email }).select('+passwordHash +failedLogins +lockUntil')
    const fail = () => unauthorized('Wrong email or password', 'BAD_CREDENTIALS')

    if (!admin) {
      await bcrypt.compare(password, DUMMY_HASH)
      throw fail()
    }
    if (admin.lockUntil && admin.lockUntil > new Date()) {
      const minutes = Math.ceil((admin.lockUntil - Date.now()) / 60000)
      throw forbidden('Too many wrong attempts. Try again in ' + minutes + ' minute(s).', 'ACCOUNT_LOCKED')
    }
    const good = await bcrypt.compare(password, admin.passwordHash)
    if (!good) {
      // Atomic, so parallel guesses all count.
      const after = await AdminUser.findOneAndUpdate({ _id: admin._id }, { $inc: { failedLogins: 1 } }, { new: true }).select('+failedLogins')
      if (after.failedLogins >= env.ADMIN_MAX_FAILED_LOGINS) {
        await AdminUser.updateOne({ _id: admin._id }, { $set: { lockUntil: new Date(Date.now() + env.ADMIN_LOCK_MINUTES * 60000), failedLogins: 0 } })
      }
      throw fail()
    }
    if (admin.status !== 'active') throw forbidden('This admin account is disabled', 'ACCOUNT_DISABLED')

    await AdminUser.updateOne({ _id: admin._id }, { $set: { failedLogins: 0, lastLoginAt: new Date() }, $unset: { lockUntil: 1 } })
    const tokens = await createSession({ kind: 'admin', subject: admin._id, role: admin.role, req })
    setRefreshCookie(res, tokens)
    ok(res, { accessToken: tokens.accessToken, admin: admin.toPublic() })
  })

  r.post('/refresh', limiter, async (req, res) => {
    if (req.get('x-requested-with') !== 'XMLHttpRequest') throw badRequest('Missing X-Requested-With header')
    const token = req.cookies?.[COOKIE]
    if (!token) throw unauthorized('Please log in', 'SESSION_ENDED')
    let rotated
    try {
      rotated = await rotateSession(token, 'admin')
    } catch (e) {
      res.clearCookie(COOKIE, cookieOpts())
      throw e
    }
    const admin = await AdminUser.findById(rotated.session.subject)
    if (!admin || admin.status !== 'active') {
      await revokeSession(rotated.session.id, 'account_disabled')
      res.clearCookie(COOKIE, cookieOpts())
      throw forbidden('This admin account is disabled', 'ACCOUNT_DISABLED')
    }
    setRefreshCookie(res, rotated.tokens)
    ok(res, { accessToken: rotated.tokens.accessToken, admin: admin.toPublic() })
  })

  r.post('/logout', requireAdmin(), async (req, res) => {
    await revokeSession(req.auth.sid, 'logout')
    res.clearCookie(COOKIE, cookieOpts())
    ok(res, { loggedOut: true })
  })

  r.get('/me', requireAdmin(), (req, res) => ok(res, req.auth.admin.toPublic()))

  /** Change your own password. Ends every other session of this admin. */
  r.post('/password', requireAdmin(), validate({ body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordRule }) }), async (req, res) => {
    const { currentPassword, newPassword } = req.valid.body
    const admin = await AdminUser.findById(req.auth.id).select('+passwordHash')
    if (!(await bcrypt.compare(currentPassword, admin.passwordHash))) throw badRequest('Your current password is wrong')
    if (currentPassword === newPassword) throw badRequest('Choose a password you have not used just now')
    admin.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST)
    admin.passwordChangedAt = new Date()
    await admin.save()
    await revokeAllFor(admin._id, 'password_changed')
    const tokens = await createSession({ kind: 'admin', subject: admin._id, role: admin.role, req })
    setRefreshCookie(res, tokens)
    await audit(req, { action: 'admin.password_changed', entityType: 'AdminUser', entityId: admin.id })
    ok(res, { accessToken: tokens.accessToken })
  })

  return r
}
