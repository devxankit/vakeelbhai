import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
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
const { WalletTransaction, Wallet } = await import('../src/modules/wallet/wallet.models.js')
const { Payment, PayoutAccount } = await import('../src/modules/payments/payment.models.js')
const { ServiceRequest } = await import('../src/modules/requests/request.models.js')
const { autoConfirmDue, expireCheckouts } = await import('../src/modules/payments/payment.service.js')

const DOCS = ['districtBar', 'stateBar', 'enrolment', 'aadhaarFront', 'aadhaarBack']

async function advocate(phone = '9876500001', practice = ['criminal', 'notary']) {
  const s = await loginUser(t, phone, 'advocate')
  const tok = s.accessToken
  await t.api().patch('/api/advocate/profile').set(bearer(tok)).send({ name: 'Rohan Malhotra', email: 'r@example.com', address: '1 Court Road', state: 'Madhya Pradesh', district: 'Indore', practice, experienceYears: 10, courts: 'Indore District Court', enrolmentNumber: 'MP/1287/2014' }).expect(200)
  await t.api().put('/api/advocate/photo').set(bearer(tok)).attach('file', PNG, 'p.png').expect(200)
  for (const k of DOCS) await t.api().put('/api/advocate/documents/' + k).set(bearer(tok)).attach('file', PNG, 'd.png').expect(200)
  await t.api().post('/api/advocate/verification/submit').set(bearer(tok)).expect(200)
  await t.api().post('/api/admin/advocates/' + s.user.id + '/review').set(bearer(admin)).send({ decision: 'approve' }).expect(200)
  await t.api().post('/api/admin/advocates/' + s.user.id + '/membership').set(bearer(admin)).send({ planId, reason: 'Pilot advocate' }).expect(200)
  return { tok, id: s.user.id }
}

/** Client + advocate + a request at "quoted" for `fee` rupees. */
async function quoted({ fee = 8000, category = 'criminal' } = {}) {
  const cs = await loginUser(t, '9876500100', 'client')
  await t.api().patch('/api/client/profile').set(bearer(cs.accessToken)).send({ name: 'Rakesh Yadav', city: 'Indore' }).expect(200)
  const c = { tok: cs.accessToken, id: cs.user.id }
  const a = await advocate()
  const r = (await t.api().post('/api/client/requests').set(bearer(c.tok)).send({ category, issue: 'My brother was arrested in a cheque bounce matter. Hearing this week.', district: 'Indore', language: 'Hindi' }).expect(201)).body.data
  await t.api().post('/api/admin/requests/' + r.id + '/assign').set(bearer(admin)).send({ advocateId: a.id }).expect(200)
  await t.api().post('/api/advocate/cases/' + r.id + '/accept').set(bearer(a.tok)).expect(200)
  await t.api().post('/api/advocate/cases/' + r.id + '/quote').set(bearer(a.tok)).send({ fee, scope: 'Bail application and one hearing.' }).expect(200)
  return { c, a, id: r.id }
}

/** The full browser flow with the sandbox gateway: checkout → "pay" → server verifies. */
async function pay(tok, number, useWallet = false) {
  const co = (await t.api().post('/api/client/requests/' + number + '/checkout').set(bearer(tok)).send({ useWallet }).expect(201)).body.data
  if (!co.gateway) return co.payment
  const g = (await t.api().post('/api/payments/' + co.payment.id + '/sandbox-pay').set(bearer(tok)).expect(200)).body.data
  return (await t.api().post('/api/payments/' + co.payment.id + '/verify').set(bearer(tok)).send(g).expect(200)).body.data
}

const wallet = async (tok, role) => (await t.api().get('/api/' + role + '/wallet').set(bearer(tok)).expect(200)).body.data
const credit = (userId, amount) => t.api().post('/api/admin/wallets/' + userId + '/adjust').set(bearer(admin)).send({ amount, reason: 'Goodwill credit for testing' }).expect(200)

