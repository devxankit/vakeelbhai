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
  planId = (await t.api().post('/api/admin/plans').set(bearer(admin)).send({ name: 'Yearly', durationMonths: 12, price: 1000 }).expect(201)).body.data.id
})

const { Category } = await import('../src/modules/categories/category.model.js')
const { SOW_CATEGORIES } = await import('../src/modules/categories/sowCategories.js')
const { Offer } = await import('../src/modules/offers/offer.models.js')
const { Payment } = await import('../src/modules/payments/payment.models.js')
const DOCS = ['districtBar', 'stateBar', 'enrolment', 'aadhaarFront', 'aadhaarBack']
const day = 86400000

async function advocate(phone = '9876500001', member = true) {
  const s = await loginUser(t, phone, 'advocate')
  const tok = s.accessToken
  await t.api().patch('/api/advocate/profile').set(bearer(tok)).send({ name: 'Rohan Malhotra', email: 'r@example.com', address: '1 Court Road', state: 'Madhya Pradesh', district: 'Indore', practice: ['criminal', 'civil'], experienceYears: 10, courts: 'Indore District Court', enrolmentNumber: 'MP/1287/2014' }).expect(200)
  await t.api().put('/api/advocate/photo').set(bearer(tok)).attach('file', PNG, 'p.png').expect(200)
  for (const k of DOCS) await t.api().put('/api/advocate/documents/' + k).set(bearer(tok)).attach('file', PNG, 'd.png').expect(200)
  await t.api().post('/api/advocate/verification/submit').set(bearer(tok)).expect(200)
  await t.api().post('/api/admin/advocates/' + s.user.id + '/review').set(bearer(admin)).send({ decision: 'approve' }).expect(200)
  if (member) await t.api().post('/api/admin/advocates/' + s.user.id + '/membership').set(bearer(admin)).send({ planId, reason: 'Pilot advocate' }).expect(200)
  return { tok, id: s.user.id }
}
async function client(phone = '9876500100', name = 'Rakesh Yadav') {
  const s = await loginUser(t, phone, 'client')
  await t.api().patch('/api/client/profile').set(bearer(s.accessToken)).send({ name, city: 'Indore' }).expect(200)
  return { tok: s.accessToken, id: s.user.id }
}
async function quoted(c, a, fee = 10000, category = 'criminal') {
  const r = (await t.api().post('/api/client/requests').set(bearer(c.tok)).send({ category, issue: 'My brother was arrested in a cheque bounce matter. Hearing this week.', district: 'Indore', language: 'Hindi' }).expect(201)).body.data
  await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(200)
  await t.api().post('/api/advocate/cases/' + r.id + '/accept').set(bearer(a.tok)).expect(200)
  await t.api().post('/api/advocate/cases/' + r.id + '/quote').set(bearer(a.tok)).send({ fee, scope: 'Bail application and one hearing.' }).expect(200)
  return r.id
}
async function payGateway(tok, co) {
  const g = (await t.api().post('/api/payments/' + co.payment.id + '/sandbox-pay').set(bearer(tok)).expect(200)).body.data
  return (await t.api().post('/api/payments/' + co.payment.id + '/verify').set(bearer(tok)).send(g).expect(200)).body.data
}
const offer = (b) => t.api().post('/api/admin/offers').set(bearer(admin)).send({ startAt: new Date(Date.now() - day), endAt: new Date(Date.now() + 30 * day), ...b })

