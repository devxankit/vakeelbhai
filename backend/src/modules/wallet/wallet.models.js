import mongoose from 'mongoose'

/**
 * Wallets (SOW 7, SCOPE-OF-WORK 6). One per user. Amounts in paise.
 *   balance   spendable (client) / withdrawable (advocate)
 *   hold      advocate only: earnings for paid cases, waiting for the client to confirm
 *   lifetime  advocate only: total ever credited from completed cases
 * A wallet NEVER changes without a WalletTransaction written in the same DB transaction
 * (see wallet.service.js). Balances cannot go below zero (enforced in the update filter).
 */
const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    role: { type: String, enum: ['client', 'advocate'], required: true },
    balancePaise: { type: Number, default: 0, min: 0 },
    holdPaise: { type: Number, default: 0, min: 0 },
    lifetimePaise: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
)

export const Wallet = mongoose.model('Wallet', walletSchema)

export const TX_TYPES = [
  'spend', // client: wallet used at checkout
  'spend_release', // client: checkout cancelled or failed, wallet amount returned
  'refund', // client: refund of a wallet-paid amount after a dispute
  'hold', // advocate: client paid, net amount on hold
  'hold_release', // advocate: hold removed (refund to client)
  'earn', // advocate: hold moved to balance on completion
  'withdraw', // advocate: withdrawal requested (balance reserved)
  'withdraw_reversal', // advocate: withdrawal rejected, money back
  'adjustment', // admin correction, with a reason
  'referral', // client: referral reward (Phase 4b)
  'cashback', // client: offer cashback (Phase 4b)
]

const lineSchema = new mongoose.Schema({ k: String, paise: Number }, { _id: false })

const walletTxSchema = new mongoose.Schema(
  {
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TX_TYPES, required: true },
    /** Change to the spendable balance (signed). */
    amountPaise: { type: Number, required: true },
    /** Change to the hold (signed). */
    holdPaise: { type: Number, default: 0 },
    balanceAfterPaise: { type: Number, required: true },
    holdAfterPaise: { type: Number, required: true },
    title: { type: String, required: true },
    sub: { type: String, default: '' },
    /** Breakdown shown in the app (commission, GST on commission...). */
    lines: { type: [lineSchema], default: [] },
    ref: { kind: String, id: String },
    status: { type: String, default: '' },
    /** Unique per real-world event, so retries and duplicate webhooks never post twice. */
    key: { type: String, required: true, unique: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

walletTxSchema.index({ user: 1, createdAt: -1 })
walletTxSchema.index({ type: 1, createdAt: -1 })

export const WalletTransaction = mongoose.model('WalletTransaction', walletTxSchema)
