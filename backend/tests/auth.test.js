import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { bearer, clearDb, loginUser, sms, startTestServer } from './helpers.js'

let t
before(async () => (t = await startTestServer({ OTP_RESEND_SECONDS: '30', OTP_MAX_SENDS_PER_HOUR: '3', OTP_MAX_ATTEMPTS: '3' })))
after(async () => t.stop())
beforeEach(clearDb)

const { Otp } = await import('../src/modules/auth/otp.model.js')
const { User } = await import('../src/modules/users/user.model.js')

// Lets a test skip the resend cooldown without waiting.
const expireCooldown = (phone, role = 'client') => Otp.updateOne({ phone, role }, { $set: { lastSentAt: new Date(Date.now() - 60_000) } })

describe('OTP login', () => {
  test('new number: send, verify, account created, tokens returned', async () => {
    const send = await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(200)
    assert.equal(send.body.data.expiresInSeconds, 300)
    assert.match(sms.get('9876543210'), /^\d{6}$/)

    const v = await t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'client', otp: sms.get('9876543210') }).expect(200)
    assert.equal(v.body.data.isNew, true)
    assert.equal(v.body.data.user.role, 'client')
    assert.ok(v.body.data.accessToken && v.body.data.refreshToken)

    const me = await t.api().get('/api/auth/me').set(bearer(v.body.data.accessToken)).expect(200)
    assert.equal(me.body.data.phone, '9876543210')
  })

  test('OTP is stored only as a hash', async () => {
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(200)
    const doc = await Otp.findOne({ phone: '9876543210' }).lean()
    assert.notEqual(doc.codeHash, sms.get('9876543210'))
    assert.equal(doc.codeHash.length, 64)
  })

  test('second login with the same number is not a new account', async () => {
    await loginUser(t, '9876543210')
    await expireCooldown('9876543210')
    const again = await loginUser(t, '9876543210')
    assert.equal(again.isNew, false)
    assert.equal(await User.countDocuments({ phone: '9876543210' }), 1)
  })

  test('the same number as client and advocate gives two separate accounts', async () => {
    const c = await loginUser(t, '9876543210', 'client')
    const a = await loginUser(t, '9876543210', 'advocate')
    assert.notEqual(c.user.id, a.user.id)
  })

  test('a code works only once', async () => {
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(200)
    const code = sms.get('9876543210')
    await t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'client', otp: code }).expect(200)
    await t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'client', otp: code }).expect(400)
  })

  test('a code for the client role does not log in the advocate role', async () => {
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(200)
    await t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'advocate', otp: sms.get('9876543210') }).expect(400)
  })

  test('wrong codes: attempts counted, then the code is dead even if correct', async () => {
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(200)
    const good = sms.get('9876543210')
    const bad = good === '000000' ? '111111' : '000000'
    const r1 = await t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'client', otp: bad }).expect(400)
    assert.equal(r1.body.error.details.attemptsLeft, 2)
    await t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'client', otp: bad }).expect(400)
    await t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'client', otp: bad }).expect(400)
    const r4 = await t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'client', otp: good }).expect(400)
    assert.equal(r4.body.error.details.reason, 'OTP_EXPIRED')
  })

  test('parallel wrong guesses cannot exceed the attempt limit', async () => {
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(200)
    const good = sms.get('9876543210')
    const bad = good === '000000' ? '111111' : '000000'
    await Promise.all(Array.from({ length: 10 }, () => t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'client', otp: bad })))
    const doc = await Otp.findOne({ phone: '9876543210' }).lean()
    assert.ok(doc.attempts <= 3, 'attempts ' + doc.attempts)
    await t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'client', otp: good }).expect(400)
  })

  test('expired code is refused', async () => {
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(200)
    await Otp.updateOne({ phone: '9876543210' }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    await t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'client', otp: sms.get('9876543210') }).expect(400)
  })

  test('resend cooldown and hourly limit', async () => {
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(200)
    const r = await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(429)
    assert.ok(Number(r.headers['retry-after']) > 0)
    await expireCooldown('9876543210')
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(200)
    await expireCooldown('9876543210')
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(200)
    await expireCooldown('9876543210')
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(429)
  })

  test('store-review test number uses its fixed code and sends no SMS', async () => {
    await t.api().post('/api/auth/otp/send').send({ phone: '9999999999', role: 'advocate' }).expect(200)
    assert.equal(sms.has('9999999999'), false)
    await t.api().post('/api/auth/otp/verify').send({ phone: '9999999999', role: 'advocate', otp: '123456' }).expect(200)
  })

  test('input validation', async () => {
    await t.api().post('/api/auth/otp/send').send({ phone: '12345', role: 'client' }).expect(422)
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'admin' }).expect(422)
    await t.api().post('/api/auth/otp/send').send({ phone: { $gt: '' }, role: 'client' }).expect(400)
  })
})

describe('sessions', () => {
  test('refresh rotates; the old refresh token then kills the session', async () => {
    const s = await loginUser(t, '9876543210')
    const r1 = await t.api().post('/api/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200)
    assert.notEqual(r1.body.data.refreshToken, s.refreshToken)
    // Re-using the first token looks like theft: the whole session is revoked.
    await t.api().post('/api/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401)
    await t.api().post('/api/auth/refresh').send({ refreshToken: r1.body.data.refreshToken }).expect(401)
    await t.api().get('/api/auth/me').set(bearer(r1.body.data.accessToken)).expect(401)
  })

  test('logout ends this device only', async () => {
    const phoneA = await loginUser(t, '9876543210')
    await expireCooldown('9876543210')
    const phoneB = await loginUser(t, '9876543210')
    await t.api().post('/api/auth/logout').set(bearer(phoneA.accessToken)).expect(200)
    await t.api().get('/api/auth/me').set(bearer(phoneA.accessToken)).expect(401)
    await t.api().post('/api/auth/refresh').send({ refreshToken: phoneA.refreshToken }).expect(401)
    await t.api().get('/api/auth/me').set(bearer(phoneB.accessToken)).expect(200)
  })

  test('a blocked user is locked out at once and cannot log in again', async () => {
    const s = await loginUser(t, '9876543210')
    await User.updateOne({ phone: '9876543210' }, { $set: { status: 'blocked' } })
    const r = await t.api().get('/api/auth/me').set(bearer(s.accessToken)).expect(403)
    assert.equal(r.body.error.code, 'ACCOUNT_BLOCKED')
    await t.api().post('/api/auth/refresh').send({ refreshToken: s.refreshToken }).expect(403)
    await expireCooldown('9876543210')
    await t.api().post('/api/auth/otp/send').send({ phone: '9876543210', role: 'client' }).expect(200)
    await t.api().post('/api/auth/otp/verify').send({ phone: '9876543210', role: 'client', otp: sms.get('9876543210') }).expect(403)
  })

  test('garbage and tampered tokens are refused', async () => {
    const s = await loginUser(t, '9876543210')
    await t.api().get('/api/auth/me').set(bearer('not-a-jwt')).expect(401)
    const parts = s.accessToken.split('.')
    await t.api().get('/api/auth/me').set(bearer(parts[0] + '.' + parts[1] + '.AAAA')).expect(401)
    await t.api().get('/api/auth/me').expect(401)
    await t.api().post('/api/auth/refresh').send({ refreshToken: 'abc.def.ghi.jkl' }).expect(401)
  })
})
