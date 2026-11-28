import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PNG, bearer, clearDb, createAdmin, loginAdmin, loginUser, startTestServer } from './helpers.js'

let t
let admin
before(async () => (t = await startTestServer()))
after(async () => t.stop())
beforeEach(async () => {
  await clearDb()
  await Category.insertMany(SOW_CATEGORIES.map((c, i) => ({ ...c, order: i })))
  await createAdmin()
  admin = (await loginAdmin(t)).token
})

const { Category } = await import('../src/modules/categories/category.model.js')
const { SOW_CATEGORIES } = await import('../src/modules/categories/sowCategories.js')
const { AdvocateDocument } = await import('../src/modules/advocates/advocate.models.js')
const { AuditLog } = await import('../src/modules/audit/auditLog.model.js')

const DOCS = ['districtBar', 'stateBar', 'enrolment', 'aadhaarFront', 'aadhaarBack']
const DETAILS = { name: 'Neha Sharma', email: 'neha@example.com', address: '12 MG Road, Indore', state: 'Madhya Pradesh', district: 'Indore', practice: ['civil', 'consumer'], experienceYears: 4, courts: 'Indore District Court', enrolmentNumber: 'MP/3011/2022' }

const upload = (tok, url, buf = PNG, name = 'doc.png') => t.api().put(url).set(bearer(tok)).attach('file', buf, name)

/** A complete, submitted advocate. */
async function submitted(phone = '9876500001') {
  const s = await loginUser(t, phone, 'advocate')
  await t.api().patch('/api/advocate/profile').set(bearer(s.accessToken)).send(DETAILS).expect(200)
  await upload(s.accessToken, '/api/advocate/photo').expect(200)
  for (const k of DOCS) await upload(s.accessToken, '/api/advocate/documents/' + k).expect(200)
  await t.api().post('/api/advocate/verification/submit').set(bearer(s.accessToken)).expect(200)
  return s
}

describe('advocate registration', () => {
  test('new advocate starts as a draft with everything missing', async () => {
    const s = await loginUser(t, '9876500001', 'advocate')
    const r = await t.api().get('/api/advocate/profile').set(bearer(s.accessToken)).expect(200)
    assert.equal(r.body.data.verification.status, 'draft')
    assert.ok(r.body.data.missing.includes('photo'))
    assert.ok(r.body.data.missing.includes('document:aadhaarBack'))
    assert.deepEqual(r.body.data.documents.map((d) => d.status), ['missing', 'missing', 'missing', 'missing', 'missing'])
  })

  test('cannot submit until every detail, the photo and all five documents are in', async () => {
    const s = await loginUser(t, '9876500001', 'advocate')
    await t.api().patch('/api/advocate/profile').set(bearer(s.accessToken)).send(DETAILS).expect(200)
    const r = await t.api().post('/api/advocate/verification/submit').set(bearer(s.accessToken)).expect(400)
    assert.ok(r.body.error.details.missing.includes('photo'))
  })

  test('practice areas must be real, active categories', async () => {
    const s = await loginUser(t, '9876500001', 'advocate')
    await t.api().patch('/api/advocate/profile').set(bearer(s.accessToken)).send({ practice: ['tax'] }).expect(400)
  })

  test('full submit; details and documents are then locked', async () => {
    const s = await submitted()
    const me = (await t.api().get('/api/advocate/profile').set(bearer(s.accessToken))).body.data
    assert.equal(me.verification.status, 'pending')
    assert.deepEqual(me.missing, [])
    await t.api().patch('/api/advocate/profile').set(bearer(s.accessToken)).send({ district: 'Bhopal' }).expect(409)
    await t.api().patch('/api/advocate/profile').set(bearer(s.accessToken)).send({ email: 'new@example.com' }).expect(200)
    await upload(s.accessToken, '/api/advocate/documents/enrolment').expect(409)
    await upload(s.accessToken, '/api/advocate/photo').expect(409)
    await t.api().post('/api/advocate/verification/submit').set(bearer(s.accessToken)).expect(409)
  })
})

