import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { ok } from '../../utils/http.js'
import { toRupees } from '../../utils/money.js'
import { Payment } from '../payments/payment.models.js'
import { WalletTransaction } from '../wallet/wallet.models.js'
import { ChallanOrder } from '../challans/challan.models.js'
import { User } from '../users/user.model.js'

/**
 * Reports (SCOPE-OF-WORK 10 and 12): earnings, commission, GST and memberships by month,
 * with CSV export for the accountant. Money counted at payment time (paidAt), in rupees.
 * Refunded payments are listed separately so the totals can be reconciled.
 */
const range = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
const window = (q) => {
  const to = q.to ? new Date(q.to.getTime() + 86400000) : new Date(Date.now() + 86400000)
  const from = q.from ?? new Date(to.getFullYear() - 1, to.getMonth(), 1)
  return { from, to }
}
const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s
  return /[",\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe
}
const toCsv = (head, rows) => [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
const sendCsv = (res, name, csv) => {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + name + '"', 'Cache-Control': 'no-store' })
  res.end('﻿' + csv)
}
const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')

export function reportRoutes() {
  const r = Router()
  r.use(requireAdmin())

  /** Monthly summary. */
  r.get('/summary', validate({ query: range }), async (req, res) => {
    const { from, to } = window(req.valid.query)
    const rows = await Payment.aggregate([
      { $match: { status: { $in: ['paid', 'refunded'] }, paidAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: { m: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: 'Asia/Kolkata' } }, purpose: '$purpose', refunded: { $eq: ['$status', 'refunded'] } },
          n: { $sum: 1 },
          collected: { $sum: { $add: ['$amounts.totalPaise', { $ifNull: ['$amounts.walletPaise', 0] }] } },
          base: { $sum: '$amounts.basePaise' },
          discount: { $sum: { $ifNull: ['$amounts.discountPaise', 0] } },
          gst: { $sum: '$amounts.gstPaise' },
          commission: { $sum: { $ifNull: ['$payout.commissionPaise', 0] } },
          gstOnCommission: { $sum: { $ifNull: ['$payout.gstOnCommissionPaise', 0] } },
        },
      },
    ])
    const [challanFees, credits] = await Promise.all([
      ChallanOrder.aggregate([{ $match: { status: { $in: ['processing', 'completed'] }, paidAt: { $gte: from, $lt: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: 'Asia/Kolkata' } }, fee: { $sum: '$amounts.feePaise' }, challans: { $sum: '$amounts.challanPaise' } } }]),
      WalletTransaction.aggregate([{ $match: { type: { $in: ['cashback', 'referral'] }, createdAt: { $gte: from, $lt: to } } }, { $group: { _id: { m: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Kolkata' } }, t: '$type' }, s: { $sum: '$amountPaise' } } }]),
    ])
    const months = new Map()
    const m = (k) => {
      if (!months.has(k)) months.set(k, { month: k, services: { count: 0, collected: 0, fees: 0, discounts: 0, gst: 0 }, commission: 0, gstOnCommission: 0, memberships: { count: 0, collected: 0, base: 0, gst: 0 }, challans: { count: 0, collected: 0, passedOn: 0, charges: 0, gst: 0 }, gstFiling: { count: 0, collected: 0, fees: 0, gst: 0 }, refunds: { count: 0, amount: 0 }, cashback: 0, referralRewards: 0, gstTotal: 0 })
      return months.get(k)
    }
    for (const x of rows) {
      const o = m(x._id.m)
      if (x._id.refunded) {
        o.refunds.count += x.n
        o.refunds.amount += x.collected
        continue
      }
      if (x._id.purpose === 'service') Object.assign(o.services, { count: o.services.count + x.n, collected: o.services.collected + x.collected, fees: o.services.fees + x.base, discounts: o.services.discounts + x.discount, gst: o.services.gst + x.gst }), (o.commission += x.commission), (o.gstOnCommission += x.gstOnCommission)
      if (x._id.purpose === 'membership') Object.assign(o.memberships, { count: o.memberships.count + x.n, collected: o.memberships.collected + x.collected, base: o.memberships.base + x.base, gst: o.memberships.gst + x.gst })
      if (x._id.purpose === 'challan') Object.assign(o.challans, { count: o.challans.count + x.n, collected: o.challans.collected + x.collected, gst: o.challans.gst + x.gst })
      if (x._id.purpose === 'gst') Object.assign(o.gstFiling, { count: o.gstFiling.count + x.n, collected: o.gstFiling.collected + x.collected, fees: o.gstFiling.fees + x.base, gst: o.gstFiling.gst + x.gst })
    }
    for (const c of challanFees) Object.assign(m(c._id).challans, { charges: m(c._id).challans.charges + c.fee, passedOn: m(c._id).challans.passedOn + c.challans })
    for (const c of credits) {
      if (c._id.t === 'cashback') m(c._id.m).cashback += c.s
      else m(c._id.m).referralRewards += c.s
    }
    const rupees = (o) => (typeof o === 'number' ? toRupees(o) : Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'count' ? v : rupees(v)])))
    const list = [...months.values()]
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((o) => {
        o.gstTotal = o.services.gst + o.memberships.gst + o.challans.gst + o.gstFiling.gst + o.gstOnCommission
        const { month, ...rest } = o
        return { month, ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, rupees(v)])) }
      })
    ok(res, { from, to, months: list })
  })

  /** One row per paid (or refunded) payment: the GST register for the accountant. */
  r.get('/payments.csv', validate({ query: range }), async (req, res) => {
    const { from, to } = window(req.valid.query)
    const list = await Payment.find({ status: { $in: ['paid', 'refunded'] }, paidAt: { $gte: from, $lt: to } }).sort({ paidAt: 1 }).populate('request', 'number category').populate('challanOrder', 'number').populate('gstFiling', 'number').lean()
    const users = new Map((await User.find({ _id: { $in: list.map((p) => p.user) } }).select('name phone role').lean()).map((u) => [String(u._id), u]))
    const rows = list.map((p) => {
      const u = users.get(String(p.user))
      const r2 = (x) => toRupees(x ?? 0).toFixed(2)
      return [ymd(p.paidAt), p.invoiceNo ?? '', p.number, p.purpose, p.request?.number ?? p.challanOrder?.number ?? p.gstFiling?.number ?? p.planName ?? '', p.request?.category ?? '', u?.name ?? '', u?.phone ?? '', u?.role ?? '', r2(p.amounts.feePaise), r2(p.amounts.discountPaise), r2(p.amounts.basePaise), (p.rates?.gstBp ?? 0) / 100, r2(p.amounts.gstPaise), r2(p.amounts.walletPaise), r2(p.amounts.totalPaise), r2(p.payout?.commissionPaise), r2(p.payout?.gstOnCommissionPaise), r2(p.payout?.netPaise), p.offer?.code ?? p.offer?.title ?? '', p.status, p.refund?.status ?? '']
    })
    sendCsv(res, 'vakeel-bhai-payments-' + ymd(from) + '-to-' + ymd(new Date(to.getTime() - 86400000)) + '.csv', toCsv(['Date', 'Invoice no.', 'Payment', 'Type', 'For', 'Category', 'Customer', 'Phone', 'Role', 'Fee', 'Discount', 'Taxable value', 'GST %', 'GST', 'Wallet used', 'Paid online', 'Commission', 'GST on commission', 'Advocate net', 'Offer', 'Status', 'Refund'], rows))
  })

  /** GST summary by month and type (CSV). */
  r.get('/gst.csv', validate({ query: range }), async (req, res) => {
    const { from, to } = window(req.valid.query)
    const rows = await Payment.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: from, $lt: to } } },
      { $group: { _id: { m: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: 'Asia/Kolkata' } }, p: '$purpose' }, n: { $sum: 1 }, taxable: { $sum: '$amounts.basePaise' }, gst: { $sum: '$amounts.gstPaise' }, comm: { $sum: { $ifNull: ['$payout.commissionPaise', 0] } }, gstComm: { $sum: { $ifNull: ['$payout.gstOnCommissionPaise', 0] } }, taxFromGst: { $sum: { $cond: [{ $gt: ['$rates.gstBp', 0] }, { $round: [{ $divide: [{ $multiply: ['$amounts.gstPaise', 10000] }, '$rates.gstBp'] }, 0] }, 0] } } } },
      { $sort: { '_id.m': 1, '_id.p': 1 } },
    ])
    const label = { service: 'Legal service fees', membership: 'Advocate memberships', challan: 'e-Challan service charges', gst: 'GST filing fees' }
    const out = []
    for (const x of rows) {
      out.push([x._id.m, label[x._id.p] ?? x._id.p, x.n, toRupees(x._id.p === 'challan' ? x.taxFromGst : x.taxable).toFixed(2), toRupees(x.gst).toFixed(2)])
      if (x._id.p === 'service' && x.comm) out.push([x._id.m, 'Platform commission (from advocates)', x.n, toRupees(x.comm).toFixed(2), toRupees(x.gstComm).toFixed(2)])
    }
    sendCsv(res, 'vakeel-bhai-gst-' + ymd(from) + '-to-' + ymd(new Date(to.getTime() - 86400000)) + '.csv', toCsv(['Month', 'Type', 'Transactions', 'Taxable value', 'GST'], out))
  })

  return r
}
