/**
 * Test harness: an in-memory MongoDB REPLICA SET (needed for transactions), a fresh app,
 * and an SMS catcher. Never touches a real database: the URI always comes from
 * mongodb-memory-server.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { setEnv } from '../src/config/env.js'
import { createLogger, setLogger } from '../src/utils/logger.js'
import { setSmsSender } from '../src/providers/sms/index.js'

export const sms = new Map()

/** A real 1×1 PNG, so file-type sniffing accepts it. */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

export async function startTestServer(extraEnv = {}) {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  const uri = repl.getUri('vakeelbhai_test')
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vb-test-uploads-'))
  setEnv({
    UPLOAD_DIR: uploadDir,
    FILES_ENC_KEY: crypto.randomBytes(32).toString('base64'),
    NODE_ENV: 'test',
    MONGODB_URI: uri,
    JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
    OTP_SECRET: 'test-otp-secret-at-least-32-characters-long!!',
    SMS_PROVIDER: 'console',
    OTP_TEST_NUMBERS: '9999999999:123456',
    RATE_LIMIT_AUTH: '10000',
    RATE_LIMIT_API: '10000',
    ...extraEnv,
  })
  setLogger(createLogger('silent'))
  setSmsSender(async (phone, code) => sms.set(phone, code))
  await mongoose.connect(uri)
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()))
  const { createApp } = await import('../src/app.js')
  const app = createApp()
  return {
    app,
    uploadDir,
    api: () => request(app),
    async stop() {
      await mongoose.disconnect()
      await repl.stop()
      await fs.rm(uploadDir, { recursive: true, force: true })
    },
  }
}

export async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})))
  sms.clear()
}

/** Log in a client or advocate through the real OTP flow. */
export async function loginUser(t, phone, role = 'client') {
  await t.api().post('/api/auth/otp/send').send({ phone, role }).expect(200)
  const res = await t.api().post('/api/auth/otp/verify').send({ phone, role, otp: sms.get(phone) }).expect(200)
  return res.body.data
}

export async function createAdmin({ email = 'admin@test.local', password = 'correct-horse-battery', role = 'super_admin', name = 'Test Admin' } = {}) {
  const { AdminUser } = await import('../src/modules/admin/adminUser.model.js')
  return AdminUser.create({ email, name, role, passwordHash: await bcrypt.hash(password, 4) })
}

export async function loginAdmin(t, email = 'admin@test.local', password = 'correct-horse-battery') {
  const res = await t.api().post('/api/admin/auth/login').send({ email, password }).expect(200)
  return { token: res.body.data.accessToken, cookie: res.headers['set-cookie'] }
}

export const bearer = (token) => ({ Authorization: 'Bearer ' + token })
