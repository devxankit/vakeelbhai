import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { advocatePayout, clientBill, membershipTotal, ratesFor } from '../src/modules/pricing/pricing.js'

/** The same cases as mobile-app/__tests__/money.test.ts, in paise. The app and the server must agree. */
const R = (x) => Math.round(x * 100)
const DEFAULT = { commissionBp: 2000, gstBp: 1800 }

describe('pricing engine (parity with the app)', () => {
  test('client bill: GST after discount, then wallet (₹5,000 − ₹500, wallet ₹150 → ₹5,160)', () => {
    const b = clientBill({ feePaise: R(5000), discountPaise: R(500), gstBp: 1800, walletAvailablePaise: R(150), useWallet: true })
    assert.equal(b.basePaise, R(4500))
    assert.equal(b.gstPaise, R(810))
    assert.equal(b.totalPaise, R(5160))
  })

  test('no GST on the service when the category does not charge it', () => {
    assert.equal(clientBill({ feePaise: R(1000), gstOnService: false, gstBp: 1800 }).totalPaise, R(1000))
  })

  test('wallet never exceeds the bill', () => {
    const b = clientBill({ feePaise: R(100), gstOnService: false, gstBp: 1800, walletAvailablePaise: R(500), useWallet: true })
    assert.equal(b.walletPaise, R(100))
    assert.equal(b.totalPaise, 0)
  })

  test('wallet is ignored unless the client chooses it', () => {
    assert.equal(clientBill({ feePaise: R(100), gstBp: 1800, walletAvailablePaise: R(500) }).walletPaise, 0)
  })

  test('admin wallet cap limits the share of the order', () => {
    const b = clientBill({ feePaise: R(1000), gstOnService: false, gstBp: 1800, walletAvailablePaise: R(900), useWallet: true, walletMaxUseBp: 1000 })
    assert.equal(b.walletPaise, R(100))
    assert.equal(b.totalPaise, R(900))
  })

  test('advocate payout: 20% commission plus 18% GST on it (₹4,500 → ₹3,438)', () => {
    const p = advocatePayout(R(4500), DEFAULT)
    assert.equal(p.commissionPaise, R(900))
    assert.equal(p.gstOnCommissionPaise, R(162))
    assert.equal(p.netPaise, R(3438))
  })

  test('custom commission rate from the admin (15% of ₹10,000 → ₹8,230)', () => {
    assert.equal(advocatePayout(R(10000), { commissionBp: 1500, gstBp: 1800 }).netPaise, R(8230))
  })

  test('membership GST (₹1,000 → ₹1,180)', () => {
    assert.equal(membershipTotal(R(1000), 1800).totalPaise, R(1180))
  })

  test('category override beats the global rate', () => {
    assert.deepEqual(ratesFor({ commissionBp: 1500 }, { commissionBp: 2000, gstBp: 1800 }), { commissionBp: 1500, gstBp: 1800 })
    assert.deepEqual(ratesFor({ commissionBp: null }, { commissionBp: 2000, gstBp: 1800 }), { commissionBp: 2000, gstBp: 1800 })
  })

  test('amounts always add up, to the paisa, for awkward fees', () => {
    for (const fee of [101, 333, 999, 1234.56, 7777.77, 12345]) {
      const b = clientBill({ feePaise: R(fee), discountPaise: R(fee / 7), gstBp: 1800 })
      assert.equal(b.basePaise + b.gstPaise, b.totalPaise)
      const p = advocatePayout(b.basePaise, DEFAULT)
      assert.equal(p.commissionPaise + p.gstOnCommissionPaise + p.netPaise, b.basePaise)
      assert.ok(Number.isInteger(p.netPaise))
    }
  })
})