describe('document security', () => {
  test('files are encrypted on disk and come back intact to the owner', async () => {
    const s = await loginUser(t, '9876500001', 'advocate')
    await upload(s.accessToken, '/api/advocate/documents/aadhaarFront').expect(200)
    const doc = await AdvocateDocument.findOne({ key: 'aadhaarFront' }).lean()
    const onDisk = await fs.readFile(path.join(t.uploadDir, 'private', doc.file.path))
    assert.equal(onDisk.includes(PNG.subarray(0, 8)), false, 'the PNG signature must not be readable on disk')
    const back = await t.api().get('/api/advocate/documents/aadhaarFront/file').set(bearer(s.accessToken)).buffer(true).parse((res, cb) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c)).on('end', () => cb(null, Buffer.concat(chunks)))
    }).expect(200)
    assert.equal(back.headers['content-type'], 'image/png')
    assert.match(back.headers['cache-control'], /no-store/)
    assert.ok(Buffer.compare(back.body, PNG) === 0)
  })

  test('non-images are refused even when named .png; oversize refused', async () => {
    const s = await loginUser(t, '9876500001', 'advocate')
    await upload(s.accessToken, '/api/advocate/documents/enrolment', Buffer.from('<html><script>alert(1)</script></html>'), 'evil.png').expect(415)
    await upload(s.accessToken, '/api/advocate/documents/enrolment', Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]), 'big.png').expect(413)
    await upload(s.accessToken, '/api/advocate/documents/passport').expect(422)
  })

  test('nobody else can read an advocate\'s documents: not clients, not other advocates', async () => {
    const owner = await submitted()
    const other = await loginUser(t, '9876500002', 'advocate')
    const client = await loginUser(t, '9876500003', 'client')
    // "Own document" endpoints only ever look up the caller's own files.
    await t.api().get('/api/advocate/documents/aadhaarFront/file').set(bearer(other.accessToken)).expect(404)
    await t.api().get('/api/advocate/documents/aadhaarFront/file').set(bearer(client.accessToken)).expect(403)
    await t.api().get('/api/admin/advocates/' + owner.user.id + '/documents/aadhaarFront/file').set(bearer(client.accessToken)).expect(403)
    await t.api().get('/api/admin/advocates/' + owner.user.id + '/documents/aadhaarFront/file').set(bearer(admin)).expect(200)
    await t.api().get('/api/admin/advocates/' + owner.user.id + '/photo').set(bearer(admin)).expect(200)
  })

  test('replacing a document deletes the old file', async () => {
    const s = await loginUser(t, '9876500001', 'advocate')
    await upload(s.accessToken, '/api/advocate/documents/stateBar').expect(200)
    const first = (await AdvocateDocument.findOne({ key: 'stateBar' }).lean()).file.path
    await upload(s.accessToken, '/api/advocate/documents/stateBar').expect(200)
    const second = await AdvocateDocument.findOne({ key: 'stateBar' }).lean()
    assert.notEqual(second.file.path, first)
    assert.equal(second.version, 2)
    await assert.rejects(fs.access(path.join(t.uploadDir, 'private', first)))
  })
})

