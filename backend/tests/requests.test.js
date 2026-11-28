import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { io as ioClient } from 'socket.io-client'
import { PNG, bearer, clearDb, createAdmin, loginAdmin, loginUser, startTestServer } from './helpers.js'

let t
let admin
let planId
before(async () => (t = await startTestServer()))
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
const { AuditLog } = await import('../src/modules/audit/auditLog.model.js')
const { Membership } = await import('../src/modules/membership/membership.model.js')

const DOCS = ['districtBar', 'stateBar', 'enrolment', 'aadhaarFront', 'aadhaarBack']

/** A verified advocate; with `member` also an active membership granted by the admin. */
async function advocate(phone, { name = 'Rohan Malhotra', practice = ['criminal', 'civil'], district = 'Indore', member = true } = {}) {
  const s = await loginUser(t, phone, 'advocate')
  const tok = s.accessToken
  await t.api().patch('/api/advocate/profile').set(bearer(tok)).send({ name, email: phone + '@example.com', address: '1 Court Road', state: 'Madhya Pradesh', district, practice, experienceYears: 10, courts: district + ' District Court', enrolmentNumber: 'MP/' + phone.slice(-4) + '/2014' }).expect(200)
  await t.api().put('/api/advocate/photo').set(bearer(tok)).attach('file', PNG, 'p.png').expect(200)
  for (const k of DOCS) await t.api().put('/api/advocate/documents/' + k).set(bearer(tok)).attach('file', PNG, 'd.png').expect(200)
  await t.api().post('/api/advocate/verification/submit').set(bearer(tok)).expect(200)
  await t.api().post('/api/admin/advocates/' + s.user.id + '/review').set(bearer(admin)).send({ decision: 'approve' }).expect(200)
  if (member) await t.api().post('/api/admin/advocates/' + s.user.id + '/membership').set(bearer(admin)).send({ planId, reason: 'Pilot advocate before payments go live' }).expect(200)
  return { tok, id: s.user.id }
}

async function client(phone = '9876500100', name = 'Rakesh Yadav') {
  const s = await loginUser(t, phone, 'client')
  await t.api().patch('/api/client/profile').set(bearer(s.accessToken)).send({ name, city: 'Indore' }).expect(200)
  return { tok: s.accessToken, id: s.user.id }
}

const newRequest = (tok, body = {}) =>
  t.api().post('/api/client/requests').set(bearer(tok)).send({ category: 'criminal', issue: 'My brother was arrested in a cheque bounce matter. Hearing is this week.', district: 'Indore', language: 'Hindi', ...body })

describe('membership grant', () => {
  test('super admin grants; extends from the current end; card shows on the advocate', async () => {
    const a = await advocate('9876500001')
    const me = (await t.api().get('/api/advocate/profile').set(bearer(a.tok))).body.data
    assert.equal(me.membership.active, true)
    assert.match(me.membership.memberId, /^VB-AD-\d{5}$/)
    const firstEnd = new Date(me.membership.endAt)
    await t.api().post('/api/admin/advocates/' + a.id + '/membership').set(bearer(admin)).send({ planId, reason: 'Extension for pilot' }).expect(200)
    const again = (await t.api().get('/api/advocate/profile').set(bearer(a.tok))).body.data.membership
    assert.equal(again.memberId, me.membership.memberId, 'member ID never changes')
    assert.ok(new Date(again.endAt) > firstEnd)
    assert.equal(await AuditLog.countDocuments({ action: 'membership.granted' }), 2)
  })

  test('not for unverified advocates; reason required; staff cannot grant', async () => {
    const draft = await loginUser(t, '9876500002', 'advocate')
    await t.api().post('/api/admin/advocates/' + draft.user.id + '/membership').set(bearer(admin)).send({ planId, reason: 'Pilot advocate' }).expect(400)
    const a = await advocate('9876500003', { member: false })
    await t.api().post('/api/admin/advocates/' + a.id + '/membership').set(bearer(admin)).send({ planId }).expect(422)
    await createAdmin({ email: 'staff@test.local', role: 'staff' })
    const staff = (await loginAdmin(t, 'staff@test.local')).token
    await t.api().post('/api/admin/advocates/' + a.id + '/membership').set(bearer(staff)).send({ planId, reason: 'Pilot advocate' }).expect(403)
  })
})

