import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { bearer, clearDb, createAdmin, loginAdmin, startTestServer } from './helpers.js'

let t
let token
before(async () => (t = await startTestServer()))
after(async () => t.stop())
beforeEach(async () => {
  await clearDb()
  await createAdmin()
  token = (await loginAdmin(t)).token
})

const { AuditLog } = await import('../src/modules/audit/auditLog.model.js')
const { Category } = await import('../src/modules/categories/category.model.js')
const { SOW_CATEGORIES } = await import('../src/modules/categories/sowCategories.js')

describe('settings', () => {
  test('defaults follow the scope: 20% commission, 18% GST, 7 days; undecided values empty', async () => {
    const r = await t.api().get('/api/admin/settings').set(bearer(token)).expect(200)
    const s = r.body.data
    assert.equal(s.commissionPercent, 20)
    assert.equal(s.gstPercent, 18)
    assert.equal(s.autoConfirmDays, 7)
    assert.equal(s.walletMaxUsePercent, null)
    assert.equal(s.supportWhatsApp, '')
    assert.deepEqual(s.referral, { enabled: false, rewardType: null, rewardValue: null, monthlyCap: null })
  })

  test('update converts units, shows in /meta, and is audited with before/after', async () => {
    await t.api().patch('/api/admin/settings').set(bearer(token)).send({ commissionPercent: 17.5, supportWhatsApp: '919876543210' }).expect(200)
    const meta = await t.api().get('/api/meta').expect(200)
    assert.equal(meta.body.data.rates.commission, 0.175)
    assert.equal(meta.body.data.rates.gst, 0.18)
    assert.equal(meta.body.data.supportWhatsApp, '919876543210')
    const log = await AuditLog.findOne({ action: 'settings.updated' }).lean()
    assert.deepEqual(log.before, { commissionBp: 2000, supportWhatsApp: '' })
    assert.deepEqual(log.after, { commissionBp: 1750, supportWhatsApp: '919876543210' })
  })

  test('saving without changes writes no audit entry', async () => {
    await t.api().patch('/api/admin/settings').set(bearer(token)).send({ commissionPercent: 20 }).expect(200)
    assert.equal(await AuditLog.countDocuments(), 0)
  })

  test('invalid values are refused', async () => {
    for (const body of [{ commissionPercent: 101 }, { commissionPercent: -1 }, { gstPercent: 18.555 }, { autoConfirmDays: 0 }, { supportWhatsApp: '+91 98765' }, { unknownField: 1 }]) {
      await t.api().patch('/api/admin/settings').set(bearer(token)).send(body).expect(422)
    }
  })

  test('referrals cannot be switched on before the reward is set', async () => {
    await t.api().patch('/api/admin/settings').set(bearer(token)).send({ referral: { enabled: true } }).expect(400)
    const r = await t.api().patch('/api/admin/settings').set(bearer(token)).send({ referral: { enabled: true, rewardType: 'flat', rewardValue: 150, monthlyCap: 1500 } }).expect(200)
    assert.deepEqual(r.body.data.referral, { enabled: true, rewardType: 'flat', rewardValue: 150, monthlyCap: 1500 })
    const meta = await t.api().get('/api/meta').expect(200)
    assert.equal(meta.body.data.referralOn, true)
  })
})

describe('categories', () => {
  const seed = () => Category.insertMany(SOW_CATEGORIES.map((c, i) => ({ ...c, order: i })))

  test('meta lists active categories in order, in the shape the apps use', async () => {
    await seed()
    const list = (await t.api().get('/api/admin/categories').set(bearer(token)).expect(200)).body.data
    const notary = list.find((c) => c.key === 'notary')
    await t.api().patch('/api/admin/categories/' + notary.id).set(bearer(token)).send({ active: false }).expect(200)
    const meta = (await t.api().get('/api/meta').expect(200)).body.data
    assert.deepEqual(
      meta.categories.map((c) => c.key),
      ['criminal', 'civil', 'matrimonial', 'accident', 'consumer', 'other'],
    )
    assert.deepEqual(Object.keys(meta.categories[0]).sort(), ['commission', 'covers', 'docs', 'gstOnService', 'key', 'long', 'name', 'short'])
  })

  test('create, then the key cannot change and cannot be reused', async () => {
    const c = await t.api().post('/api/admin/categories').set(bearer(token)).send({ key: 'tax', name: 'Tax lawyer', short: 'Tax' }).expect(201)
    assert.equal(c.body.data.active, true)
    await t.api().patch('/api/admin/categories/' + c.body.data.id).set(bearer(token)).send({ key: 'other' }).expect(422)
    await t.api().post('/api/admin/categories').set(bearer(token)).send({ key: 'tax', name: 'Tax 2', short: 'Tax' }).expect(409)
    await t.api().post('/api/admin/categories').set(bearer(token)).send({ key: 'Bad Key', name: 'Bad', short: 'Bad' }).expect(422)
  })

  test('per-category commission: super admin only, shown to the apps as a fraction', async () => {
    await seed()
    const civil = (await t.api().get('/api/admin/categories').set(bearer(token))).body.data.find((c) => c.key === 'civil')
    await t.api().patch('/api/admin/categories/' + civil.id).set(bearer(token)).send({ commissionPercent: 15 }).expect(200)
    const meta = (await t.api().get('/api/meta')).body.data
    assert.equal(meta.categories.find((c) => c.key === 'civil').commission, 0.15)
    assert.equal(meta.categories.find((c) => c.key === 'criminal').commission, null)

    await createAdmin({ email: 'staff@test.local', role: 'staff' })
    const staff = (await loginAdmin(t, 'staff@test.local')).token
    await t.api().patch('/api/admin/categories/' + civil.id).set(bearer(staff)).send({ commissionPercent: 5 }).expect(400)
    await t.api().patch('/api/admin/categories/' + civil.id).set(bearer(staff)).send({ name: 'Civil & property lawyer' }).expect(200)
  })

  test('reorder needs every id exactly once and is applied in a transaction', async () => {
    await seed()
    const list = (await t.api().get('/api/admin/categories').set(bearer(token))).body.data
    const ids = list.map((c) => c.id).reverse()
    await t.api().put('/api/admin/categories/order').set(bearer(token)).send({ ids: ids.slice(1) }).expect(400)
    await t.api().put('/api/admin/categories/order').set(bearer(token)).send({ ids: [ids[0], ...ids.slice(0, -1)] }).expect(400)
    const r = await t.api().put('/api/admin/categories/order').set(bearer(token)).send({ ids }).expect(200)
    assert.equal(r.body.data[0].key, 'other')
    assert.equal(await AuditLog.countDocuments({ action: 'category.reordered' }), 1)
  })

  test('the audit log endpoint lists changes newest first with paging', async () => {
    await t.api().post('/api/admin/categories').set(bearer(token)).send({ key: 'tax', name: 'Tax lawyer', short: 'Tax' }).expect(201)
    await t.api().patch('/api/admin/settings').set(bearer(token)).send({ autoConfirmDays: 5 }).expect(200)
    const r = await t.api().get('/api/admin/audit-logs?limit=1').set(bearer(token)).expect(200)
    assert.equal(r.body.data[0].action, 'settings.updated')
    assert.deepEqual(r.body.meta, { page: 1, limit: 1, total: 2, pages: 2 })
  })
})
