import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { applyBp, bpToFraction, percentToBp, toPaise, toRupees } from '../src/utils/money.js'

describe('money units', () => {
  test('rupees <-> paise without float drift', () => {
    assert.equal(toPaise(0.1 + 0.2), 30)
    assert.equal(toPaise(4500), 450000)
    assert.equal(toRupees(343800), 3438)
  })

  test('percent <-> basis points', () => {
    assert.equal(percentToBp(20), 2000)
    assert.equal(percentToBp(17.5), 1750)
    assert.equal(bpToFraction(1800), 0.18)
  })

  test('matches the app rule: ₹4,500 → commission ₹900, GST on it ₹162, net ₹3,438', () => {
    const base = toPaise(4500)
    const commission = applyBp(base, 2000)
    const gst = applyBp(commission, 1800)
    assert.equal(commission, 90000)
    assert.equal(gst, 16200)
    assert.equal(base - commission - gst, 343800)
  })

  test('rounds half away from zero to the paisa', () => {
    assert.equal(applyBp(1, 5000), 1) // 0.5 paise -> 1
    assert.equal(applyBp(-1, 5000), -1)
    assert.equal(applyBp(333, 1800), 60) // 59.94 -> 60
  })

  test('refuses non-integer input', () => {
    assert.throws(() => applyBp(10.5, 100))
  })
})
