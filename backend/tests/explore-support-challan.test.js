import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PNG, bearer, clearDb, createAdmin, loginAdmin, loginUser, startTestServer } from './helpers.js'

let t
let admin
let planId
before(async () => (t = await startTestServer({ PAYMENT_PROVIDER: 'sandbox', CHALLAN_PROVIDER: 'sandbox' })))
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
const { ChallanLock } = await import('../src/modules/challans/challan.models.js')
const { Payment } = await import('../src/modules/payments/payment.models.js')

const DOCS = ['districtBar', 'stateBar', 'enrolment', 'aadhaarFront', 'aadhaarBack']

/** An advocate taken as far as `stage`: 'draft' | 'approved' | 'member'. */
async function advocate(phone, name, practice, stage = 'member') {
  const s = await loginUser(t, phone, 'advocate')
  const tok = s.accessToken
  await t.api().patch('/api/advocate/profile').set(bearer(tok)).send({ name, email: phone + '@example.com', address: '1 Court Road', state: 'Madhya Pradesh', district: 'Indore', practice, experienceYears: 10, courts: 'Indore District Court', enrolmentNumber: 'MP/1287/2014' }).expect(200)
  await t.api().put('/api/advocate/photo').set(bearer(tok)).attach('file', PNG, 'p.png').expect(200)
  if (stage === 'draft') return { tok, id: s.user.id }
  for (const k of DOCS) await t.api().put('/api/advocate/documents/' + k).set(bearer(tok)).attach('file', PNG, 'd.png').expect(200)
  await t.api().post('/api/advocate/verification/submit').set(bearer(tok)).expect(200)
  await t.api().post('/api/admin/advocates/' + s.user.id + '/review').set(bearer(admin)).send({ decision: 'approve' }).expect(200)
  if (stage === 'member') await t.api().post('/api/admin/advocates/' + s.user.id + '/membership').set(bearer(admin)).send({ planId, reason: 'Pilot advocate' }).expect(200)
  return { tok, id: s.user.id }
}

async function client(phone = '9876500100') {
  const s = await loginUser(t, phone, 'client')
  await t.api().patch('/api/client/profile').set(bearer(s.accessToken)).send({ name: 'Rakesh Yadav', city: 'Indore' }).expect(200)
  return { tok: s.accessToken, id: s.user.id }
}

/* ------------------------------------------------------------------ explore */

describe('Explore advocates', () => {
  test('lists only verified advocates with an active membership, with photo, name and designation only', async () => {
    const listed = await advocate('9876500001', 'Priya Nair', ['matrimonial', 'civil'])
    await advocate('9876500002', 'Not Member', ['criminal'], 'approved')
    const draft = await advocate('9876500003', 'Still Draft', ['criminal'], 'draft')
    const c = await client()
    const res = await t.api().get('/api/client/advocates').set(bearer(c.tok)).expect(200)
    assert.equal(res.body.data.length, 1)
    assert.deepEqual(res.body.data[0], { id: listed.id, name: 'Adv. Priya Nair', designation: 'Matrimonial lawyer', hasPhoto: true })
    assert.equal(res.body.meta.total, 1)

    await t.api().get('/api/client/advocates/' + listed.id + '/photo').set(bearer(c.tok)).expect(200).expect('Content-Type', 'image/png')
    // Unlisted advocates' photos stay private.
    await t.api().get('/api/client/advocates/' + draft.id + '/photo').set(bearer(c.tok)).expect(404)
  })

  test('blocked advocates disappear; filters by category and name; advocates cannot browse', async () => {
    const a = await advocate('9876500001', 'Priya Nair', ['matrimonial'])
    const b = await advocate('9876500002', 'Rohan Malhotra', ['criminal'])
    const c = await client()
    assert.equal((await t.api().get('/api/client/advocates?category=criminal').set(bearer(c.tok)).expect(200)).body.data[0].name, 'Adv. Rohan Malhotra')
    assert.equal((await t.api().get('/api/client/advocates?q=priya').set(bearer(c.tok)).expect(200)).body.data.length, 1)
    await t.api().patch('/api/admin/advocates/' + a.id + '/status').set(bearer(admin)).send({ status: 'blocked', reason: 'Complaint under review' }).expect(200)
    assert.equal((await t.api().get('/api/client/advocates').set(bearer(c.tok)).expect(200)).body.data.length, 1)
    await t.api().get('/api/client/advocates').set(bearer(b.tok)).expect(403)
  })
})