describe('request lifecycle', () => {
  test('submit → assign → accept → chat → quote; each side sees only what it should', async () => {
    const c = await client()
    const a = await advocate('9876500001')

    const created = (await newRequest(c.tok).expect(201)).body.data
    assert.match(created.id, /^VB-\d+$/)
    assert.equal(created.status, 'submitted')
    assert.equal(created.advocate, null)

    // Admin queue + eligible list
    const queue = (await t.api().get('/api/admin/requests').set(bearer(admin)).expect(200)).body.data
    assert.equal(queue[0].id, created.id)
    const eligible = (await t.api().get('/api/admin/requests/' + created.id + '/eligible').set(bearer(admin)).expect(200)).body.data
    assert.deepEqual(eligible.map((e) => e.id), [a.id])
    assert.equal(eligible[0].sameDistrict, true)

    await t.api().post('/api/admin/requests/' + created.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(200)

    // Client still sees "finding an advocate" and no advocate until acceptance.
    let mine = (await t.api().get('/api/client/requests/' + created.id).set(bearer(c.tok))).body.data
    assert.equal(mine.status, 'submitted')
    assert.equal(mine.advocate, null)
    await t.api().post('/api/requests/' + created.id + '/messages').set(bearer(c.tok)).send({ text: 'Hello?' }).expect(409)

    // Advocate sees a new case: first name + initial, no phone.
    const newCases = (await t.api().get('/api/advocate/cases?tab=new').set(bearer(a.tok)).expect(200)).body.data
    assert.equal(newCases[0].status, 'new')
    assert.equal(newCases[0].clientName, 'Rakesh Y.')
    assert.equal(JSON.stringify(newCases[0]).includes('9876500100'), false)
    await t.api().get('/api/requests/' + created.id + '/messages').set(bearer(a.tok)).expect(403)

    await t.api().post('/api/advocate/cases/' + created.id + '/accept').set(bearer(a.tok)).expect(200)
    mine = (await t.api().get('/api/client/requests/' + created.id).set(bearer(c.tok))).body.data
    assert.equal(mine.status, 'assigned')
    assert.equal(mine.advocate.name, 'Adv. Rohan Malhotra')
    assert.equal(mine.advocate.verified, true)
    assert.equal(JSON.stringify(mine.advocate).includes('98765'), false, 'no advocate phone for the client')
    await t.api().get('/api/client/requests/' + created.id + '/advocate/photo').set(bearer(c.tok)).expect(200)

    await t.api().post('/api/requests/' + created.id + '/messages').set(bearer(c.tok)).send({ text: 'Namaste, I have the FIR copy.' }).expect(201)
    await t.api().post('/api/requests/' + created.id + '/messages').set(bearer(a.tok)).send({ text: 'Please share it here.' }).expect(201)
    await t.api().post('/api/requests/' + created.id + '/messages/image').set(bearer(c.tok)).attach('file', PNG, 'fir.png').expect(201)

    await t.api().post('/api/advocate/cases/' + created.id + '/quote').set(bearer(a.tok)).send({ fee: 8000, scope: 'Bail application and one hearing.' }).expect(200)
    mine = (await t.api().get('/api/client/requests/' + created.id).set(bearer(c.tok))).body.data
    assert.equal(mine.status, 'quoted')
    assert.equal(mine.quote.fee, 8000)

    const msgs = (await t.api().get('/api/requests/' + created.id + '/messages').set(bearer(c.tok)).expect(200)).body.data
    assert.deepEqual(msgs.map((m) => m.from + ':' + m.kind), ['system:text', 'system:text', 'client:text', 'advocate:text', 'client:image', 'advocate:quote'])
    const img = msgs.find((m) => m.kind === 'image')
    await t.api().get('/api/requests/' + created.id + '/messages/' + img.id + '/file').set(bearer(a.tok)).expect(200)
    // Incremental fetch
    const after = (await t.api().get('/api/requests/' + created.id + '/messages?after=' + encodeURIComponent(msgs[3].at)).set(bearer(c.tok))).body.data
    assert.ok(after.length >= 2)
  })

  test('decline returns it to the queue with the reason; the same advocate cannot be assigned again', async () => {
    const c = await client()
    const a = await advocate('9876500001')
    const b = await advocate('9876500002', { name: 'Priya Nair', practice: ['criminal'], district: 'Bhopal' })
    const r = (await newRequest(c.tok).expect(201)).body.data
    await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(200)
    await t.api().post('/api/advocate/cases/' + r.id + '/decline').set(bearer(a.tok)).send({ reason: 'Conflict of interest' }).expect(200)

    const detail = (await t.api().get('/api/admin/requests/' + r.id).set(bearer(admin))).body.data
    assert.equal(detail.status, 'submitted')
    assert.equal(detail.assignments[0].response, 'declined')
    assert.equal(detail.assignments[0].reason, 'Conflict of interest')

    const declined = (await t.api().get('/api/advocate/cases/' + r.id).set(bearer(a.tok)).expect(200)).body.data
    assert.equal(declined.status, 'declined')
    await t.api().post('/api/advocate/cases/' + r.id + '/accept').set(bearer(a.tok)).expect(409)

    const eligible = (await t.api().get('/api/admin/requests/' + r.id + '/eligible').set(bearer(admin))).body.data
    assert.deepEqual(eligible.map((e) => e.id), [b.id])
    await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(400)
    await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: b.id }).expect(200)
  })

  test('reassign before acceptance withdraws the first advocate; after acceptance it is locked', async () => {
    const c = await client()
    const a = await advocate('9876500001')
    const b = await advocate('9876500002', { name: 'Priya Nair' })
    const r = (await newRequest(c.tok).expect(201)).body.data
    await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(200)
    await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: b.id }).expect(200)
    await t.api().get('/api/advocate/cases/' + r.id).set(bearer(a.tok)).expect(404)
    await t.api().post('/api/advocate/cases/' + r.id + '/accept').set(bearer(a.tok)).expect(409)
    await t.api().post('/api/advocate/cases/' + r.id + '/accept').set(bearer(b.tok)).expect(200)
    await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(409)
    assert.equal(await AuditLog.countDocuments({ action: { $in: ['request.assigned', 'request.reassigned'] } }), 2)
  })

  test('two admins assigning the same request at the same moment: one wins', async () => {
    const c = await client()
    const a = await advocate('9876500001')
    const b = await advocate('9876500002', { name: 'Priya Nair' })
    const r = (await newRequest(c.tok).expect(201)).body.data
    const rs = await Promise.all([
      t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }),
      t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: b.id }),
    ])
    assert.equal(rs.filter((x) => x.status === 200).length, 1)
    const d = (await t.api().get('/api/admin/requests/' + r.id).set(bearer(admin))).body.data
    assert.equal(d.assignments.filter((x) => x.response === 'pending').length, 1)
  })
})

