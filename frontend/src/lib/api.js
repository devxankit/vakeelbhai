/**
 * Client for the Vakeel Bhai API (backend/). In development Vite proxies /api to the
 * Express server (vite.config.js); in production VITE_API_URL can point elsewhere.
 *
 * Two independent sessions, both with the access token in memory only and the refresh
 * token in an httpOnly cookie the page cannot read:
 *   admin  /admin panel staff (email + password)
 *   user   client or advocate on the website (mobile OTP), sent with "X-Client: web"
 * A page reload signs back in silently through the cookie.
 */
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api'

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || (status ? 'Something went wrong (' + status + ')' : 'Could not reach the server. Check your connection.'))
    this.status = status
    this.code = body?.error?.code || 'NETWORK'
    this.details = body?.error?.details
  }
}

async function raw(path, { method = 'GET', body, token, headers = {}, as = 'json' } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: { ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0)
  }
  if (as === 'blob' && res.ok) return res.blob()
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) throw new ApiError(res.status, json)
  return json
}

/** One logged-in party: token in memory, silent refresh through the cookie, one retry on 401. */
function makeSession({ refreshPath, headers = {} }) {
  let token = null
  let refreshing = null
  let signedOut = () => {}

  const refresh = () => {
    refreshing ??= raw(refreshPath, { method: 'POST', body: {}, headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest' } })
      .then((j) => {
        token = j.data.accessToken
        return j.data
      })
      .finally(() => (refreshing = null))
    return refreshing
  }

  const call = async (path, opts = {}) => {
    const o = { ...opts, headers: { ...headers, ...opts.headers } }
    try {
      return await raw(path, { ...o, token })
    } catch (e) {
      if (e.status !== 401 || !token) throw e
      try {
        await refresh()
      } catch {
        token = null
        signedOut()
        throw e
      }
      return raw(path, { ...o, token })
    }
  }

  return {
    call,
    refresh,
    set: (t) => (token = t),
    clear: () => (token = null),
    token: () => token,
    onSignedOut: (fn) => (signedOut = fn),
    /** A private image (document, photo) as an object URL. Revoke it when done. */
    fileUrl: async (path) => URL.createObjectURL(await call(path, { as: 'blob' })),
  }
}

const admin = makeSession({ refreshPath: '/admin/auth/refresh' })
const user = makeSession({ refreshPath: '/auth/refresh', headers: { 'X-Client': 'web' } })

export const adminApi = admin.call
export const refreshAdmin = admin.refresh
export const adminSession = { set: admin.set, clear: admin.clear, onSignedOut: admin.onSignedOut, token: admin.token, refresh: admin.refresh }
export const adminFileUrl = admin.fileUrl

export const userApi = user.call
export const refreshUser = user.refresh
export const userSession = { set: user.set, clear: user.clear, onSignedOut: user.onSignedOut, token: user.token, refresh: user.refresh }
export const userFileUrl = user.fileUrl

/** Upload one image as multipart/form-data (field "file"). */
export const uploadForm = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fd
}

export const publicApi = (path) => raw(path)

/** Server validation errors as one readable line. */
export const errText = (e) => (Array.isArray(e?.details) && e.details.length && e.details[0]?.message ? e.details.map((d) => (d.path ? d.path + ': ' : '') + d.message).join(' · ') : e?.message ?? 'Something went wrong')
