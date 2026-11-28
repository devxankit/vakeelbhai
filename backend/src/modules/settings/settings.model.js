import mongoose from 'mongoose'

/**
 * Admin-controlled business settings: a single document (_id "global").
 * Rates are basis points (2000 = 20%). Money is paise.
 *
 * Defaults come from docs/SCOPE-OF-WORK.md. Values the client has not confirmed yet are
 * left empty or switched off (referral reward, wallet cap, WhatsApp number) rather than invented.
 * Every change is written to the audit log with before/after values, and each paid request
 * will store the rates that applied when it was paid (Phase 4), so history never changes.
 */
const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'global' },
    /** Platform commission on the (discounted) service fee. SOW: 20%. */
    commissionBp: { type: Number, default: 2000, min: 0, max: 10000 },
    /** GST rate. Working-scope default 18%; the client's CA must confirm the treatment. */
    gstBp: { type: Number, default: 1800, min: 0, max: 10000 },
    /** Days after "work done" before a request confirms automatically. Scope default 7. */
    autoConfirmDays: { type: Number, default: 7, min: 1, max: 90 },
    /** How long an advocate's fee quote stays valid. The UI shows 7 days. */
    quoteValidityDays: { type: Number, default: 7, min: 1, max: 90 },
    /** Max share of an order the client wallet may pay (bp). null = no cap. Not decided yet. */
    walletMaxUseBp: { type: Number, default: null, min: 0, max: 10000 },
    /** Smallest advocate withdrawal (paise). null = no minimum. Not decided yet. */
    minWithdrawalPaise: { type: Number, default: null, min: 0 },
    /** Support WhatsApp number, digits with country code. Empty until the client provides it. */
    supportWhatsApp: { type: String, default: '', match: /^(|\d{10,15})$/ },
    /**
     * e-Challan (SCOPE-OF-WORK 9): Vakeel Bhai pays the challan for the client and charges
     * this amount per challan (paise) plus GST on it. null = not decided yet; checkout stays
     * closed until the admin sets it.
     */
    challanFeePaise: { type: Number, default: null, min: 0 },
    /** Promise shown to the client: the challan is paid to the department within this many hours. */
    challanPayHours: { type: Number, default: 24, min: 1, max: 240 },
    /** Business details printed on GST invoices. The GSTIN is empty until the client provides it. */
    invoice: {
      legalName: { type: String, trim: true, maxlength: 120, default: 'Vakeel Bhai' },
      gstin: { type: String, trim: true, uppercase: true, default: '', match: /^(|[0-9A-Z]{15})$/ },
      address: { type: String, trim: true, maxlength: 300, default: '' },
      email: { type: String, trim: true, maxlength: 120, default: '' },
    },
    referral: {
      enabled: { type: Boolean, default: false },
      /** 'flat' (paise) or 'percent' (bp of the first paid service fee). Not decided yet. */
      rewardType: { type: String, enum: ['flat', 'percent'], default: null },
      rewardValue: { type: Number, default: null, min: 0 },
      monthlyCapPaise: { type: Number, default: null, min: 0 },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true, minimize: false },
)

export const Settings = mongoose.model('Settings', settingsSchema)