/* ------------------------------------------------------------------ help desk */

describe('Help desk', () => {
  test('client raises a ticket, admin replies, statuses and unread markers follow', async () => {
    const c = await client()
    const tk = (await t.api().post('/api/support/tickets').set(bearer(c.tok)).send({ topic: 'payments', subject: 'Paid twice?', message: 'I think I was charged twice for VB-1001.', ref: 'VB-1001' }).expect(201)).body.data
    assert.match(tk.id, /^HD-\d+$/)
    assert.equal(tk.status, 'open')

    const queue = (await t.api().get('/api/admin/support').set(bearer(admin)).expect(200)).body.data
    assert.equal(queue.length, 1)
    assert.equal(queue[0].unread, true)
    assert.equal(queue[0].role, 'client')

    await t.api().post('/api/admin/support/' + tk.id + '/messages').set(bearer(admin)).send({ text: 'Checking this now.' }).expect(201)
    const mine = (await t.api().get('/api/support/tickets').set(bearer(c.tok)).expect(200)).body.data[0]
    assert.equal(mine.status, 'answered')
    assert.equal(mine.unread, true)
    const thread = (await t.api().get('/api/support/tickets/' + tk.id).set(bearer(c.tok)).expect(200)).body.data
    assert.deepEqual(thread.messages.map((m) => m.from), ['user', 'system', 'support'])
    assert.equal(thread.messages[2].name, 'Test · Vakeel Bhai support')
    assert.equal((await t.api().get('/api/support/tickets').set(bearer(c.tok)).expect(200)).body.data[0].unread, false)

    await t.api().post('/api/support/tickets/' + tk.id + '/messages').set(bearer(c.tok)).send({ text: 'Thanks' }).expect(201)
    assert.equal((await t.api().get('/api/admin/support/' + tk.id).set(bearer(admin)).expect(200)).body.data.status, 'open')

    await t.api().post('/api/admin/support/' + tk.id + '/close').set(bearer(admin)).send({ note: 'Only one charge went through.' }).expect(200)
    assert.equal((await t.api().get('/api/support/tickets/' + tk.id).set(bearer(c.tok)).expect(200)).body.data.status, 'closed')
    // Writing again reopens it.
    await t.api().post('/api/support/tickets/' + tk.id + '/messages/image').set(bearer(c.tok)).attach('file', PNG, 's.png').expect(201)
    const reopened = (await t.api().get('/api/support/tickets/' + tk.id).set(bearer(c.tok)).expect(200)).body.data
    assert.equal(reopened.status, 'open')
    const img = reopened.messages.at(-1)
    await t.api().get('/api/support/tickets/' + tk.id + '/messages/' + img.id + '/file').set(bearer(c.tok)).expect(200)
    await t.api().get('/api/admin/support/' + tk.id + '/messages/' + img.id + '/file').set(bearer(admin)).expect(200)
  })

  test('advocates have a help desk too; nobody can read another user’s ticket', async () => {
    const a = await advocate('9876500001', 'Priya Nair', ['civil'], 'draft')
    const c = await client()
    const tk = (await t.api().post('/api/support/tickets').set(bearer(a.tok)).send({ topic: 'membership', subject: 'Plan question', message: 'Which plan should I choose?' }).expect(201)).body.data
    assert.equal((await t.api().get('/api/admin/support?role=advocate').set(bearer(admin)).expect(200)).body.data[0].id, tk.id)
    await t.api().get('/api/support/tickets/' + tk.id).set(bearer(c.tok)).expect(404)
    await t.api().post('/api/support/tickets/' + tk.id + '/messages').set(bearer(c.tok)).send({ text: 'hi' }).expect(404)
    await t.api().post('/api/support/tickets').set(bearer(c.tok)).send({ topic: 'nope', subject: 'x', message: 'y' }).expect(422)
  })
})