describe('client payment', () => {
  test('preview: ₹8,000 criminal → GST 18% → ₹9,440; advocate sees payout ₹6,112 after paying', async () => {
    const { c, a, id } = await quoted()
    const p = (await t.api().get('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).expect(200)).body.data
    assert.deepEqual([p.base, p.gst, p.total, p.gstOnService], [8000, 1440, 9440, true])
    const paid = await pay(c.tok, id)
    assert.equal(paid.status, 'paid')
    const r = (await t.api().get('/api/client/requests/' + id).set(bearer(c.tok))).body.data
    assert.equal(r.status, 'paid')
    assert.equal(r.paid.total, 9440)
    const k = (await t.api().get('/api/advocate/cases/' + id).set(bearer(a.tok))).body.data
    assert.deepEqual([k.payout.commission, k.payout.gstOnCommission, k.payout.net], [1600, 288, 6112])
    const aw = await wallet(a.tok, 'advocate')
    assert.deepEqual([aw.balance, aw.hold], [0, 6112])
  })

  test('the browser cannot fake success: bad signature, wrong order, or no gateway payment', async () => {
    const { c, id } = await quoted()
    const co = (await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({}).expect(201)).body.data
    const fake = { orderId: co.gateway.orderId, paymentId: 'sbx_pay_123456', signature: 'a'.repeat(64) }
    await t.api().post('/api/payments/' + co.payment.id + '/verify').set(bearer(c.tok)).send(fake).expect(400)
    await t.api().post('/api/payments/' + co.payment.id + '/verify').set(bearer(c.tok)).send({ ...fake, orderId: 'sbx_order_other' }).expect(400)
    assert.equal((await t.api().get('/api/client/requests/' + id).set(bearer(c.tok))).body.data.status, 'quoted')
    assert.equal((await Payment.findOne({ number: co.payment.id })).status, 'created')
  })

  test('verify sent twice at once: paid once, held once', async () => {
    const { c, id } = await quoted()
    const co = (await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({}).expect(201)).body.data
    const g = (await t.api().post('/api/payments/' + co.payment.id + '/sandbox-pay').set(bearer(c.tok)).expect(200)).body.data
    const rs = await Promise.all([1, 2, 3].map(() => t.api().post('/api/payments/' + co.payment.id + '/verify').set(bearer(c.tok)).send(g)))
    assert.ok(rs.every((x) => x.status === 200))
    assert.equal(await WalletTransaction.countDocuments({ type: 'hold' }), 1)
  })

  test('another client cannot pay, verify or see the checkout', async () => {
    const { c, id } = await quoted()
    const other = await loginUser(t, '9876500101', 'client')
    await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(other.accessToken)).send({}).expect(404)
    const co = (await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({}).expect(201)).body.data
    await t.api().get('/api/payments/' + co.payment.id).set(bearer(other.accessToken)).expect(404)
    await t.api().post('/api/payments/' + co.payment.id + '/sandbox-pay').set(bearer(other.accessToken)).expect(404)
  })

  test('expired quotes cannot be paid', async () => {
    const { c, id } = await quoted()
    await ServiceRequest.updateOne({ number: id }, { $set: { 'quote.validTill': new Date(Date.now() - 1000) } })
    const r = await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({}).expect(409)
    assert.equal(r.body.error.code, 'QUOTE_EXPIRED')
  })
})

describe('client wallet at checkout', () => {
  test('wallet part is taken at checkout and returned if the checkout is cancelled or expires', async () => {
    const { c, id } = await quoted()
    await credit(c.id, 500)
    const co = (await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({ useWallet: true }).expect(201)).body.data
    assert.deepEqual([co.payment.wallet, co.payment.total], [500, 8940])
    assert.equal((await wallet(c.tok, 'client')).balance, 0)
    await t.api().post('/api/payments/' + co.payment.id + '/cancel').set(bearer(c.tok)).expect(200)
    assert.equal((await wallet(c.tok, 'client')).balance, 500)

    const co2 = (await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({ useWallet: true }).expect(201)).body.data
    assert.equal((await wallet(c.tok, 'client')).balance, 0)
    await Payment.updateOne({ number: co2.payment.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    assert.equal(await expireCheckouts(), 1)
    assert.equal((await wallet(c.tok, 'client')).balance, 500)
  })

  test('starting a new checkout closes the old one and returns its wallet amount', async () => {
    const { c, id } = await quoted()
    await credit(c.id, 500)
    await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({ useWallet: true }).expect(201)
    await t.api().post('/api/client/requests/' + id + '/checkout').set(bearer(c.tok)).send({ useWallet: true }).expect(201)
    assert.equal(await Payment.countDocuments({ status: 'created' }), 1)
    assert.equal((await Wallet.findOne({ user: c.id })).balancePaise, 0)
    assert.equal(await WalletTransaction.countDocuments({ user: c.id, type: 'spend_release' }), 1)
  })

  test('wallet covering the whole bill pays at once, without the gateway', async () => {
    const { c, id } = await quoted({ fee: 500, category: 'notary' })
    await credit(c.id, 600)
    const p = await pay(c.tok, id, true)
    assert.equal(p.status, 'paid')
    assert.deepEqual([p.wallet, p.total], [500, 0])
    assert.equal((await wallet(c.tok, 'client')).balance, 100)
  })

  test('the admin wallet cap limits how much the wallet can pay', async () => {
    const { c, id } = await quoted({ fee: 1000, category: 'notary' })
    await credit(c.id, 900)
    await t.api().patch('/api/admin/settings').set(bearer(admin)).send({ walletMaxUsePercent: 10 }).expect(200)
    const p = (await t.api().get('/api/client/requests/' + id + '/checkout?useWallet=1').set(bearer(c.tok))).body.data
    assert.deepEqual([p.wallet, p.total], [100, 900])
  })
})

describe('completion', () => {
  test('done → client confirms → net moves from hold to balance, with the breakup', async () => {
    const { c, a, id } = await quoted()
    await pay(c.tok, id)
    await t.api().post('/api/client/requests/' + id + '/confirm').set(bearer(c.tok)).send({ rating: 5 }).expect(409)
    const d = (await t.api().post('/api/advocate/cases/' + id + '/done').set(bearer(a.tok)).expect(200)).body.data
    assert.ok(new Date(d.autoConfirmAt) > new Date(Date.now() + 6 * 86400000))
    await t.api().post('/api/client/requests/' + id + '/confirm').set(bearer(c.tok)).send({ rating: 5, review: 'Very helpful' }).expect(200)
    const aw = await wallet(a.tok, 'advocate')
    assert.deepEqual([aw.balance, aw.hold, aw.lifetime, aw.month.earned], [6112, 0, 6112, 6112])
    const earn = aw.tx.find((x) => x.type === 'earn')
    assert.deepEqual(earn.lines.map((l) => l.v), [8000, -1600, -288])
    assert.equal((await t.api().get('/api/client/requests?tab=completed').set(bearer(c.tok))).body.data[0].rating, 5)
    // Twice is not possible.
    await t.api().post('/api/client/requests/' + id + '/confirm').set(bearer(c.tok)).send({ rating: 1 }).expect(409)
    assert.equal(await WalletTransaction.countDocuments({ type: 'earn' }), 1)
  })

  test('auto-confirm after the set number of days', async () => {
    const { c, a, id } = await quoted()
    await pay(c.tok, id)
    await t.api().post('/api/advocate/cases/' + id + '/done').set(bearer(a.tok)).expect(200)
    assert.equal(await autoConfirmDue(), 0)
    await ServiceRequest.updateOne({ number: id }, { $set: { autoConfirmAt: new Date(Date.now() - 1000) } })
    assert.equal(await autoConfirmDue(), 1)
    const r = await ServiceRequest.findOne({ number: id })
    assert.deepEqual([r.status, r.completedBy], ['completed', 'auto'])
    assert.equal((await wallet(a.tok, 'advocate')).balance, 6112)
  })

  test('commission uses the rate at payment time, even if the admin changes it later', async () => {
    const { c, a, id } = await quoted()
    await pay(c.tok, id)
    await t.api().patch('/api/admin/settings').set(bearer(admin)).send({ commissionPercent: 10 }).expect(200)
    await t.api().post('/api/advocate/cases/' + id + '/done').set(bearer(a.tok)).expect(200)
    await t.api().post('/api/client/requests/' + id + '/confirm').set(bearer(c.tok)).send({ rating: 4 }).expect(200)
    assert.equal((await wallet(a.tok, 'advocate')).balance, 6112)
  })
})

describe('disputes', () => {
  test('refund: hold removed, wallet part back, gateway refunded, request closed', async () => {
    const { c, a, id } = await quoted()
    await credit(c.id, 500)
    await pay(c.tok, id, true)
    await t.api().post('/api/advocate/cases/' + id + '/done').set(bearer(a.tok)).expect(200)
    await t.api().post('/api/client/requests/' + id + '/dispute').set(bearer(c.tok)).send({ reason: 'Work not done as agreed: no bail application filed.' }).expect(200)
    // A disputed request does not auto-confirm.
    await ServiceRequest.updateOne({ number: id }, { $set: { autoConfirmAt: new Date(Date.now() - 1000) } })
    assert.equal(await autoConfirmDue(), 0)
    await t.api().post('/api/admin/requests/' + id + '/resolve').set(bearer(admin)).send({ outcome: 'refund', note: 'Advocate did not file the application.' }).expect(200)
    const r = (await t.api().get('/api/client/requests/' + id).set(bearer(c.tok))).body.data
    assert.equal(r.status, 'refunded')
    assert.equal(r.paid.refund, 'processed')
    assert.equal((await wallet(c.tok, 'client')).balance, 500)
    assert.deepEqual([(await wallet(a.tok, 'advocate')).hold, (await wallet(a.tok, 'advocate')).balance], [0, 0])
    await t.api().post('/api/admin/requests/' + id + '/resolve').set(bearer(admin)).send({ outcome: 'release', note: 'Changed my mind later' }).expect(409)
  })

  test('release: the advocate is paid as if the client confirmed', async () => {
    const { c, a, id } = await quoted()
    await pay(c.tok, id)
    await t.api().post('/api/client/requests/' + id + '/dispute').set(bearer(c.tok)).send({ reason: 'Advocate stopped responding for days.' }).expect(200)
    await t.api().post('/api/admin/requests/' + id + '/resolve').set(bearer(admin)).send({ outcome: 'release', note: 'Advocate showed the filed application.' }).expect(200)
    assert.equal((await wallet(a.tok, 'advocate')).balance, 6112)
    assert.equal((await ServiceRequest.findOne({ number: id })).dispute.status, 'released')
  })

  test('no dispute before paying', async () => {
    const { c, id } = await quoted()
    await t.api().post('/api/client/requests/' + id + '/dispute').set(bearer(c.tok)).send({ reason: 'I changed my mind about it.' }).expect(409)
  })
})

describe('withdrawals', () => {
  async function earned() {
    const { c, a, id } = await quoted()
    await pay(c.tok, id)
    await t.api().post('/api/advocate/cases/' + id + '/done').set(bearer(a.tok)).expect(200)
    await t.api().post('/api/client/requests/' + id + '/confirm').set(bearer(c.tok)).send({ rating: 5 }).expect(200)
    return a
  }

  test('needs a payout account; account number is stored encrypted and shown as last 4 only', async () => {
    const a = await earned()
    const r = await t.api().post('/api/advocate/withdrawals').set(bearer(a.tok)).send({ amount: 1000 }).expect(400)
    assert.equal(r.body.error.details.reason, 'NO_PAYOUT_ACCOUNT')
    const acc = (await t.api().put('/api/advocate/payout-account').set(bearer(a.tok)).send({ holder: 'Rohan Malhotra', account: '50100234567890', ifsc: 'HDFC0001234' }).expect(200)).body.data
    assert.deepEqual(acc, { holder: 'Rohan Malhotra', accountLast4: '7890', ifsc: 'HDFC0001234', upi: '' })
    const stored = await PayoutAccount.findOne({}).lean()
    assert.equal(JSON.stringify(stored).includes('50100234567890'), false)
    await t.api().put('/api/advocate/payout-account').set(bearer(a.tok)).send({ holder: 'Rohan Malhotra', ifsc: 'BAD' }).expect(422)
  })

  test('request → reject (money back) → request → approve → paid with UTR; cannot overdraw', async () => {
    const a = await earned()
    await t.api().put('/api/advocate/payout-account').set(bearer(a.tok)).send({ holder: 'Rohan Malhotra', upi: 'rohan@okhdfc' }).expect(200)
    await t.api().post('/api/advocate/withdrawals').set(bearer(a.tok)).send({ amount: 7000 }).expect(409)
    const w1 = (await t.api().post('/api/advocate/withdrawals').set(bearer(a.tok)).send({ amount: 6000 }).expect(201)).body.data
    assert.equal(w1.to, 'rohan@okhdfc')
    assert.equal((await wallet(a.tok, 'advocate')).balance, 112)
    await t.api().post('/api/admin/withdrawals/' + w1.id + '/reject').set(bearer(admin)).send({ reason: 'UPI ID did not match the account holder' }).expect(200)
    assert.equal((await wallet(a.tok, 'advocate')).balance, 6112)
    await t.api().post('/api/admin/withdrawals/' + w1.id + '/paid').set(bearer(admin)).send({ utr: 'UTR628104' }).expect(409)

    const w2 = (await t.api().post('/api/advocate/withdrawals').set(bearer(a.tok)).send({ amount: 6112 }).expect(201)).body.data
    await t.api().post('/api/admin/withdrawals/' + w2.id + '/approve').set(bearer(admin)).expect(200)
    await t.api().post('/api/admin/withdrawals/' + w2.id + '/paid').set(bearer(admin)).send({ utr: 'UTR628105' }).expect(200)
    const mine = (await t.api().get('/api/advocate/withdrawals').set(bearer(a.tok))).body.data
    assert.deepEqual(mine.map((w) => w.status), ['paid', 'rejected'])
    assert.equal((await wallet(a.tok, 'advocate')).balance, 0)
  })

  test('two withdrawals at once cannot spend the same money', async () => {
    const a = await earned()
    await t.api().put('/api/advocate/payout-account').set(bearer(a.tok)).send({ holder: 'Rohan Malhotra', upi: 'rohan@okhdfc' }).expect(200)
    const rs = await Promise.all([1, 2, 3].map(() => t.api().post('/api/advocate/withdrawals').set(bearer(a.tok)).send({ amount: 4000 })))
    assert.equal(rs.filter((x) => x.status === 201).length, 1)
    assert.equal((await Wallet.findOne({ user: a.id })).balancePaise, 211200)
  })

  test('the admin minimum applies', async () => {
    const a = await earned()
    await t.api().put('/api/advocate/payout-account').set(bearer(a.tok)).send({ holder: 'Rohan Malhotra', upi: 'rohan@okhdfc' }).expect(200)
    await t.api().patch('/api/admin/settings').set(bearer(admin)).send({ minWithdrawal: 1000 }).expect(200)
    await t.api().post('/api/advocate/withdrawals').set(bearer(a.tok)).send({ amount: 500 }).expect(400)
  })
})

describe('membership purchase', () => {
  test('a plan without a price cannot be bought; with a price, paying activates it (price + GST)', async () => {
    const a = await advocate('9876500009')
    await t.api().post('/api/advocate/membership/checkout').set(bearer(a.tok)).send({ planId }).expect(409)
    await t.api().patch('/api/admin/plans/' + planId).set(bearer(admin)).send({ price: 2999 }).expect(200)
    const co = (await t.api().post('/api/advocate/membership/checkout').set(bearer(a.tok)).send({ planId }).expect(201)).body.data
    assert.deepEqual([co.payment.base, co.payment.gst, co.payment.total], [2999, 539.82, 3538.82])
    const g = (await t.api().post('/api/payments/' + co.payment.id + '/sandbox-pay').set(bearer(a.tok)).expect(200)).body.data
    await t.api().post('/api/payments/' + co.payment.id + '/verify').set(bearer(a.tok)).send(g).expect(200)
    const me = (await t.api().get('/api/advocate/profile').set(bearer(a.tok))).body.data
    assert.equal(me.membership.active, true)
  })

  test('unverified advocates cannot buy', async () => {
    await t.api().patch('/api/admin/plans/' + planId).set(bearer(admin)).send({ price: 999 }).expect(200)
    const s = await loginUser(t, '9876500008', 'advocate')
    await t.api().post('/api/advocate/membership/checkout').set(bearer(s.accessToken)).send({ planId }).expect(409)
  })
})

describe('admin money view', () => {
  test('dashboard totals, payments list, wallet ledger', async () => {
    const { c, id } = await quoted()
    await pay(c.tok, id)
    const d = (await t.api().get('/api/admin/dashboard').set(bearer(admin))).body.data
    assert.deepEqual([d.money.allTime.collected, d.money.allTime.commission, d.requests.active], [9440, 1600, 1])
    const p = (await t.api().get('/api/admin/payments?status=paid').set(bearer(admin))).body.data
    assert.equal(p[0].request, id)
    const tx = (await t.api().get('/api/admin/wallet-transactions?type=hold').set(bearer(admin))).body.data
    assert.equal(tx[0].hold, 6112)
  })

  test('staff cannot adjust wallets or pay withdrawals', async () => {
    await createAdmin({ email: 'staff@test.local', role: 'staff' })
    const staff = (await loginAdmin(t, 'staff@test.local')).token
    const s = await loginUser(t, '9876500100', 'client')
    await t.api().post('/api/admin/wallets/' + s.user.id + '/adjust').set(bearer(staff)).send({ amount: 100, reason: 'Trying it out' }).expect(403)
    await t.api().get('/api/admin/payments').set(bearer(staff)).expect(200)
  })
})

describe('Razorpay adapter (no network)', () => {
  test('signatures: checkout signature and webhook signature', async () => {
    const { setEnv } = await import('../src/config/env.js')
    const { razorpay } = await import('../src/providers/payments/razorpay.js')
    const base = { NODE_ENV: 'test', MONGODB_URI: 'mongodb://x', JWT_ACCESS_SECRET: 'x'.repeat(40), OTP_SECRET: 'y'.repeat(40), FILES_ENC_KEY: crypto.randomBytes(32).toString('base64') }
    setEnv({ ...base, PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 'secret123', RAZORPAY_WEBHOOK_SECRET: 'whsec' })
    const sig = crypto.createHmac('sha256', 'secret123').update('order_1|pay_1').digest('hex')
    assert.equal(razorpay.verifySignature({ orderId: 'order_1', paymentId: 'pay_1', signature: sig }), true)
    assert.equal(razorpay.verifySignature({ orderId: 'order_1', paymentId: 'pay_2', signature: sig }), false)
    const body = '{"event":"payment.captured"}'
    assert.equal(razorpay.verifyWebhook(body, crypto.createHmac('sha256', 'whsec').update(body).digest('hex')), true)
    assert.equal(razorpay.verifyWebhook(body + ' ', crypto.createHmac('sha256', 'whsec').update(body).digest('hex')), false)
    assert.throws(() => setEnv({ ...base, PAYMENT_PROVIDER: 'razorpay' }), /RAZORPAY_KEY_ID/)
    assert.throws(() => setEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://x.in', SMS_PROVIDER: 'disabled', PAYMENT_PROVIDER: 'sandbox' }), /development only/)
  })
})
