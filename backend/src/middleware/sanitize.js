import { badRequest } from '../utils/errors.js'

/** Reject request input whose keys could act as MongoDB operators or paths ("$gt", "a.b"). */
function hasBadKey(value, depth = 0) {
  if (depth > 20) return true
  if (Array.isArray(value)) return value.some((v) => hasBadKey(v, depth + 1))
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor' || k === 'prototype') return true
      if (hasBadKey(value[k], depth + 1)) return true
    }
  }
  return false
}

export function sanitizeInput(req, _res, next) {
  if (hasBadKey(req.body) || hasBadKey(req.query) || hasBadKey(req.params)) return next(badRequest('The request contains keys that are not allowed'))
  next()
}