/* ------------------------------------------------------------------ e-Challan */

describe('e-Challan', () => {
  async function vehicleWithChallans(c, plate = 'mp 09 ab 1234', type = 'car') {
    const v = (await t.api().post('/api/client/vehicles').set(bearer(c.tok)).send({ plate, type }).expect(201)).body.data
    const list = (await t.api().get('/api/client/vehicles/' + v.id + '/challans').set(bearer(c.tok)).expect(200)).body.data.challans
    return { v, list }
  }
  const setFee = (fee) => t.api().patch('/api/admin/settings').set(bearer(admin)).send({ challanFee: fee }).expect(200)
  async function payChallans(c, v, ids) {
    const co = (await t.api().post('/api/client/challans/checkout').set(bearer(c.tok)).send({ vehicleId: v.id, challans: ids }).expect(201)).body.data
    const g = (await t.api().post('/api/payments/' + co.payment.id + '/sandbox-pay').set(bearer(c.tok)).expect(200)).body.data
    await t.api().post('/api/payments/' + co.payment.id + '/verify').set(bearer(c.tok)).send(g).expect(200)
    return co
  }

  test('vehicles: plate validated and normalised; up to the owner', async () => {
    const c = await client()
    await t.api().post('/api/client/vehicles').set(bearer(c.tok)).send({ plate: 'HELLO', type: 'car' }).expect(422)
    await t.api().post('/api/client/vehicles').set(bearer(c.tok)).send({ plate: 'MP09AB1234', type: 'plane' }).expect(422)
    const v = (await t.api().post('/api/client/vehicles').set(bearer(c.tok)).send({ plate: 'mp-09 ab 1234', type: 'bike' }).expect(201)).body.data
    assert.equal(v.plate, 'MP09AB1234')
    assert.equal(v.number, 'MP 09 AB 1234')
    const other = await client('9876500200')
    await t.api().get('/api/client/vehicles/' + v.id + '/challans').set(bearer(other.tok)).expect(404)
    await t.api().delete('/api/client/vehicles/' + v.id).set(bearer(c.tok)).expect(200)
    assert.equal((await t.api().get('/api/client/vehicles').set(bearer(c.tok)).expect(200)).body.data.length, 0)
  })

  test('checkout stays closed until the admin sets the charge', async () => {
    const c = await client()
    const { v, list } = await vehicleWithChallans(c)
    assert.ok(list.length >= 1)
    assert.ok(list.every((x) => x.state === 'due'))
    const res = await t.api().post('/api/client/challans/checkout').set(bearer(c.tok)).send({ vehicleId: v.id, challans: [list[0].id] }).expect(503)
    assert.equal(res.body.error.code, 'CHALLAN_CLOSED')
    assert.deepEqual((await t.api().get('/api/meta').expect(200)).body.data.challan, { fee: null, payWithinHours: 24, lookup: true, vehicleTypes: ['bike', 'car', 'auto', 'commercial', 'other'] })
  })

  test('pay: challans + charge per challan + GST on the charge; then processing within 24 hours; admin completes with the receipt', async () => {
    await setFee(49)
    const c = await client()
    const { v, list } = await vehicleWithChallans(c)
    const ids = list.map((x) => x.id)
    const challans = list.reduce((a, x) => a + x.amount, 0)
    const co = await payChallans(c, v, ids)
    const fee = 49 * ids.length
    const gst = Math.round(fee * 0.18 * 100) / 100
    assert.deepEqual(co.order.amounts, { challans, fee, gst, total: Math.round((challans + fee + gst) * 100) / 100, gstPercent: 18 })

    const order = (await t.api().get('/api/client/challans/orders/' + co.order.id).set(bearer(c.tok)).expect(200)).body.data
    assert.equal(order.status, 'processing')
    const hours = (new Date(order.dueBy) - new Date(order.paidAt)) / 3600000
    assert.equal(hours, 24)
    const again = (await t.api().get('/api/client/vehicles/' + v.id + '/challans').set(bearer(c.tok)).expect(200)).body.data.challans
    assert.ok(again.every((x) => x.state === 'processing' && x.order === co.order.id))

    // The same challan cannot be paid again.
    const dup = await t.api().post('/api/client/challans/checkout').set(bearer(c.tok)).send({ vehicleId: v.id, challans: [ids[0]] }).expect(409)
    assert.equal(dup.body.error.code, 'CHALLAN_HELD')

    const queue = (await t.api().get('/api/admin/challans').set(bearer(admin)).expect(200)).body.data
    assert.equal(queue[0].id, co.order.id)
    assert.equal(queue[0].overdue, false)
    assert.equal((await t.api().get('/api/admin/dashboard').set(bearer(admin)).expect(200)).body.data.challans.processing, 1)

    await t.api().post('/api/admin/challans/' + co.order.id + '/complete').set(bearer(admin)).send({ departmentRef: 'MPTD-88112233' }).expect(200)
    const done = (await t.api().get('/api/client/challans/orders/' + co.order.id).set(bearer(c.tok)).expect(200)).body.data
    assert.equal(done.status, 'completed')
    assert.equal(done.departmentRef, 'MPTD-88112233')
    assert.ok((await t.api().get('/api/client/vehicles/' + v.id + '/challans').set(bearer(c.tok)).expect(200)).body.data.challans.every((x) => x.state === 'paid'))
    await t.api().post('/api/admin/challans/' + co.order.id + '/refund').set(bearer(admin)).send({ reason: 'Too late now' }).expect(409)
  })

  test('refund: full amount back and the challans can be paid again', async () => {
    await setFee(49)
    const c = await client()
    const { v, list } = await vehicleWithChallans(c)
    const co = await payChallans(c, v, [list[0].id])
    await t.api().post('/api/admin/challans/' + co.order.id + '/refund').set(bearer(admin)).send({ reason: 'Department portal rejected the payment' }).expect(200)
    const p = await Payment.findOne({ number: co.payment.id }).lean()
    assert.equal(p.status, 'refunded')
    assert.equal(p.refund.gatewayPaise, p.amounts.totalPaise)
    assert.equal((await t.api().get('/api/client/challans/orders/' + co.order.id).set(bearer(c.tok)).expect(200)).body.data.status, 'refunded')
    assert.equal(await ChallanLock.countDocuments(), 0)
    await payChallans(c, v, [list[0].id])
  })

  test('a checkout that is not completed frees its challans; amounts never come from the app', async () => {
    await setFee(0)
    const c = await client()
    const { v, list } = await vehicleWithChallans(c)
    const co = (await t.api().post('/api/client/challans/checkout').set(bearer(c.tok)).send({ vehicleId: v.id, challans: [list[0].id] }).expect(201)).body.data
    assert.equal(co.order.amounts.total, list[0].amount)
    assert.equal(await ChallanLock.countDocuments(), 1)
    await t.api().post('/api/payments/' + co.payment.id + '/cancel').set(bearer(c.tok)).expect(200)
    assert.equal(await ChallanLock.countDocuments(), 0)
    // An unknown challan number is refused.
    const bad = await t.api().post('/api/client/challans/checkout').set(bearer(c.tok)).send({ vehicleId: v.id, challans: ['MP0000000000'] }).expect(409)
    assert.equal(bad.body.error.code, 'CHALLAN_CHANGED')
    // Cancelled orders are not in the client's history.
    assert.equal((await t.api().get('/api/client/challans/orders').set(bearer(c.tok)).expect(200)).body.data.length, 0)
  })
})
