import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireUser } from '../../middleware/auth.js'
import { authLimiter } from '../../middleware/rateLimit.js'
import { env } from '../../config/env.js'
import { badRequest, forbidden, unauthorized } from '../../utils/errors.js'
import { ok } from '../../utils/http.js'
import { User } from '../users/user.model.js'
import { sendOtp, verifyOtp } from './otp.service.js'
import { createSession, revokeAllFor, revokeSession, rotateSession } from './tokens.js'
import { conflict } from '../../utils/errors.js'
import { ServiceRequest } from '../requests/request.models.js'
import { ChallanOrder } from '../challans/challan.models.js'
import { Wallet } from '../wallet/wallet.models.js'

/**
 * Client and advocate login: mobile number + OTP only (SCOPE-OF-WORK section 2, confirmed
 * by the client on 18 Nov 2026). Verifying a code for a new number creates the account.
 * Tokens are returned in the body: the mobile app keeps them in secure storage.
 */
const phone = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
const role = z.enum(['client', 'advocate'])

/**
 * Website mode: a request with "X-Client: web" gets its refresh token in an httpOnly,
 * SameSite=Strict cookie scoped to /api/auth instead of the body, so page scripts never
 * see it. The mobile app keeps using the body (stored in the phone's secure storage).
 */
const COOKIE = 'vb_rt'
const cookieOpts = () => ({ httpOnly: true, sameSite: 'strict', secure: env.isProd || env.COOKIE_SECURE, path: '/api/auth' })
const isWeb = (req) => req.get('x-client') === 'web'
function deliver(req, res, tokens, extra = {}) {
  if (!isWeb(req)) return ok(res, { ...tokens, ...extra })
  res.cookie(COOKIE, tokens.refreshToken, { ...cookieOpts(), expires: tokens.refreshExpiresAt })
  ok(res, { accessToken: tokens.accessToken, ...extra })
}

export function authRoutes() {
  const r = Router()
  const limiter = authLimiter()

  r.post('/otp/send', limiter, validate({ body: z.object({ phone, role }) }), async (req, res) => {
    const { phone, role } = req.valid.body
    ok(res, await sendOtp(phone, role))
  })

  r.post('/otp/verify', limiter, validate({ body: z.object({ phone, role, otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }) }), async (req, res) => {
    const { phone, role, otp } = req.valid.body
    await verifyOtp(phone, role, otp)
    let user = await User.findOne({ phone, role })
    let isNew = false
    if (!user) {
      try {
        user = await User.create({ phone, role })
        isNew = true
      } catch (e) {
        // Two verifies racing for a new number: the other one created it.
        if (e?.code !== 11000) throw e
        user = await User.findOne({ phone, role })
      }
    }
    if (user.status === 'blocked') throw forbidden('Your account is on hold. Please contact support.', 'ACCOUNT_BLOCKED')
    if (user.status === 'deleted') {
      // The number was deleted earlier and comes back: a fresh, empty profile on the same record
      // (money and case records are kept for the law, but are no longer linked to a name).
      user.status = 'active'
      isNew = true
    }
    user.lastLoginAt = new Date()
    await user.save()
    const tokens = await createSession({ kind: 'user', subject: user._id, role: user.role, req })
    deliver(req, res, tokens, { isNew, user: user.toPublic() })
  })

  /** App: { refreshToken } in the body. Website: the cookie, plus X-Requested-With (blocks cross-site forms). */
  r.post('/refresh', limiter, validate({ body: z.object({ refreshToken: z.string().min(10).max(200).optional() }) }), async (req, res) => {
    let token = req.valid.body.refreshToken
    if (!token && isWeb(req)) {
      if (req.get('x-requested-with') !== 'XMLHttpRequest') throw badRequest('Missing X-Requested-With header')
      token = req.cookies?.[COOKIE]
    }
    if (!token) throw unauthorized('Please log in', 'SESSION_ENDED')
    let rotated
    try {
      rotated = await rotateSession(token, 'user')
    } catch (e) {
      if (isWeb(req)) res.clearCookie(COOKIE, cookieOpts())
      throw e
    }
    const user = await User.findById(rotated.session.subject)
    if (!user || user.status !== 'active') {
      await revokeSession(rotated.session.id, 'account_' + (user?.status ?? 'missing'))
      if (isWeb(req)) res.clearCookie(COOKIE, cookieOpts())
      throw forbidden('Your account is on hold. Please contact support.', 'ACCOUNT_BLOCKED')
    }
    deliver(req, res, rotated.tokens, { user: user.toPublic() })
  })

  /** Ends this device's session only. */
  r.post('/logout', requireUser(), async (req, res) => {
    await revokeSession(req.auth.sid, 'logout')
    if (isWeb(req)) res.clearCookie(COOKIE, cookieOpts())
    ok(res, { loggedOut: true })
  })

  r.get('/me', requireUser(), (req, res) => ok(res, req.auth.user.toPublic()))

  /**
   * Delete my account (DPDP Act: the user can erase their profile). Refused while money or
   * work is in flight. Name and email are erased and every session ends; payment, ledger and
   * case records stay (tax and dispute law), no longer linked to a name.
   */
  r.delete('/account', requireUser(), async (req, res) => {
    const u = req.auth.user
    const id = u._id
    const field = u.role === 'client' ? 'client' : 'advocate'
    const [busy, challans, wallet] = await Promise.all([
      ServiceRequest.exists({ [field]: id, status: { $in: ['assigned', 'accepted', 'quoted', 'paid', 'done', 'disputed'] } }),
      ChallanOrder.exists({ user: id, status: 'processing' }),
      Wallet.findOne({ user: id }).lean(),
    ])
    if (busy) throw conflict(u.role === 'client' ? 'Finish or close your active requests first' : 'Finish your active cases first', 'ACTIVE_WORK')
    if (challans) throw conflict('An e-Challan payment is still being processed', 'ACTIVE_WORK')
    if (u.role === 'advocate' && wallet && (wallet.balancePaise > 0 || wallet.holdPaise > 0)) throw conflict('Withdraw your wallet balance first', 'WALLET_NOT_EMPTY')
    if (u.role === 'client') await ServiceRequest.updateMany({ client: id, status: 'submitted' }, { $set: { status: 'cancelled', completedAt: new Date() } })
    u.status = 'deleted'
    u.name = ''
    u.email = ''
    await u.save()
    await revokeAllFor(id, 'account_deleted')
    ok(res, { deleted: true })
  })

  return r
}
