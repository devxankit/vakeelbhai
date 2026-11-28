import { conflict } from '../../utils/errors.js'
import { toRupees } from '../../utils/money.js'
import { Wallet, WalletTransaction } from './wallet.models.js'

export async function getWallet(userId, role, session) {
  return Wallet.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId, role } }, { upsert: true, new: true, setDefaultsOnInsert: true, session })
}

/**
 * Change a wallet and record why, atomically. MUST be called inside withTransaction().
 *   amount: change to balance (signed) · hold: change to hold (signed) · lifetime: add to lifetime
 *   key: unique id of the real-world event; posting the same key twice returns the first entry.
 * Throws 409 INSUFFICIENT_BALANCE if a debit would take balance or hold below zero.
 */
export async function post(session, { userId, role, type, amount = 0, hold = 0, lifetime = 0, title, sub = '', lines = [], ref, status = '', key }) {
  if (!session) throw new Error('wallet.post needs a transaction session')
  const done = await WalletTransaction.findOne({ key }).session(session)
  if (done) return done
  await getWallet(userId, role, session)
  const filter = { user: userId }
  if (amount < 0) filter.balancePaise = { $gte: -amount }
  if (hold < 0) filter.holdPaise = { $gte: -hold }
  const w = await Wallet.findOneAndUpdate(filter, { $inc: { balancePaise: amount, holdPaise: hold, lifetimePaise: lifetime } }, { new: true, session })
  if (!w) throw conflict('Not enough wallet balance', 'INSUFFICIENT_BALANCE')
  const [tx] = await WalletTransaction.create(
    [{ wallet: w._id, user: userId, type, amountPaise: amount, holdPaise: hold, balanceAfterPaise: w.balancePaise, holdAfterPaise: w.holdPaise, title, sub, lines, ref, status, key }],
    { session },
  )
  return tx
}

/** In the app's WalletTx shape: rupees, signed amount, breakdown lines. */
export function txView(t) {
  return {
    id: String(t._id),
    type: t.type,
    title: t.title,
    sub: t.sub,
    amount: toRupees(t.amountPaise),
    hold: toRupees(t.holdPaise),
    at: t.createdAt,
    status: t.status,
    lines: t.lines.map((l) => ({ k: l.k, v: toRupees(l.paise) })),
    ref: t.ref?.id ?? null,
  }
}

export function walletView(w) {
  return { balance: toRupees(w.balancePaise), hold: toRupees(w.holdPaise), lifetime: toRupees(w.lifetimePaise) }
}
