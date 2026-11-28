import { Category } from '../categories/category.model.js'
import { badRequest } from '../../utils/errors.js'
import { AdvocateDocument, AdvocateProfile, DOC_KEYS, DOC_TITLES } from './advocate.models.js'
import { activeMembership, latestMembership } from '../membership/membership.model.js'

/** The advocate's membership card data: plan, member ID, validity; null before the first membership. */
export async function membershipSummary(userId) {
  const [active, latest] = await Promise.all([activeMembership(userId), latestMembership(userId)])
  const m = active ?? latest
  if (!m) return null
  return { active: !!active, planName: m.planName, memberId: m.memberId, startAt: m.startAt, endAt: (latest ?? m).endAt }
}

export async function getOrCreateProfile(userId, session) {
  return AdvocateProfile.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId } }, { upsert: true, new: true, setDefaultsOnInsert: true, session })
}

/** Practice areas must be active category keys. */
export async function checkPractice(keys) {
  if (!keys) return
  const found = await Category.find({ key: { $in: keys }, active: true }).select('key').lean()
  const ok = new Set(found.map((c) => c.key))
  const bad = keys.filter((k) => !ok.has(k))
  if (bad.length) throw badRequest('Unknown practice area: ' + bad.join(', '))
}

/** What is still missing before the profile can be submitted. */
export function missingForSubmit(user, profile, docs) {
  const m = []
  if (!user.name) m.push('name')
  if (!user.email) m.push('email')
  if (!profile.address) m.push('address')
  if (!profile.state) m.push('state')
  if (!profile.district) m.push('district')
  if (!profile.practice?.length) m.push('practice')
  if (profile.experienceYears == null) m.push('experienceYears')
  if (!profile.courts) m.push('courts')
  if (!profile.enrolmentNumber) m.push('enrolmentNumber')
  if (!profile.photo) m.push('photo')
  const have = new Set(docs.map((d) => d.key))
  for (const k of DOC_KEYS) if (!have.has(k)) m.push('document:' + k)
  return m
}

export function docsView(docs) {
  const by = Object.fromEntries(docs.map((d) => [d.key, d]))
  return DOC_KEYS.map((key) => {
    const d = by[key]
    return { key, title: DOC_TITLES[key], status: d ? d.status : 'missing', note: d?.note ?? null, uploadedAt: d?.file?.uploadedAt ?? null, version: d?.version ?? 0 }
  })
}

/** The advocate's own view of their registration. */
export async function ownView(user) {
  const [profile, docs] = await Promise.all([getOrCreateProfile(user._id), AdvocateDocument.find({ user: user._id })])
  return {
    user: user.toPublic(),
    address: profile.address,
    state: profile.state,
    district: profile.district,
    practice: profile.practice,
    experienceYears: profile.experienceYears,
    courts: profile.courts,
    enrolmentNumber: profile.enrolmentNumber,
    hasPhoto: !!profile.photo,
    verification: { status: profile.verification.status, submittedAt: profile.verification.submittedAt ?? null, reviewedAt: profile.verification.reviewedAt ?? null, reason: profile.verification.reason ?? null },
    documents: docsView(docs),
    missing: missingForSubmit(user, profile, docs),
    membership: await membershipSummary(user._id),
  }
}