describe('Offers', () => {
  test('coupon: 10% up to ₹500, GST and commission on the discounted fee; one use per client; released if not paid', async () => {
    await offer({ title: 'First consultation', code: 'FIRST10', valueType: 'percent', value: 10, max: 500 }).expect(201)
    const a = await advocate()
    const c = await client()
    const id = await quoted(c, a, 8000)
    const pre = (await t.api().get('/api/client/requests/' + id + '/checkout?code=first10').set(bearer(c.tok)).expect(200)).body.data
    assert.deepEqual([pre.discount, pre.base, pre.gst, pre.total, pre.offer.code], [500, 7500, 1350, 8850, 'FIRST10'])
    // Not paid: the use comes back.
    const co1 = (await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({ code: 'FIRST10' }).expect(201)).body.data
    assert.equal((await Offer.findOne({ code: 'FIRST10' })).usedCount, 1)
    await t.api().post('/api/payments/' + co1.payment.id + '/cancel').set(bearer(c.tok)).expect(200)
    assert.equal((await Offer.findOne({ code: 'FIRST10' })).usedCount, 0)
    const co = (await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({ code: 'FIRST10' }).expect(201)).body.data
    const paid = await payGateway(c.tok, co)
    assert.equal(paid.offer.code, 'FIRST10')
    assert.match(paid.invoiceNo, /^VB\/\d{4}-\d{2}\/00001$/)
    const p = await Payment.findOne({ number: paid.id }).lean()
    assert.equal(p.payout.commissionPaise, 150000) // 20% of ₹7,500
    // Second request: already used.
    const id2 = await quoted(c, a, 3000)
    const res = await t.api().get('/api/client/requests/' + id2 + '/checkout?code=FIRST10').set(bearer(c.tok)).expect(400)
    assert.match(res.body.error.message, /already used/)
    await t.api().get('/api/client/requests/' + id2 + '/checkout?code=NOPE99').set(bearer(c.tok)).expect(400)
  })

  test('cashback offer, auto-applied, lands in the wallet when the work is confirmed', async () => {
    await offer({ title: 'Notary cashback', autoApply: true, kind: 'cashback', valueType: 'flat', value: 100, categories: ['civil'], perUserLimit: 5 }).expect(201)
    const a = await advocate()
    const c = await client()
    const id = await quoted(c, a, 2000, 'civil')
    const pre = (await t.api().get('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).expect(200)).body.data
    assert.equal(pre.offer.cashback, 100)
    assert.equal(pre.discount, 0)
    await payGateway(c.tok, (await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({}).expect(201)).body.data)
    await t.api().post('/api/advocate/cases/' + id + '/done').set(bearer(a.tok)).expect(200)
    await t.api().post('/api/client/requests/' + id + '/confirm').set(bearer(c.tok)).send({ rating: 5 }).expect(200)
    const w = (await t.api().get('/api/client/wallet').set(bearer(c.tok)).expect(200)).body.data
    assert.equal(w.balance, 100)
    assert.equal(w.tx[0].type, 'cashback')
    assert.equal((await t.api().get('/api/client/offers').set(bearer(c.tok)).expect(200)).body.data[0].label, '₹100 cashback')
  })

  test('membership coupon for advocates', async () => {
    await offer({ title: 'Launch', code: 'LAUNCH50', scope: 'membership', valueType: 'percent', value: 50 }).expect(201)
    const a = await advocate('9876500001', false)
    const co = (await t.api().post('/api/advocate/membership/checkout').set(bearer(a.tok)).send({ planId, code: 'LAUNCH50' }).expect(201)).body.data
    assert.equal(co.gateway.amount, 59000) // ₹500 + 18% GST
    await payGateway(a.tok, co)
    assert.equal((await t.api().get('/api/advocate/profile').set(bearer(a.tok)).expect(200)).body.data.membership.active, true)
  })
})

describe('Refer and earn', () => {
  test('the referrer is paid once, when the friend completes their first paid service', async () => {
    await t.api().patch('/api/admin/settings').set(bearer(admin)).send({ referral: { enabled: true, rewardType: 'flat', rewardValue: 150, monthlyCap: 1000 } }).expect(200)
    const a = await advocate()
    const friend1 = await client('9876500100', 'Ananya Kapoor')
    const code = (await t.api().get('/api/client/referral').set(bearer(friend1.tok)).expect(200)).body.data.code
    assert.match(code, /^VBANANY\d{3}$/)
    const c = await client('9876500200', 'Rahul Mehta')
    await t.api().post('/api/client/referral/apply').set(bearer(c.tok)).send({ code: 'WRONG1' }).expect(400)
    await t.api().post('/api/client/referral/apply').set(bearer(friend1.tok)).send({ code }).expect(400) // own code
    await t.api().post('/api/client/referral/apply').set(bearer(c.tok)).send({ code }).expect(200)
    await t.api().post('/api/client/referral/apply').set(bearer(c.tok)).send({ code }).expect(409)
    for (let i = 0; i < 2; i++) {
      const id = await quoted(c, a, 2000)
      await payGateway(c.tok, (await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({}).expect(201)).body.data)
      await t.api().post('/api/advocate/cases/' + id + '/done').set(bearer(a.tok)).expect(200)
      await t.api().post('/api/client/requests/' + id + '/confirm').set(bearer(c.tok)).send({ rating: 5 }).expect(200)
    }
    const v = (await t.api().get('/api/client/referral').set(bearer(friend1.tok)).expect(200)).body.data
    assert.deepEqual(v.friends, [{ name: 'Rahul', joinedAt: v.friends[0].joinedAt, rewarded: true, reward: 150 }])
    assert.equal((await t.api().get('/api/client/wallet').set(bearer(friend1.tok)).expect(200)).body.data.balance, 150)
  })
})

describe('Invoices, GST filing, content, reports', () => {
  test('invoice PDF for the owner, a signed link, and admin; nobody else', async () => {
    const a = await advocate('9876500001', false)
    const co = (await t.api().post('/api/advocate/membership/checkout').set(bearer(a.tok)).send({ planId }).expect(201)).body.data
    const paid = await payGateway(a.tok, co)
    const pdf = await t.api().get('/api/payments/' + paid.id + '/invoice').set(bearer(a.tok)).buffer(true).parse((res, cb) => { const d = []; res.on('data', (x) => d.push(x)); res.on('end', () => cb(null, Buffer.concat(d))) }).expect(200).expect('Content-Type', 'application/pdf')
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF')
    const link = (await t.api().get('/api/payments/' + paid.id + '/invoice-link').set(bearer(a.tok)).expect(200)).body.data.path
    await t.api().get(link).expect(200).expect('Content-Type', 'application/pdf')
    await t.api().get(link.replace(/sig=[a-f0-9]{4}/, 'sig=0000')).expect(401)
    const other = await client()
    await t.api().get('/api/payments/' + paid.id + '/invoice').set(bearer(other.tok)).expect(404)
    await t.api().get('/api/admin/payments/' + paid.id + '/invoice').set(bearer(admin)).expect(200)
    assert.equal((await t.api().get('/api/invoices').set(bearer(a.tok)).expect(200)).body.data[0].invoiceNo, paid.invoiceNo)
  })

  test('GST filing: request → fee set → paid → filed with ARN; chat ticket linked', async () => {
    const c = await client()
    const g = (await t.api().post('/api/client/gst-filings').set(bearer(c.tok)).send({ returnType: 'GSTR-3B', gstin: '23ABCDE1234F1Z5', period: 'October 2026' }).expect(201)).body.data
    assert.match(g.id, /^GST-\d+$/)
    assert.match(g.ticket, /^HD-\d+$/)
    await t.api().post('/api/client/gst-filings/' + g.id + '/documents').set(bearer(c.tok)).attach('file', PNG, 'sales.png').expect(201)
    await t.api().post('/api/client/gst-filings/' + g.id + '/checkout').set(bearer(c.tok)).expect(409) // no fee yet
    await t.api().post('/api/admin/gst-filings/' + g.id + '/update').set(bearer(admin)).send({ status: 'in_review', fee: 999 }).expect(200)
    await t.api().post('/api/admin/gst-filings/' + g.id + '/update').set(bearer(admin)).send({ status: 'filed', filedRef: 'AA2310260012345' }).expect(409) // not paid
    const co = (await t.api().post('/api/client/gst-filings/' + g.id + '/checkout').set(bearer(c.tok)).expect(201)).body.data
    assert.equal(co.gateway.amount, 117882) // ₹999 + 18%
    await payGateway(c.tok, co)
    await t.api().post('/api/admin/gst-filings/' + g.id + '/update').set(bearer(admin)).send({ status: 'filed', filedRef: 'AA2310260012345' }).expect(200)
    const v = (await t.api().get('/api/client/gst-filings/' + g.id).set(bearer(c.tok)).expect(200)).body.data
    assert.equal(v.status, 'filed')
    assert.equal(v.paid, true)
    assert.equal(v.filedRef, 'AA2310260012345')
    assert.deepEqual(v.events.map((e) => e.status), ['requested', 'in_review', 'paid', 'filed'])
    const thread = (await t.api().get('/api/support/tickets/' + g.ticket).set(bearer(c.tok)).expect(200)).body.data
    assert.ok(thread.messages.some((m) => /ARN AA2310260012345/.test(m.text ?? '')))
    await t.api().post('/api/client/gst-filings').set(bearer(c.tok)).send({ returnType: 'GSTR-1', period: 'Oct' }).expect(422)
  })

  test('content: drafts until edited; broadcast; reports and CSV', async () => {
    const c0 = (await t.api().get('/api/content').expect(200)).body.data
    assert.equal(c0.terms.draft, true)
    assert.ok(c0.faqs.length > 3)
    await t.api().put('/api/admin/content/terms').set(bearer(admin)).send({ title: 'Terms of use', body: ['Final terms paragraph one.'] }).expect(200)
    await t.api().put('/api/admin/content/faqs').set(bearer(admin)).send({ faqs: [{ q: 'Is it safe?', a: 'Yes, payments are held.', audience: 'all' }] }).expect(200)
    const c1 = (await t.api().get('/api/content').expect(200)).body.data
    assert.deepEqual([c1.terms.draft, c1.terms.body[0], c1.faqs.length], [false, 'Final terms paragraph one.', 1])

    const cl = await client()
    assert.equal((await t.api().post('/api/admin/notifications/broadcast').set(bearer(admin)).send({ audience: 'clients', title: 'Diwali offer', body: '10% off this week.' }).expect(200)).body.data.sent, 1)
    assert.equal((await t.api().get('/api/notifications').set(bearer(cl.tok)).expect(200)).body.data[0].title, 'Diwali offer')

    const a = await advocate('9876500001', false)
    await payGateway(a.tok, (await t.api().post('/api/advocate/membership/checkout').set(bearer(a.tok)).send({ planId }).expect(201)).body.data)
    const sum = (await t.api().get('/api/admin/reports/summary').set(bearer(admin)).expect(200)).body.data.months[0]
    assert.deepEqual([sum.memberships.count, sum.memberships.base, sum.memberships.gst, sum.gstTotal], [1, 1000, 180, 180])
    const csv = await t.api().get('/api/admin/reports/payments.csv').set(bearer(admin)).expect(200).expect('Content-Type', /text\/csv/)
    assert.match(csv.text, /Invoice no\./)
    assert.match(csv.text, /membership/)
    const gst = await t.api().get('/api/admin/reports/gst.csv').set(bearer(admin)).expect(200)
    assert.match(gst.text, /Advocate memberships,1,1000\.00,180\.00/)
  })
})
