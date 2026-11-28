import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PNG, bearer, clearDb, createAdmin, loginAdmin, loginUser, startTestServer } from './helpers.js'

let t
let admin
let planId
before(async () => (t = await startTestServer({ PAYMENT_PROVIDER: 'sandbox' })))
after(async () => t.stop())
beforeEach(async () => {
  await clearDb()
  await Category.insertMany(SOW_CATEGORIES.map((c, i) => ({ ...c, order: i })))
  await createAdmin()
  admin = (await loginAdmin(t)).token
  planId = (await t.api().post('/api/admin/plans').set(bearer(admin)).send({ name: 'Yearly', durationMonths: 12 }).expect(201)).body.data.id
})

const { Category } = await import('../src/modules/categories/category.model.js')
const { SOW_CATEGORIES } = await import('../src/modules/categories/sowCategories.js')
const { Otp } = await import('../src/modules/auth/otp.model.js')
const DOCS = ['districtBar', 'stateBar', 'enrolment', 'aadhaarFront', 'aadhaarBack']

async function advocate() {
  const s = await loginUser(t, '9876500001', 'advocate')
  const tok = s.accessToken
  await t.api().patch('/api/advocate/profile').set(bearer(tok)).send({ name: 'Rohan Malhotra', email: 'r@example.com', address: '1 Court Road', state: 'Madhya Pradesh', district: 'Indore', practice: ['criminal'], experienceYears: 10, courts: 'Indore District Court', enrolmentNumber: 'MP/1287/2014' }).expect(200)
  await t.api().put('/api/advocate/photo').set(bearer(tok)).attach('file', PNG, 'p.png').expect(200)
  for (const k of DOCS) await t.api().put('/api/advocate/documents/' + k).set(bearer(tok)).attach('file', PNG, 'd.png').expect(200)
  await t.api().post('/api/advocate/verification/submit').set(bearer(tok)).expect(200)
  await t.api().post('/api/admin/advocates/' + s.user.id + '/review').set(bearer(admin)).send({ decision: 'approve' }).expect(200)
  await t.api().post('/api/admin/advocates/' + s.user.id + '/membership').set(bearer(admin)).send({ planId, reason: 'Pilot advocate' }).expect(200)
  return { tok, id: s.user.id }
}

const list = async (tok) => (await t.api().get('/api/notifications').set(bearer(tok)).expect(200)).body
// Notifications are written after the response; give them a moment.
const settle = () => new Promise((r) => setTimeout(r, 150))

describe('Notifications', () => {
  test('each step of a request notifies the right person; read marks them', async () => {
    const a = await advocate()
    await settle()
    assert.deepEqual((await list(a.tok)).data.map((n) => n.title), ['Membership active', 'You are verified'])

    const c = await loginUser(t, '9876500100', 'client')
    await t.api().patch('/api/client/profile').set(bearer(c.accessToken)).send({ name: 'Rakesh Yadav', city: 'Indore' }).expect(200)
    const r = (await t.api().post('/api/client/requests').set(bearer(c.accessToken)).send({ category: 'criminal', issue: 'My brother was arrested in a cheque bounce matter. Hearing this week.', district: 'Indore', language: 'Hindi' }).expect(201)).body.data
    await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(200)
    await t.api().post('/api/advocate/cases/' + r.id + '/accept').set(bearer(a.tok)).expect(200)
    await t.api().post('/api/advocate/cases/' + r.id + '/quote').set(bearer(a.tok)).send({ fee: 5000, scope: 'Bail application and one hearing.' }).expect(200)
    await settle()
    const mine = await list(c.accessToken)
    assert.deepEqual(mine.data.map((n) => n.title), ['Fee quote received', 'Advocate assigned'])
    assert.deepEqual(mine.data[0].link, { kind: 'request', id: r.id })
    assert.equal(mine.meta.unread, 2)
    assert.equal((await list(a.tok)).data[0].title, 'New client request')

    const res = await t.api().post('/api/notifications/read').set(bearer(c.accessToken)).send({}).expect(200)
    assert.equal(res.body.data.unread, 0)
    assert.ok((await list(c.accessToken)).data.every((n) => n.read))
  })
})

describe('Delete my account', () => {
  test('a client with no active work is erased; sessions end; the number can sign up again fresh', async () => {
    const c = await loginUser(t, '9876500100', 'client')
    await t.api().patch('/api/client/profile').set(bearer(c.accessToken)).send({ name: 'Rakesh Yadav', email: 'r@example.com', city: 'Indore' }).expect(200)
    await t.api().post('/api/client/requests').set(bearer(c.accessToken)).send({ category: 'criminal', issue: 'Need advice on a cheque bounce notice I received.', district: 'Indore', language: 'Hindi' }).expect(201)
    await t.api().delete('/api/auth/account').set(bearer(c.accessToken)).expect(200)
    await t.api().get('/api/client/profile').set(bearer(c.accessToken)).expect(401)
    await Otp.deleteMany({}) // skip the 30 s resend cooldown
    const again = await loginUser(t, '9876500100', 'client')
    assert.equal(again.isNew, true)
    assert.equal(again.user.name, '')
    assert.equal((await t.api().get('/api/client/requests').set(bearer(again.accessToken)).expect(200)).body.data.length, 0)
  })

  test('refused while a request is in progress', async () => {
    const a = await advocate()
    const c = await loginUser(t, '9876500100', 'client')
    const r = (await t.api().post('/api/client/requests').set(bearer(c.accessToken)).send({ category: 'criminal', issue: 'My brother was arrested in a cheque bounce matter. Hearing this week.', district: 'Indore', language: 'Hindi' }).expect(201)).body.data
    await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(200)
    const res = await t.api().delete('/api/auth/account').set(bearer(c.accessToken)).expect(409)
    assert.equal(res.body.error.code, 'ACTIVE_WORK')
    assert.equal((await t.api().delete('/api/auth/account').set(bearer(a.tok)).expect(409)).body.error.code, 'ACTIVE_WORK')
  })
})
