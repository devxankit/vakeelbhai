import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { adminSession, userSession } from './api'

/**
 * Live updates from the API (Socket.IO at /socket.io, proxied by Vite in development).
 * One connection per session kind. Events only say "something changed": screens re-fetch
 * from the REST API, which stays the source of truth.
 *   user:  request:update · message · case:new
 *   admin: queue:update
 */
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || undefined
const sockets = {}

function socketFor(kind) {
  if (sockets[kind]) return sockets[kind]
  const session = kind === 'admin' ? adminSession : userSession
  const s = io(BASE, { path: '/socket.io', auth: (cb) => cb({ token: session.token() }), transports: ['websocket', 'polling'] })
  // An expired access token: refresh it, then reconnect with the new one.
  s.on('connect_error', async (e) => {
    if (!/TOKEN_EXPIRED|SESSION_ENDED|UNAUTHORIZED|INVALID_TOKEN/.test(e.message)) return
    try {
      await session.refresh()
      s.connect()
    } catch {
      /* signed out: the screens handle it on their next API call */
    }
  })
  sockets[kind] = s
  return s
}

export function closeLive(kind) {
  sockets[kind]?.close()
  delete sockets[kind]
}

/** Subscribe to events while a component is mounted: useLive('user', { message: (p) => ... }). */
export function useLive(kind, handlers, enabled = true) {
  const ref = useRef(handlers)
  ref.current = handlers
  useEffect(() => {
    if (!enabled) return
    const s = socketFor(kind)
    const names = Object.keys(ref.current)
    const fns = names.map((n) => [n, (p) => ref.current[n]?.(p)])
    fns.forEach(([n, f]) => s.on(n, f))
    // Re-sync after a reconnect, in case events were missed.
    const onRe = () => ref.current.reconnect?.()
    s.io.on('reconnect', onRe)
    return () => {
      fns.forEach(([n, f]) => s.off(n, f))
      s.io.off('reconnect', onRe)
    }
  }, [kind, enabled])
}
