import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import mongoose from 'mongoose'
import { env } from './config/env.js'
import { logger } from './utils/logger.js'
import { sanitizeInput } from './middleware/sanitize.js'
import { apiLimiter } from './middleware/rateLimit.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { metaRoutes } from './modules/meta/meta.routes.js'
import { adminAuthRoutes } from './modules/admin/adminAuth.routes.js'
import { adminUsersRoutes } from './modules/admin/adminUsers.routes.js'
import { adminAuditRoutes, adminDashboardRoutes } from './modules/admin/adminMisc.routes.js'
import { adminCategoryRoutes } from './modules/categories/categories.routes.js'
import { settingsRoutes } from './modules/settings/settings.routes.js'
import { clientRoutes } from './modules/clients/client.routes.js'
import { advocateRoutes } from './modules/advocates/advocate.routes.js'
import { adminAdvocateRoutes, adminClientRoutes } from './modules/admin/adminPeople.routes.js'
import { adminPlanRoutes } from './modules/membership/plans.routes.js'
import { adminRequestRoutes, advocateCaseRoutes, chatRoutes, clientRequestRoutes } from './modules/requests/request.routes.js'
import { adminChallanRoutes, clientChallanRoutes } from './modules/challans/challan.routes.js'
import { adminSupportRoutes, supportRoutes } from './modules/support/support.routes.js'
import { exploreRoutes } from './modules/advocates/explore.routes.js'
import { notificationRoutes } from './modules/notifications/notifications.js'
import { adminOfferRoutes, advocateOfferRoutes, bannerRoutes, clientOfferRoutes } from './modules/offers/offer.routes.js'
import { adminGstRoutes, clientGstRoutes } from './modules/gstfiling/gstfiling.routes.js'
import { adminContentRoutes, contentRoutes } from './modules/content/content.js'
import { invoiceRoutes } from './modules/invoices/invoices.js'
import { reportRoutes } from './modules/reports/reports.js'
import { adminMoneyRoutes, advocatePaymentRoutes, clientPaymentRoutes, paymentRoutes, webhookRoutes } from './modules/payments/payment.routes.js'

/** Builds the Express app. No network listening here, so tests can drive it with supertest. */
export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY)

  app.use(helmet())
  app.use(
    cors({
      // Mobile apps send no Origin header; browsers must be on the allow-list.
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)),
      credentials: true,
    }),
  )
  if (!env.isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }))
  // Gateway webhooks need the raw body for the signature check, so they come before the JSON parser.
  app.use('/api/payments/webhook', webhookRoutes())
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(sanitizeInput)

  const api = express.Router()
  api.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down' } }))
  api.use(apiLimiter())
  api.use('/auth', authRoutes())
  api.use('/meta', metaRoutes())
  api.use('/client/requests', clientRequestRoutes())
  api.use('/client', clientRoutes())
  api.use('/client', clientPaymentRoutes())
  api.use('/client/advocates', exploreRoutes())
  api.use('/client', clientChallanRoutes())
  api.use('/support', supportRoutes())
  api.use('/notifications', notificationRoutes())
  api.use('/client/gst-filings', clientGstRoutes())
  api.use('/client', clientOfferRoutes())
  api.use('/advocate', advocateOfferRoutes())
  api.use('/banners', bannerRoutes())
  api.use('/content', contentRoutes())
  api.use('/', invoiceRoutes())
  api.use('/advocate/cases', advocateCaseRoutes())
  api.use('/advocate', advocateRoutes())
  api.use('/advocate', advocatePaymentRoutes())
  api.use('/requests/:number/messages', chatRoutes())
  api.use('/payments', paymentRoutes())

  api.use('/admin/auth', adminAuthRoutes())
  api.use('/admin/users', adminUsersRoutes())
  api.use('/admin/dashboard', adminDashboardRoutes())
  api.use('/admin/audit-logs', adminAuditRoutes())
  api.use('/admin/categories', adminCategoryRoutes())
  api.use('/admin/settings', settingsRoutes())
  api.use('/admin/advocates', adminAdvocateRoutes())
  api.use('/admin/clients', adminClientRoutes())
  api.use('/admin/plans', adminPlanRoutes())
  api.use('/admin/requests', adminRequestRoutes())
  api.use('/admin/challans', adminChallanRoutes())
  api.use('/admin/support', adminSupportRoutes())
  api.use('/admin/gst-filings', adminGstRoutes())
  api.use('/admin/reports', reportRoutes())
  api.use('/admin', adminOfferRoutes())
  api.use('/admin', adminContentRoutes())
  api.use('/admin', adminMoneyRoutes())

  app.use('/api', api)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