describe('assignment and access rules', () => {
  test('only eligible advocates: practice area, active membership, not blocked', async () => {
    const c = await client()
    const civilOnly = await advocate('9876500001', { practice: ['civil'] })
    const noMember = await advocate('9876500002', { member: false })
    const blocked = await advocate('9876500003')
    await t.api().patch('/api/admin/advocates/' + blocked.id + '/status').set(bearer(admin)).send({ status: 'blocked', reason: 'Complaint under review' }).expect(200)
    const r = (await newRequest(c.tok).expect(201)).body.data
    assert.deepEqual((await t.api().get('/api/admin/requests/' + r.id + '/eligible').set(bearer(admin))).body.data, [])
    for (const x of [civilOnly, noMember, blocked]) await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: x.id }).expect(400)
  })

  test('an expired membership cannot accept', async () => {
    const c = await client()
    const a = await advocate('9876500001')
    const r = (await newRequest(c.tok).expect(201)).body.data
    await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(200)
    await Membership.updateMany({}, { $set: { endAt: new Date(Date.now() - 1000) } })
    const res = await t.api().post('/api/advocate/cases/' + r.id + '/accept').set(bearer(a.tok)).expect(403)
    assert.equal(res.body.error.code, 'NO_MEMBERSHIP')
  })

  test('other clients and other advocates see nothing', async () => {
    const c = await client()
    const other = await client('9876500101', 'Kavita Joshi')
    const a = await advocate('9876500001')
    const stranger = await advocate('9876500002', { name: 'Priya Nair' })
    const r = (await newRequest(c.tok).expect(201)).body.data
    await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(200)
    await t.api().post('/api/advocate/cases/' + r.id + '/accept').set(bearer(a.tok)).expect(200)
    await t.api().get('/api/client/requests/' + r.id).set(bearer(other.tok)).expect(404)
    await t.api().get('/api/requests/' + r.id + '/messages').set(bearer(other.tok)).expect(404)
    await t.api().get('/api/advocate/cases/' + r.id).set(bearer(stranger.tok)).expect(404)
    await t.api().post('/api/requests/' + r.id + '/messages').set(bearer(stranger.tok)).send({ text: 'hi' }).expect(404)
    await t.api().post('/api/advocate/cases/' + r.id + '/quote').set(bearer(stranger.tok)).send({ fee: 500, scope: 'Something cheaper for you' }).expect(409)
    assert.deepEqual((await t.api().get('/api/client/requests').set(bearer(other.tok))).body.data, [])
  })

  test('unverified advocates cannot use cases; clients cannot use advocate routes', async () => {
    const draft = await loginUser(t, '9876500005', 'advocate')
    const r = await t.api().get('/api/advocate/cases').set(bearer(draft.accessToken)).expect(403)
    assert.equal(r.body.error.code, 'NOT_VERIFIED')
    const c = await client()
    await t.api().get('/api/advocate/cases').set(bearer(c.tok)).expect(403)
  })

  test('validation: category must exist, issue at least a sentence, quote bounds', async () => {
    const c = await client()
    await newRequest(c.tok, { category: 'tax' }).expect(400)
    await newRequest(c.tok, { issue: 'help' }).expect(422)
    const a = await advocate('9876500001')
    const r = (await newRequest(c.tok).expect(201)).body.data
    await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(200)
    await t.api().post('/api/advocate/cases/' + r.id + '/quote').set(bearer(a.tok)).send({ fee: 8000, scope: 'Before accepting is not allowed' }).expect(409)
    await t.api().post('/api/advocate/cases/' + r.id + '/accept').set(bearer(a.tok)).expect(200)
    await t.api().post('/api/advocate/cases/' + r.id + '/quote').set(bearer(a.tok)).send({ fee: 50, scope: 'Too small a fee here' }).expect(422)
    await t.api().post('/api/advocate/cases/' + r.id + '/quote').set(bearer(a.tok)).send({ fee: 999.5, scope: 'Paise are not allowed' }).expect(422)
  })

  test('request numbers are sequential and unique under load', async () => {
    const c = await client()
    const rs = await Promise.all(Array.from({ length: 8 }, () => newRequest(c.tok)))
    const ids = rs.map((x) => x.body.data.id)
    assert.equal(new Set(ids).size, 8)
    assert.deepEqual(ids.map((i) => Number(i.slice(3))).sort((x, y) => x - y), [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008])
  })

  test('attachments: up to five, private to the client, the advocate and admins', async () => {
    const c = await client()
    const r = (await newRequest(c.tok).expect(201)).body.data
    for (let i = 0; i < 5; i++) await t.api().post('/api/client/requests/' + r.id + '/attachments').set(bearer(c.tok)).attach('file', PNG, 'd.png').expect(201)
    await t.api().post('/api/client/requests/' + r.id + '/attachments').set(bearer(c.tok)).attach('file', PNG, 'd.png').expect(409)
    const d = (await t.api().get('/api/client/requests/' + r.id).set(bearer(c.tok))).body.data
    assert.equal(d.docs.length, 5)
    await t.api().get('/api/admin/requests/' + r.id + '/attachments/' + d.docs[0].id).set(bearer(admin)).expect(200)
    const other = await client('9876500101')
    await t.api().get('/api/client/requests/' + r.id + '/attachments/' + d.docs[0].id).set(bearer(other.tok)).expect(404)
  })
})

