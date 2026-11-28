import { Server } from 'socket.io'
import { env } from '../config/env.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'

/**
 * Live updates over Socket.IO (path /socket.io, already proxied by vite.config.js).
 * Connect with the access token: io({ auth: { token } }).
 * Each socket joins only its own room ("user:<id>", or "admins" for staff), so events are
 * pushed to the people involved and nobody can subscribe to someone else's chat.
 *
 * Events: request:update { number }, message { number, message }, case:new { number }, queue:update { number }
 * The REST API stays the source of truth; events only say "something changed, fetch it".
 */
let io = null

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)), credentials: true },
  })
  io.use(async (socket, next) => {
    try {
      socket.data.auth = await authenticate(String(socket.handshake.auth?.token ?? ''))
      next()
    } catch (e) {
      next(new Error(e.code || 'UNAUTHORIZED'))
    }
  })
  io.on('connection', (socket) => {
    const a = socket.data.auth
    socket.join(a.kind === 'admin' ? 'admins' : 'user:' + a.id)
  })
  logger.info('Realtime ready')
  return io
}

export const stopRealtime = () => io?.close()

export function toUser(userId, event, payload) {
  if (io && userId) io.to('user:' + String(userId)).emit(event, payload)
}

export function toAdmins(event, payload) {
  if (io) io.to('admins').emit(event, payload)
}
