import path from 'node:path'
import PDFDocument from 'pdfkit'
import { Router } from 'express'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { requireAdmin, requireUser } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { conflict, notFound, unauthorized } from '../../utils/errors.js'
import { hmac, safeEqualHex } from '../../utils/crypto.js'
import { ok } from '../../utils/http.js'
import { toRupees } from '../../utils/money.js'
import { getSettings } from '../settings/settings.service.js'
import { User } from '../users/user.model.js'
import { ClientProfile } from '../clients/clientProfile.model.js'
import { ServiceRequest } from '../requests/request.models.js'
import { ChallanOrder, prettyPlate } from '../challans/challan.models.js'
import { GstFiling } from '../gstfiling/gstfiling.models.js'
import { Payment } from '../payments/payment.models.js'

/**
 * GST invoices (SCOPE-OF-WORK 10): a PDF for every paid payment, numbered VB/<FY>/<n> at
 * payment time. The layout follows the usual tax-invoice fields; the GST treatment
 * (and the platform GSTIN, set in admin settings) must be confirmed by the client's CA.
 */
const FONT = path.resolve(import.meta.dirname, '../../../assets/fonts/NotoSans-Regular.ttf')
const BOLD = path.resolve(import.meta.dirname, '../../../assets/fonts/NotoSans-Bold.ttf')
const money = (p) => '₹' + toRupees(p).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** The lines and parties of an invoice for one payment. */
async function invoiceData(p) {
  const [settings, user] = await Promise.all([getSettings(), User.findById(p.user).lean()])
  const prof = user?.role === 'client' ? await ClientProfile.findOne({ user: user._id }).lean() : null
  const gstPct = (p.rates?.gstBp ?? settings.gstBp) / 100
  const lines = []
  let subject = ''
  if (p.purpose === 'service') {
    const r = await ServiceRequest.findById(p.request).select('number category').lean()
    subject = 'Legal service · request ' + (r?.number ?? '')
    lines.push(['Advocate fee (' + (r?.category ?? 'legal service') + ')', p.amounts.feePaise])
    if (p.amounts.discountPaise) lines.push(['Offer' + (p.offer?.code ? ' ' + p.offer.code : ''), -p.amounts.discountPaise])
    lines.push(['Taxable value', p.amounts.basePaise, true])
    lines.push(['GST ' + gstPct + '%', p.amounts.gstPaise])
  } else if (p.purpose === 'membership') {
    subject = 'Advocate membership · ' + (p.planName ?? '')
    lines.push([(p.planName ?? 'Membership') + ' plan (' + (p.planMonths ?? '') + ' months)', p.amounts.feePaise])
    if (p.amounts.discountPaise) lines.push(['Offer' + (p.offer?.code ? ' ' + p.offer.code : ''), -p.amounts.discountPaise])
    lines.push(['Taxable value', p.amounts.basePaise, true])
    lines.push(['GST ' + gstPct + '%', p.amounts.gstPaise])
  } else if (p.purpose === 'challan') {
    const o = await ChallanOrder.findById(p.challanOrder).lean()
    subject = 'e-Challan payment ' + (o?.number ?? '') + ' · ' + (o ? prettyPlate(o.vehicle.plate) : '')
    for (const c of o?.items ?? []) lines.push(['Challan ' + c.challanNo + ' · ' + c.offence + ' (paid to the department, no GST)', c.amountPaise])
    lines.push(['Vakeel Bhai service charge (taxable)', o?.amounts.feePaise ?? 0, true])
    lines.push(['GST ' + gstPct + '% on the service charge', p.amounts.gstPaise])
  } else if (p.purpose === 'gst') {
    const g = await GstFiling.findById(p.gstFiling).lean()
    subject = 'GST filing assistance · ' + (g?.number ?? '') + ' · ' + (g?.returnType ?? '')
    lines.push(['GST filing service fee', p.amounts.basePaise, true])
    lines.push(['GST ' + gstPct + '%', p.amounts.gstPaise])
  }
  return { settings, user, city: [prof?.city, prof?.state].filter(Boolean).join(', '), lines, subject }
}

