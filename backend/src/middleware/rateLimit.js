import { rateLimit } from 'express-rate-limit'
import { env } from '../config/env.js'

/**
 * IP-level limits. The in-memory store is fine for one server process; switch to a shared
 * store (Redis) before running several instances. Per-phone OTP limits live in the OTP
 * service, backed by MongoDB, so they hold across processes.
 */
const make = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please wait a little and try again.' } }),
  })

export const authLimiter = () => make(15 * 60 * 1000, env.RATE_LIMIT_AUTH)
export const apiLimiter = () => make(60 * 1000, env.RATE_LIMIT_API)
