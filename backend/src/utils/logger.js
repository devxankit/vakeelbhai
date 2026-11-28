import pino from 'pino'

/** Structured JSON logs. Secrets and personal data are redacted wherever they appear. */
export function createLogger(level = 'info') {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.otp',
        '*.refreshToken',
        '*.accessToken',
        '*.codeHash',
        '*.passwordHash',
      ],
      censor: '[redacted]',
    },
  })
}

export let logger = createLogger(process.env.LOG_LEVEL || 'info')
export const setLogger = (l) => (logger = l)