export async function invoicePdf(p) {
  const d = await invoiceData(p)
  const inv = d.settings.invoice ?? {}
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Invoice ' + p.invoiceNo, Author: inv.legalName || 'Vakeel Bhai' } })
  doc.registerFont('r', FONT)
  doc.registerFont('b', BOLD)
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))))

  doc.font('b').fontSize(20).fillColor('#0E0E0E').text(inv.legalName || 'Vakeel Bhai')
  doc.font('r').fontSize(9.5).fillColor('#5F5B53')
  if (inv.address) doc.text(inv.address)
  doc.text('GSTIN: ' + (inv.gstin || 'to be added'))
  if (inv.email) doc.text(inv.email)
  doc.moveUp(inv.address ? 3 : 2)
  doc.font('b').fontSize(14).fillColor('#B8862B').text('TAX INVOICE', { align: 'right' })
  doc.font('r').fontSize(9.5).fillColor('#0E0E0E').text('Invoice no. ' + p.invoiceNo, { align: 'right' }).text('Date ' + day(p.paidAt), { align: 'right' }).text('Payment ' + p.number, { align: 'right' })
  doc.moveDown(2)

  doc.font('b').fontSize(10).text('Billed to')
  doc.font('r').fontSize(10).text(d.user?.name || 'Customer').text('+91 ' + (d.user?.phone ?? ''))
  if (d.user?.email) doc.text(d.user.email)
  if (d.city) doc.text(d.city)
  doc.moveDown(1)
  doc.font('b').text(d.subject)
  doc.moveDown(0.6)

  const x0 = 48
  const x1 = 547
  let y = doc.y
  doc.moveTo(x0, y).lineTo(x1, y).strokeColor('#E4DFD3').stroke()
  y += 8
  for (const [label, paise, strong] of d.lines) {
    doc.font(strong ? 'b' : 'r').fontSize(10).fillColor('#0E0E0E').text(label, x0, y, { width: 360 })
    doc.text((paise < 0 ? '−' : '') + money(Math.abs(paise)), x0 + 360, y, { width: x1 - x0 - 360, align: 'right' })
    y = doc.y + 6
  }
  doc.moveTo(x0, y).lineTo(x1, y).strokeColor('#E4DFD3').stroke()
  y += 8
  const walletLine = p.amounts.walletPaise ? [['Paid from wallet', p.amounts.walletPaise]] : []
  for (const [label, paise] of walletLine) {
    doc.font('r').fontSize(10).text(label, x0, y, { width: 360 })
    doc.text(money(paise), x0 + 360, y, { width: x1 - x0 - 360, align: 'right' })
    y = doc.y + 6
  }
  doc.font('b').fontSize(12).text('Total paid', x0, y, { width: 360 })
  doc.text(money(p.amounts.totalPaise + (p.amounts.walletPaise ?? 0)), x0 + 360, y, { width: x1 - x0 - 360, align: 'right' })
  doc.moveDown(2)
  doc.font('r').fontSize(8.5).fillColor('#8A857A')
  doc.text('Paid online through ' + (p.method || p.provider) + (p.gatewayPaymentId ? ' (ref ' + p.gatewayPaymentId + ')' : '') + ' on ' + day(p.paidAt) + '.', x0)
  if (p.purpose === 'service') doc.text('Vakeel Bhai collects this fee for the advocate and holds it until the client confirms the work.')
  if (p.status === 'refunded') doc.fillColor('#B42318').text('This payment was refunded. A credit note applies.')
  doc.fillColor('#8A857A').text('This is a computer-generated invoice and does not need a signature.')
  doc.end()
  return done
}

/* ---------- download links ---------- */

const linkSecret = () => 'invoice:' + env.JWT_ACCESS_SECRET
/** A link that opens the PDF without a login, for 10 minutes (the app opens it in the browser). */
export function signedInvoicePath(number) {
  const exp = Date.now() + 10 * 60 * 1000
  return '/api/invoices/' + number + '.pdf?exp=' + exp + '&sig=' + hmac(linkSecret(), number + '|' + exp)
}

async function sendPdf(res, p) {
  if (!p.invoiceNo || !['paid', 'refunded'].includes(p.status)) throw conflict('There is no invoice for this payment', 'NO_INVOICE')
  const buf = await invoicePdf(p)
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Vakeel-Bhai-' + p.invoiceNo.replace(/\//g, '-') + '.pdf"', 'Cache-Control': 'private, no-store' })
  res.end(buf)
}

const payParam = z.object({ pay: z.string().regex(/^PAY-[A-Z0-9]{6,20}$/) })

export function invoiceRoutes() {
  const r = Router()

  /** The owner: a short-lived link to open in the browser. */
  r.get('/payments/:pay/invoice-link', requireUser(), validate({ params: payParam }), async (req, res) => {
    const p = await Payment.findOne({ number: req.valid.params.pay, user: req.auth.id }).lean()
    if (!p) throw notFound('Payment')
    if (!p.invoiceNo) throw conflict('There is no invoice for this payment', 'NO_INVOICE')
    ok(res, { path: signedInvoicePath(p.number), invoiceNo: p.invoiceNo })
  })

  r.get('/payments/:pay/invoice', requireUser(), validate({ params: payParam }), async (req, res) => {
    const p = await Payment.findOne({ number: req.valid.params.pay, user: req.auth.id }).lean()
    if (!p) throw notFound('Payment')
    await sendPdf(res, p)
  })

  r.get('/invoices/:file', validate({ params: z.object({ file: z.string().regex(/^PAY-[A-Z0-9]{6,20}\.pdf$/) }), query: z.object({ exp: z.coerce.number().int(), sig: z.string().regex(/^[a-f0-9]{64}$/) }) }), async (req, res) => {
    const number = req.valid.params.file.replace(/\.pdf$/, '')
    const { exp, sig } = req.valid.query
    if (exp < Date.now() || !safeEqualHex(hmac(linkSecret(), number + '|' + exp), sig)) throw unauthorized('This invoice link has expired. Open it again from the app.', 'LINK_EXPIRED')
    const p = await Payment.findOne({ number }).lean()
    if (!p) throw notFound('Payment')
    await sendPdf(res, p)
  })

  r.get('/admin/payments/:pay/invoice', requireAdmin(), validate({ params: payParam }), async (req, res) => {
    const p = await Payment.findOne({ number: req.valid.params.pay }).lean()
    if (!p) throw notFound('Payment')
    await sendPdf(res, p)
  })

  /** The owner's paid payments with invoices (app: My invoices). */
  r.get('/invoices', requireUser(), async (req, res) => {
    const list = await Payment.find({ user: req.auth.id, invoiceNo: { $exists: true } }).sort({ paidAt: -1 }).limit(200).lean()
    ok(res, list.map((p) => ({ payment: p.number, invoiceNo: p.invoiceNo, purpose: p.purpose, total: toRupees(p.amounts.totalPaise + (p.amounts.walletPaise ?? 0)), gst: toRupees(p.amounts.gstPaise), paidAt: p.paidAt, status: p.status })))
  })

  return r
}
