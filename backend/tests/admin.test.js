import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { bearer, clearDb, createAdmin, loginAdmin, loginUser, startTestServer } from './helpers.js'

let t
before(async () => (t = await startTestServer({ ADMIN_MAX_FAILED_LOGINS: '3', ADMIN_LOCK_MINUTES: '15' })))
after(async () => t.stop())
beforeEach(clearDb)

const { AuditLog } = await import('../src/modules/audit/auditLog.model.js')

describe('admin login', () => {
  test('login sets an httpOnly refresh cookie; refresh needs the header', async () => {
    await createAdmin()
    const res = await t.api().post('/api/admin/auth/login').send({ email: 'ADMIN@test.local', password: 'correct-horse-battery' }).expect(200)
    const cookie = res.headers['set-cookie'][0]
    assert.match(cookie, /vb_admin_rt=/)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Strict/)
    assert.match(cookie, /Path=\/api\/admin\/auth/)
    assert.equal(res.body.data.refreshToken, undefined)

    await t.api().post('/api/admin/auth/refresh').set('Cookie', cookie).expect(400)
    const r = await t.api().post('/api/admin/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest').expect(200)
    assert.ok(r.body.data.accessToken)
  })

  test('wrong password and unknown email give the same answer', async () => {
    await createAdmin()
    const a = await t.api().post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'wrong-password' }).expect(401)
    const b = await t.api().post('/api/admin/auth/login').send({ email: 'nobody@test.local', password: 'wrong-password' }).expect(401)
    assert.deepEqual(a.body, b.body)
  })

  test('locks after repeated failures, even with the right password', async () => {
    await createAdmin()
    for (let i = 0; i < 3; i++) await t.api().post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'wrong-password' }).expect(401)
    const r = await t.api().post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'correct-horse-battery' }).expect(403)
    assert.equal(r.body.error.code, 'ACCOUNT_LOCKED')
  })

  test('changing the password ends other sessions', async () => {
    await createAdmin()
    const one = await loginAdmin(t)
    const two = await loginAdmin(t)
    const r = await t.api().post('/api/admin/auth/password').set(bearer(two.token)).send({ currentPassword: 'correct-horse-battery', newPassword: 'a-much-better-password' }).expect(200)
    await t.api().get('/api/admin/auth/me').set(bearer(one.token)).expect(401)
    await t.api().get('/api/admin/auth/me').set(bearer(r.body.data.accessToken)).expect(200)
    await t.api().post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'a-much-better-password' }).expect(200)
  })
})

describe('role-based access', () => {
  test('clients and advocates cannot reach admin endpoints', async () => {
    const c = await loginUser(t, '9876543210', 'client')
    const a = await loginUser(t, '9876543211', 'advocate')
    for (const tok of [c.accessToken, a.accessToken]) {
      await t.api().get('/api/admin/dashboard').set(bearer(tok)).expect(403)
      await t.api().get('/api/admin/categories').set(bearer(tok)).expect(403)
      await t.api().patch('/api/admin/settings').set(bearer(tok)).send({ commissionPercent: 1 }).expect(403)
    }
  })

  test('an admin token does not work on user endpoints', async () => {
    await createAdmin()
    const { token } = await loginAdmin(t)
    await t.api().get('/api/auth/me').set(bearer(token)).expect(403)
  })

  test('staff cannot manage admins or change settings', async () => {
    await createAdmin({ email: 'staff@test.local', role: 'staff' })
    const { token } = await loginAdmin(t, 'staff@test.local')
    await t.api().get('/api/admin/users').set(bearer(token)).expect(403)
    await t.api().patch('/api/admin/settings').set(bearer(token)).send({ commissionPercent: 10 }).expect(403)
    await t.api().get('/api/admin/settings').set(bearer(token)).expect(200)
    await t.api().get('/api/admin/dashboard').set(bearer(token)).expect(200)
  })

  test('no token at all is 401', async () => {
    await t.api().get('/api/admin/dashboard').expect(401)
  })
})

describe('admin users', () => {
  test('super admin creates staff; disabling them ends their session; audit logged', async () => {
    await createAdmin()
    const { token } = await loginAdmin(t)
    const c = await t.api().post('/api/admin/users').set(bearer(token)).send({ name: 'Riya Staff', email: 'riya@test.local', role: 'staff', password: 'staff-password-1' }).expect(201)
    const staff = await loginAdmin(t, 'riya@test.local', 'staff-password-1')
    await t.api().patch('/api/admin/users/' + c.body.data.id).set(bearer(token)).send({ status: 'disabled' }).expect(200)
    await t.api().get('/api/admin/auth/me').set(bearer(staff.token)).expect(401)
    await t.api().post('/api/admin/auth/login').send({ email: 'riya@test.local', password: 'staff-password-1' }).expect(403)
    const actions = (await AuditLog.find().lean()).map((a) => a.action)
    assert.deepEqual(actions.sort(), ['admin_user.created', 'admin_user.updated'])
  })

  test('the last super admin cannot be demoted or disabled', async () => {
    const me = await createAdmin()
    const { token } = await loginAdmin(t)
    await t.api().patch('/api/admin/users/' + me.id).set(bearer(token)).send({ status: 'disabled' }).expect(400)
    await t.api().patch('/api/admin/users/' + me.id).set(bearer(token)).send({ role: 'staff' }).expect(400)
  })

  test('weak passwords and duplicate emails are refused', async () => {
    await createAdmin()
    const { token } = await loginAdmin(t)
    await t.api().post('/api/admin/users').set(bearer(token)).send({ name: 'X Y', email: 'x@test.local', role: 'staff', password: 'short' }).expect(422)
    await t.api().post('/api/admin/users').set(bearer(token)).send({ name: 'X Y', email: 'admin@test.local', role: 'staff', password: 'long-enough-pass' }).expect(409)
  })
})
