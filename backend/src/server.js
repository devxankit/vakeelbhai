import http from 'node:http'
import { env } from './config/env.js'
import { connectDb, disconnectDb } from './config/db.js'
import { createLogger, logger, setLogger } from './utils/logger.js'
import { createApp } from './app.js'
import { initRealtime } from './realtime/io.js'
import { autoConfirmDue, expireCheckouts } from './modules/payments/payment.service.js'

async function main() {
  setLogger(createLogger(env.LOG_LEVEL))
  await connectDb(env.MONGODB_URI)
  const server = http.createServer(createApp())
  initRealtime(server)
  server.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV, payments: env.PAYMENT_PROVIDER }, 'Vakeel Bhai API listening'))

  // Background jobs: auto-confirm finished work after N days; close unpaid checkouts.
  // (One API process. With several, run these on one instance only.)
  const tick = async () => {
    try {
      const confirmed = await autoConfirmDue()
      const expired = await expireCheckouts()
      if (confirmed || expired) logger.info({ confirmed, expired }, 'Jobs ran')
    } catch (err) {
      logger.error({ err }, 'Jobs failed')
    }
  }
  const jobs = setInterval(tick, 5 * 60 * 1000)
  setTimeout(tick, 10000).unref()

  const stop = async (signal) => {
    logger.info({ signal }, 'Shutting down')
    clearInterval(jobs)
    server.close(async () => {
      await disconnectDb()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10000).unref()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err.message)
  process.exit(1)
})
