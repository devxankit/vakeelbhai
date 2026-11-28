import mongoose from 'mongoose'
import { AppError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No such endpoint: ' + req.method + ' ' + req.path } })
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let e = err
  if (err instanceof mongoose.Error.ValidationError) {
    e = new AppError(422, 'VALIDATION_ERROR', 'Some fields are not valid', Object.values(err.errors).map((x) => ({ path: x.path, message: x.message })))
  } else if (err instanceof mongoose.Error.CastError) {
    e = new AppError(400, 'BAD_ID', 'Invalid ' + err.path)
  } else if (err?.code === 11000) {
    e = new AppError(409, 'DUPLICATE', 'This ' + Object.keys(err.keyPattern ?? {}).join(', ') + ' is already in use')
  } else if (err?.type === 'entity.parse.failed') {
    e = new AppError(400, 'BAD_JSON', 'The request body is not valid JSON')
  } else if (err?.type === 'entity.too.large') {
    e = new AppError(413, 'TOO_LARGE', 'The request body is too large')
  }

  if (!(e instanceof AppError)) {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error')
    return res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } })
  }
  if (e.status === 429 && e.details?.retryAfterSeconds) res.set('Retry-After', String(e.details.retryAfterSeconds))
  res.status(e.status).json({ success: false, error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } })
}