describe('admin verification', () => {
  test('queue lists pending first; detail shows documents and history', async () => {
    await loginUser(t, '9876500009', 'advocate') // a draft
    const s = await submitted()
    const list = (await t.api().get('/api/admin/advocates').set(bearer(admin)).expect(200)).body
    assert.equal(list.data[0].id, s.user.id)
    assert.equal(list.data[0].verification, 'pending')
    assert.equal(list.meta.total, 2)
    const pendingOnly = (await t.api().get('/api/admin/advocates?status=pending').set(bearer(admin))).body
    assert.equal(pendingOnly.meta.total, 1)
    const d = (await t.api().get('/api/admin/advocates/' + s.user.id).set(bearer(admin)).expect(200)).body.data
    assert.equal(d.profile.enrolmentNumber, 'MP/3011/2022')
    assert.equal(d.documents.length, 5)
    assert.equal(d.history[0].action, 'submitted')
  })

  test('approve: verified, documents approved, audit + history written', async () => {
    const s = await submitted()
    await t.api().post('/api/admin/advocates/' + s.user.id + '/review').set(bearer(admin)).send({ decision: 'approve' }).expect(200)
    const me = (await t.api().get('/api/advocate/profile').set(bearer(s.accessToken))).body.data
    assert.equal(me.verification.status, 'approved')
    assert.ok(me.documents.every((d) => d.status === 'approved'))
    assert.equal(await AuditLog.countDocuments({ action: 'advocate.approved' }), 1)
    // Already reviewed: a second decision is refused.
    await t.api().post('/api/admin/advocates/' + s.user.id + '/review').set(bearer(admin)).send({ decision: 'reject', reason: 'x' }).expect(409)
  })

  test('two admins reviewing at the same moment: exactly one wins', async () => {
    const s = await submitted()
    const rs = await Promise.all([
      t.api().post('/api/admin/advocates/' + s.user.id + '/review').set(bearer(admin)).send({ decision: 'approve' }),
      t.api().post('/api/admin/advocates/' + s.user.id + '/review').set(bearer(admin)).send({ decision: 'reject', reason: 'Fake certificate' }),
    ])
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409])
  })

  test('retake: only the named documents can be replaced; the last one sends it back to the queue', async () => {
    const s = await submitted()
    await t.api().post('/api/admin/advocates/' + s.user.id + '/review').set(bearer(admin)).send({ decision: 'reupload', docs: { aadhaarBack: 'The address is blurred', enrolment: 'Cut off at the edge' } }).expect(200)
    let me = (await t.api().get('/api/advocate/profile').set(bearer(s.accessToken))).body.data
    assert.equal(me.verification.status, 'reupload')
    assert.equal(me.documents.find((d) => d.key === 'aadhaarBack').note, 'The address is blurred')
    assert.equal(me.documents.find((d) => d.key === 'districtBar').status, 'approved')

    await upload(s.accessToken, '/api/advocate/documents/districtBar').expect(409)
    await upload(s.accessToken, '/api/advocate/documents/aadhaarBack').expect(200)
    me = (await t.api().get('/api/advocate/profile').set(bearer(s.accessToken))).body.data
    assert.equal(me.verification.status, 'reupload')
    await upload(s.accessToken, '/api/advocate/documents/enrolment').expect(200)
    me = (await t.api().get('/api/advocate/profile').set(bearer(s.accessToken))).body.data
    assert.equal(me.verification.status, 'pending')
    const hist = (await t.api().get('/api/admin/advocates/' + s.user.id).set(bearer(admin))).body.data.history.map((h) => h.action)
    assert.deepEqual(hist, ['resubmitted', 'document_replaced', 'document_replaced', 'reupload_requested', 'submitted'])
  })

  test('review input rules', async () => {
    const s = await submitted()
    const url = '/api/admin/advocates/' + s.user.id + '/review'
    await t.api().post(url).set(bearer(admin)).send({ decision: 'reupload' }).expect(400)
    await t.api().post(url).set(bearer(admin)).send({ decision: 'reject' }).expect(400)
    await t.api().post(url).set(bearer(admin)).send({ decision: 'approve', docs: { enrolment: 'blurred photo' } }).expect(400)
    await t.api().post(url).set(bearer(admin)).send({ decision: 'reupload', docs: { passport: 'blurred photo' } }).expect(422)
    const draft = await loginUser(t, '9876500002', 'advocate')
    await t.api().post('/api/admin/advocates/' + draft.user.id + '/review').set(bearer(admin)).send({ decision: 'approve' }).expect(409)
  })

  test('reject keeps the reason for the advocate to read', async () => {
    const s = await submitted()
    await t.api().post('/api/admin/advocates/' + s.user.id + '/review').set(bearer(admin)).send({ decision: 'reject', reason: 'Enrolment number does not match the State Bar register' }).expect(200)
    const me = (await t.api().get('/api/advocate/profile').set(bearer(s.accessToken))).body.data
    assert.equal(me.verification.status, 'rejected')
    assert.equal(me.verification.reason, 'Enrolment number does not match the State Bar register')
  })
})

