import { z } from 'zod'

/**
 * Every setting the server reads from the environment, validated once at start-up.
 * Business values (commission, GST, auto-confirm days...) are NOT here: they live in
 * the Settings collection so the admin can change them. This file holds only
 * infrastructure and secrets.
 */

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1')

const list = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []))

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

    CORS_ORIGINS: list,

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),
    ADMIN_REFRESH_TOKEN_HOURS: z.coerce.number().int().positive().default(12),

    OTP_SECRET: z.string().min(32, 'OTP_SECRET must be at least 32 characters'),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_RESEND_SECONDS: z.coerce.number().int().positive().default(30),
    OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().positive().default(5),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    /** Store-review accounts, "9999999999:123456,9888888888:654321". They never receive an SMS. */
    OTP_TEST_NUMBERS: z.string().optional().default(''),

    SMS_PROVIDER: z.enum(['console', 'smsindiahub', 'disabled']).default('console'),

    /** Where uploaded files are stored. Private files (documents, photos) are encrypted at rest. */
    UPLOAD_DIR: z.string().default('uploads'),
    /** 32-byte key, base64. Encrypts verification documents. Losing it makes stored documents unreadable. */
    FILES_ENC_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'FILES_ENC_KEY must be 32 bytes, base64-encoded'),
    MAX_UPLOAD_MB: z.coerce.number().positive().max(20).default(5),

    /**
     * Payment gateway. disabled (default) · razorpay (needs the keys below) · sandbox (DEVELOPMENT
     * ONLY: a stand-in gateway for testing flows without Razorpay keys; refused in production).
     */
    PAYMENT_PROVIDER: z.enum(['disabled', 'razorpay', 'sandbox']).default('disabled'),
    RAZORPAY_KEY_ID: z.string().optional().default(''),
    RAZORPAY_KEY_SECRET: z.string().optional().default(''),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
    /** Minutes before an unpaid checkout expires and any wallet amount is returned. */
    PAYMENT_EXPIRY_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    /** e-Challan data provider. sandbox = DEVELOPMENT ONLY sample challans; the real provider is chosen by the client. */
    CHALLAN_PROVIDER: z.enum(['disabled', 'sandbox']).default('disabled'),

    /** Requests per IP: auth endpoints per 15 minutes, all API endpoints per minute. */
    RATE_LIMIT_AUTH: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_API: z.coerce.number().int().positive().default(300),

    ADMIN_MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
    ADMIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
    COOKIE_SECURE: bool,
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === 'production' && e.SMS_PROVIDER === 'console') {
      ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'The console SMS provider prints OTPs to the log and is not allowed in production' })
    }
    if (e.NODE_ENV === 'production' && e.PAYMENT_PROVIDER === 'sandbox') {
      ctx.addIssue({ code: 'custom', path: ['PAYMENT_PROVIDER'], message: 'The sandbox payment provider is for development only' })
    }
    if (e.NODE_ENV === 'production' && e.CHALLAN_PROVIDER === 'sandbox') {
      ctx.addIssue({ code: 'custom', path: ['CHALLAN_PROVIDER'], message: 'The sandbox e-Challan provider returns sample data and is for development only' })
    }
    if (e.PAYMENT_PROVIDER === 'razorpay' && (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET || !e.RAZORPAY_WEBHOOK_SECRET)) {
      ctx.addIssue({ code: 'custom', path: ['RAZORPAY_KEY_ID'], message: 'Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET' })
    }
    if (e.NODE_ENV === 'production' && e.CORS_ORIGINS.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'Set CORS_ORIGINS in production' })
    }
  })

function parseTestNumbers(raw) {
  const map = new Map()
  for (const pair of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [phone, code] = pair.split(':')
    if (!/^[6-9]\d{9}$/.test(phone ?? '') || !/^\d{6}$/.test(code ?? '')) throw new Error('OTP_TEST_NUMBERS: bad entry "' + pair + '"')
    map.set(phone, code)
  }
  return map
}

export function loadEnv(source = process.env) {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => '  ' + i.path.join('.') + ': ' + i.message)
    throw new Error('Invalid environment:\n' + lines.join('\n'))
  }
  return Object.freeze({ ...parsed.data, otpTestNumbers: parseTestNumbers(parsed.data.OTP_TEST_NUMBERS), isProd: parsed.data.NODE_ENV === 'production', isTest: parsed.data.NODE_ENV === 'test' })
}

let current
export const env = new Proxy(
  {},
  {
    get(_t, key) {
      if (!current) current = loadEnv()
      return current[key]
    },
  },
)

/** Tests set their own environment before the app starts. */
export function setEnv(values) {
  current = loadEnv(values)
  return current
}
