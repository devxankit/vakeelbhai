import { withTransaction } from '../../config/db.js'
import { conflict, notFound } from '../../utils/errors.js'
import { toRupees } from '../../utils/money.js'
import { toAdmins, toUser } from '../../realtime/io.js'
import { challanProvider } from '../../providers/challan/index.js'
import { Payment } from '../payments/payment.models.js'
import { refundPayment } from '../payments/payment.service.js'
import { notifyUser } from '../notifications/notifications.js'
import { ChallanLock, ChallanOrder, prettyPlate } from './challan.models.js'

const iso = (d) => (d ? new Date(d).toISOString() : null)

export const vehicleView = (v) => ({ id: String(v._id), plate: v.plate, number: prettyPlate(v.plate), type: v.type, addedAt: iso(v.createdAt) })

const itemView = (c) => ({ id: c.challanNo, offence: c.offence, amount: toRupees(c.amountPaise), date: c.date, place: c.place, court: !!c.court })

/** What the client sees of an order. "Paid to Vakeel Bhai" (processing) and "paid to the department" (completed) are separate steps. */
export function orderView(o) {
  return {
    id: o.number,
    vehicle: { plate: o.vehicle.plate, number: prettyPlate(o.vehicle.plate), type: o.vehicle.type },
    items: o.items.map(itemView),
    amounts: { challans: toRupees(o.amounts.challanPaise), fee: toRupees(o.amounts.feePaise), gst: toRupees(o.amounts.gstPaise), total: toRupees(o.amounts.totalPaise), gstPercent: (o.rates?.gstBp ?? 0) / 100 },
    status: o.status,
    payWithinHours: o.rates?.payHours ?? 24,
    paidAt: iso(o.paidAt),
    dueBy: iso(o.dueBy),
    completedAt: iso(o.completedAt),
    departmentRef: o.departmentRef ?? null,
    note: o.note ?? null,
    createdAt: iso(o.createdAt),
  }
}

/**
 * A vehicle's challans from the provider, each marked with where it stands on our side:
 *   due         not paid through Vakeel Bhai (the client can pay it)
 *   processing  paid to Vakeel Bhai; our team is paying the department
 *   paid        paid to the department by Vakeel Bhai
 *   (awaiting_payment = someone's open checkout: shown as due to its owner, who can start again)
 */
export async function challansForVehicle(vehicle, userId) {
  const live = await challanProvider().lookup({ plate: vehicle.plate, type: vehicle.type })
  const locks = await ChallanLock.find({ _id: { $in: live.map((c) => c.challanNo) } }).populate('order', 'number status user').lean()
  const lockOf = new Map(locks.map((l) => [l._id, l.order]))
  return live.map((c) => {
    const o = lockOf.get(c.challanNo)
    let state = 'due'
    if (o?.status === 'processing') state = 'processing'
    else if (o?.status === 'completed') state = 'paid'
    else if (o?.status === 'awaiting_payment' && String(o.user) !== String(userId)) state = 'processing'
    return { ...itemView(c), state, order: o && state !== 'due' && String(o.user) === String(userId) ? o.number : null }
  })
}

function notify(o) {
  toUser(o.user, 'challan:update', { number: o.number })
  toAdmins('challan:update', { number: o.number })
}

/** Our team paid the department: record its receipt number. */
export async function completeChallanOrder(number, { adminId, departmentRef, note }) {
  const o = await ChallanOrder.findOneAndUpdate({ number, status: 'processing' }, { $set: { status: 'completed', completedAt: new Date(), departmentRef, note, handledBy: adminId } }, { new: true })
  if (!o) throw conflict('Only paid orders waiting for the department can be completed', 'BAD_STATE')
  notify(o)
  notifyUser(o.user, 'e-Challan paid', 'Your challan for ' + prettyPlate(o.vehicle.plate) + ' was paid to the department. Receipt no. ' + departmentRef + '.', { kind: 'challan', id: o.number })
  return o
}

/** It could not be paid to the department: full refund to the client, and the challans become payable again. */
export async function refundChallanOrder(number, { adminId, reason }) {
  const o = await ChallanOrder.findOne({ number })
  if (!o) throw notFound('e-Challan order')
  if (o.status !== 'processing') throw conflict('Only paid orders that are not yet completed can be refunded', 'BAD_STATE')
  const p = await Payment.findById(o.payment)
  if (!p) throw notFound('Payment')
  await refundPayment(p, { adminId, reason })
  await withTransaction(async (session) => {
    await ChallanOrder.updateOne({ _id: o._id, status: 'processing' }, { $set: { status: 'refunded', note: reason, handledBy: adminId } }, { session })
    await ChallanLock.deleteMany({ order: o._id }, { session })
  })
  const after = await ChallanOrder.findById(o._id)
  notify(after)
  notifyUser(o.user, 'e-Challan refunded', 'We could not pay the challan for ' + prettyPlate(o.vehicle.plate) + '. ₹' + toRupees(o.amounts.totalPaise).toLocaleString('en-IN') + ' is being refunded: ' + reason, { kind: 'challan', id: o.number })
  return after
}