describe('live updates (Socket.IO)', () => {
  test('the advocate gets case:new, the client gets messages; bad tokens are refused', async () => {
    const { initRealtime, stopRealtime } = await import('../src/realtime/io.js')
    const server = http.createServer(t.app)
    initRealtime(server)
    await new Promise((r) => server.listen(0, r))
    const url = 'http://127.0.0.1:' + server.address().port
    const connect = (token) =>
      new Promise((resolve, reject) => {
        const s = ioClient(url, { path: '/socket.io', auth: { token }, transports: ['websocket'], reconnection: false })
        s.on('connect', () => resolve(s))
        s.on('connect_error', (e) => (s.close(), reject(e)))
      })
    const waitFor = (s, ev) => new Promise((resolve) => s.once(ev, resolve))
    try {
      await assert.rejects(connect('nope'))
      const c = await client()
      const a = await advocate('9876500001')
      const cs = await connect(c.tok)
      const as = await connect(a.tok)
      const r = (await newRequest(c.tok).expect(201)).body.data

      const gotCase = waitFor(as, 'case:new')
      await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(200)
      assert.equal((await gotCase).number, r.id)

      await t.api().post('/api/advocate/cases/' + r.id + '/accept').set(bearer(a.tok)).expect(200)
      const gotMsg = waitFor(cs, 'message')
      await t.api().post('/api/requests/' + r.id + '/messages').set(bearer(a.tok)).send({ text: 'Namaste' }).expect(201)
      const m = await gotMsg
      assert.equal(m.number, r.id)
      assert.equal(m.message.text, 'Namaste')
      cs.close()
      as.close()
    } finally {
      stopRealtime()
      server.close()
    }
  })
})
