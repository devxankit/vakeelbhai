import { bpToFraction, bpToPercent, percentToBp, toPaise, toRupees } from '../../utils/money.js'
import { Settings } from './settings.model.js'

/** The one settings document, created with the scope defaults the first time it is read. */
export async function getSettings(session) {
  const s = await Settings.findOneAndUpdate({ _id: 'global' }, { $setOnInsert: { _id: 'global' } }, { upsert: true, new: true, setDefaultsOnInsert: true, session })
  return s
}

/** Admin view: percentages and rupees, as typed in the admin panel. */
export function toAdminView(s) {
  const r = s.referral ?? {}
  return {
    commissionPercent: bpToPercent(s.commissionBp),
    gstPercent: bpToPercent(s.gstBp),
    autoConfirmDays: s.autoConfirmDays,
    quoteValidityDays: s.quoteValidityDays,
    walletMaxUsePercent: s.walletMaxUseBp == null ? null : bpToPercent(s.walletMaxUseBp),
    supportWhatsApp: s.supportWhatsApp,
    minWithdrawal: s.minWithdrawalPaise == null ? null : toRupees(s.minWithdrawalPaise),
    challanFee: s.challanFeePaise == null ? null : toRupees(s.challanFeePaise),
    challanPayHours: s.challanPayHours ?? 24,
    invoice: { legalName: s.invoice?.legalName ?? 'Vakeel Bhai', gstin: s.invoice?.gstin ?? '', address: s.invoice?.address ?? '', email: s.invoice?.email ?? '' },
    referral: {
      enabled: !!r.enabled,
      rewardType: r.rewardType ?? null,
      rewardValue: r.rewardValue == null ? null : r.rewardType === 'flat' ? toRupees(r.rewardValue) : bpToPercent(r.rewardValue),
      monthlyCap: r.monthlyCapPaise == null ? null : toRupees(r.monthlyCapPaise),
    },
    updatedAt: s.updatedAt,
  }
}

/** Turn an admin PATCH (percent / rupees) into stored units (bp / paise). */
export function fromAdminPatch(p, current) {
  const out = {}
  if (p.commissionPercent !== undefined) out.commissionBp = percentToBp(p.commissionPercent)
  if (p.gstPercent !== undefined) out.gstBp = percentToBp(p.gstPercent)
  if (p.autoConfirmDays !== undefined) out.autoConfirmDays = p.autoConfirmDays
  if (p.quoteValidityDays !== undefined) out.quoteValidityDays = p.quoteValidityDays
  if (p.walletMaxUsePercent !== undefined) out.walletMaxUseBp = p.walletMaxUsePercent == null ? null : percentToBp(p.walletMaxUsePercent)
  if (p.supportWhatsApp !== undefined) out.supportWhatsApp = p.supportWhatsApp
  if (p.minWithdrawal !== undefined) out.minWithdrawalPaise = p.minWithdrawal == null ? null : toPaise(p.minWithdrawal)
  if (p.challanFee !== undefined) out.challanFeePaise = p.challanFee == null ? null : toPaise(p.challanFee)
  if (p.challanPayHours !== undefined) out.challanPayHours = p.challanPayHours
  if (p.invoice) out.invoice = { legalName: current.invoice?.legalName ?? 'Vakeel Bhai', gstin: current.invoice?.gstin ?? '', address: current.invoice?.address ?? '', email: current.invoice?.email ?? '', ...p.invoice }
  if (p.referral) {
    const cur = current.referral ?? {}
    const type = p.referral.rewardType !== undefined ? p.referral.rewardType : cur.rewardType ?? null
    const ref = {
      enabled: p.referral.enabled ?? !!cur.enabled,
      rewardType: type,
      rewardValue: cur.rewardValue ?? null,
      monthlyCapPaise: cur.monthlyCapPaise ?? null,
    }
    if (p.referral.rewardValue !== undefined) ref.rewardValue = p.referral.rewardValue == null ? null : type === 'flat' ? toPaise(p.referral.rewardValue) : percentToBp(p.referral.rewardValue)
    if (p.referral.monthlyCap !== undefined) ref.monthlyCapPaise = p.referral.monthlyCap == null ? null : toPaise(p.referral.monthlyCap)
    out.referral = ref
  }
  return out
}

/** What the apps need: same field names as the UI stores (rates as fractions, 0.2 = 20%). */
export function toPublicView(s) {
  return {
    rates: { commission: bpToFraction(s.commissionBp), gst: bpToFraction(s.gstBp) },
    autoConfirmDays: s.autoConfirmDays,
    quoteValidityDays: s.quoteValidityDays,
    walletMaxUsePercent: s.walletMaxUseBp == null ? null : bpToPercent(s.walletMaxUseBp),
    supportWhatsApp: s.supportWhatsApp,
    referralOn: !!s.referral?.enabled,
    referral: s.referral?.enabled ? { rewardType: s.referral.rewardType, reward: s.referral.rewardValue == null ? null : s.referral.rewardType === 'flat' ? toRupees(s.referral.rewardValue) : bpToPercent(s.referral.rewardValue) } : null,
    challan: { fee: s.challanFeePaise == null ? null : toRupees(s.challanFeePaise), payWithinHours: s.challanPayHours ?? 24 },
  }
}