describe('clients and blocking', () => {
  test('client profile: OTP first, details later', async () => {
    const s = await loginUser(t, '9876500005', 'client')
    let p = (await t.api().get('/api/client/profile').set(bearer(s.accessToken)).expect(200)).body.data
    assert.equal(p.complete, false)
    p = (await t.api().patch('/api/client/profile').set(bearer(s.accessToken)).send({ name: 'Kavita Joshi', city: 'Indore', state: 'Madhya Pradesh' }).expect(200)).body.data
    assert.equal(p.complete, true)
    assert.equal(p.city, 'Indore')
    await t.api().get('/api/advocate/profile').set(bearer(s.accessToken)).expect(403)
  })

  test('admin lists clients with search, blocks one with a reason; their session ends', async () => {
    const s = await loginUser(t, '9876500005', 'client')
    await t.api().patch('/api/client/profile').set(bearer(s.accessToken)).send({ name: 'Kavita Joshi', city: 'Indore' }).expect(200)
    await loginUser(t, '9876500006', 'client')
    const found = (await t.api().get('/api/admin/clients?q=kavita').set(bearer(admin)).expect(200)).body
    assert.equal(found.meta.total, 1)
    await t.api().patch('/api/admin/clients/' + s.user.id + '/status').set(bearer(admin)).send({ status: 'blocked' }).expect(400)
    await t.api().patch('/api/admin/clients/' + s.user.id + '/status').set(bearer(admin)).send({ status: 'blocked', reason: 'Abusive messages' }).expect(200)
    await t.api().get('/api/client/profile').set(bearer(s.accessToken)).expect(401)
    // A client id is not an advocate id.
    await t.api().patch('/api/admin/advocates/' + s.user.id + '/status').set(bearer(admin)).send({ status: 'active' }).expect(404)
    await t.api().patch('/api/admin/clients/' + s.user.id + '/status').set(bearer(admin)).send({ status: 'active' }).expect(200)
    assert.equal(await AuditLog.countDocuments({ action: { $in: ['client.blocked', 'client.unblocked'] } }), 2)
  })
})

describe('membership plans', () => {
  test('no built-in plans; super admin creates one without a price, shown as null in /meta', async () => {
    assert.deepEqual((await t.api().get('/api/meta')).body.data.plans, [])
    const p = await t.api().post('/api/admin/plans').set(bearer(admin)).send({ name: 'Yearly', durationMonths: 12, note: '12 months', highlight: true }).expect(201)
    assert.equal(p.body.data.price, null)
    const meta = (await t.api().get('/api/meta')).body.data.plans
    assert.deepEqual(meta[0], { id: p.body.data.id, name: 'Yearly', note: '12 months', months: 12, price: null, best: true, benefits: [] })
    await t.api().patch('/api/admin/plans/' + p.body.data.id).set(bearer(admin)).send({ price: 2999 }).expect(200)
    assert.equal((await t.api().get('/api/meta')).body.data.plans[0].price, 2999)
  })

  test('staff can view plans but not change prices', async () => {
    await createAdmin({ email: 'staff@test.local', role: 'staff' })
    const staff = (await loginAdmin(t, 'staff@test.local')).token
    await t.api().get('/api/admin/plans').set(bearer(staff)).expect(200)
    await t.api().post('/api/admin/plans').set(bearer(staff)).send({ name: 'Monthly', durationMonths: 1 }).expect(403)
  })
})

describe('website login mode', () => {
  test('X-Client: web keeps the refresh token in an httpOnly cookie, never in the body', async () => {
    await t.api().post('/api/auth/otp/send').send({ phone: '9999999999', role: 'advocate' }).expect(200)
    const v = await t.api().post('/api/auth/otp/verify').set('X-Client', 'web').send({ phone: '9999999999', role: 'advocate', otp: '123456' }).expect(200)
    assert.equal(v.body.data.refreshToken, undefined)
    const cookie = v.headers['set-cookie'][0]
    assert.match(cookie, /vb_rt=.*HttpOnly/)
    assert.match(cookie, /Path=\/api\/auth/)
    await t.api().post('/api/auth/refresh').set('X-Client', 'web').set('Cookie', cookie).send({}).expect(400)
    const r = await t.api().post('/api/auth/refresh').set('X-Client', 'web').set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookie).send({}).expect(200)
    assert.equal(r.body.data.user.role, 'advocate')
    assert.equal(r.body.data.refreshToken, undefined)
  })
})
