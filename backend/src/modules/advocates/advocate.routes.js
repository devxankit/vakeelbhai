import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireUser } from '../../middleware/auth.js'
import { singleImage } from '../../middleware/upload.js'
import { withTransaction } from '../../config/db.js'
import { badRequest, conflict, notFound } from '../../utils/errors.js'
import { ok } from '../../utils/http.js'
import { removePrivate, savePrivate, sendPrivate } from '../../providers/storage/privateFiles.js'
import { AdvocateDocument, AdvocateProfile, DOC_KEYS, VerificationEvent } from './advocate.models.js'
import { checkPractice, getOrCreateProfile, missingForSubmit, ownView } from './advocate.service.js'

const docKey = z.object({ key: z.enum(DOC_KEYS) })

const profilePatch = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(120),
    address: z.string().trim().min(5).max(300),
    state: z.string().trim().min(2).max(60),
    district: z.string().trim().min(2).max(60),
    practice: z.array(z.string().trim().min(1).max(40)).min(1).max(7),
    experienceYears: z.number().int().min(0).max(70),
    courts: z.string().trim().min(2).max(200),
    enrolmentNumber: z.string().trim().min(3).max(40),
  })
  .partial()
  .strict()

/** Advocate registration and verification, for the advocate (app and website). */
export function advocateRoutes() {
  const r = Router()
  r.use(requireUser('advocate'))

  r.get('/profile', async (req, res) => ok(res, await ownView(req.auth.user)))

  /** Details can be edited while the profile is a draft. After that only the email (for invoices) can change. */
  r.patch('/profile', validate({ body: profilePatch }), async (req, res) => {
    const p = req.valid.body
    const profile = await getOrCreateProfile(req.auth.user._id)
    if (profile.verification.status !== 'draft') {
      const locked = Object.keys(p).filter((k) => k !== 'email')
      if (locked.length) throw conflict('Your details are with our verification team and cannot be changed now: ' + locked.join(', '), 'PROFILE_LOCKED')
    }
    if (p.practice) {
      p.practice = [...new Set(p.practice)]
      await checkPractice(p.practice)
    }
    const { name, email, ...rest } = p
    const user = req.auth.user
    if (name !== undefined) user.name = name
    if (email !== undefined) user.email = email
    await user.save()
    if (Object.keys(rest).length) {
      // Precondition on the status, so an edit cannot slip in after a submit.
      const r2 = await AdvocateProfile.updateOne({ _id: profile._id, 'verification.status': 'draft' }, { $set: rest })
      if (!r2.matchedCount) throw conflict('Your details are with our verification team and cannot be changed now', 'PROFILE_LOCKED')
    }
    ok(res, await ownView(user))
  })

  r.put('/photo', singleImage('file'), async (req, res) => {
    const profile = await getOrCreateProfile(req.auth.user._id)
    if (profile.verification.status !== 'draft') throw conflict('Your photo is being verified and cannot be changed now', 'PROFILE_LOCKED')
    const saved = await savePrivate(req.file.buffer, req.auth.id)
    const old = profile.photo?.path
    const upd = await AdvocateProfile.updateOne({ _id: profile._id, 'verification.status': 'draft' }, { $set: { photo: { ...saved, mime: req.file.mime, uploadedAt: new Date() } } })
    if (!upd.matchedCount) {
      await removePrivate(saved.path)
      throw conflict('Your photo is being verified and cannot be changed now', 'PROFILE_LOCKED')
    }
    await removePrivate(old)
    ok(res, await ownView(req.auth.user))
  })

  r.get('/photo', async (req, res) => {
    const profile = await AdvocateProfile.findOne({ user: req.auth.id }).lean()
    if (!profile?.photo) throw notFound('Photo')
    await sendPrivate(res, profile.photo)
  })

  /**
   * Upload or replace a verification document.
   * draft: any document. reupload: only the documents the admin asked for; replacing the
   * last one sends the profile back to the admin. Otherwise documents are locked.
   */
  r.put('/documents/:key', validate({ params: docKey }), singleImage('file'), async (req, res) => {
    const { key } = req.valid.params
    const userId = req.auth.user._id
    const saved = await savePrivate(req.file.buffer, req.auth.id)
    const file = { ...saved, mime: req.file.mime, uploadedAt: new Date() }
    let oldPath
    try {
      await withTransaction(async (session) => {
        const profile = await getOrCreateProfile(userId, session)
        const status = profile.verification.status
        const existing = await AdvocateDocument.findOne({ user: userId, key }).session(session)
        if (status === 'reupload') {
          if (existing?.status !== 'reupload') throw conflict('Only the documents our team asked for can be replaced', 'DOCUMENT_LOCKED')
        } else if (status !== 'draft') {
          throw conflict('Your documents are locked while they are verified', 'DOCUMENT_LOCKED')
        }
        oldPath = existing?.file?.path
        await AdvocateDocument.updateOne({ user: userId, key }, { $set: { file, status: 'uploaded' }, $unset: { note: 1 }, $inc: { version: 1 } }, { upsert: true, session })
        if (status === 'reupload') {
          await VerificationEvent.create([{ user: userId, action: 'document_replaced', docKey: key }], { session })
          const left = await AdvocateDocument.countDocuments({ user: userId, status: 'reupload' }).session(session)
          if (!left) {
            await AdvocateProfile.updateOne({ _id: profile._id, 'verification.status': 'reupload' }, { $set: { 'verification.status': 'pending', 'verification.submittedAt': new Date() } }, { session })
            await VerificationEvent.create([{ user: userId, action: 'resubmitted' }], { session })
          }
        }
      })
    } catch (e) {
      await removePrivate(saved.path)
      throw e
    }
    await removePrivate(oldPath)
    ok(res, await ownView(req.auth.user))
  })

  r.get('/documents/:key/file', validate({ params: docKey }), async (req, res) => {
    const doc = await AdvocateDocument.findOne({ user: req.auth.id, key: req.valid.params.key }).lean()
    if (!doc) throw notFound('Document')
    await sendPrivate(res, doc.file)
  })

  r.post('/verification/submit', async (req, res) => {
    const user = req.auth.user
    const profile = await getOrCreateProfile(user._id)
    if (profile.verification.status !== 'draft') throw conflict('Already submitted', 'ALREADY_SUBMITTED')
    const docs = await AdvocateDocument.find({ user: user._id }).lean()
    const missing = missingForSubmit(user, profile, docs)
    if (missing.length) throw badRequest('Complete these before submitting: ' + missing.join(', '), { missing })
    await withTransaction(async (session) => {
      const u = await AdvocateProfile.updateOne({ _id: profile._id, 'verification.status': 'draft' }, { $set: { 'verification.status': 'pending', 'verification.submittedAt': new Date() } }, { session })
      if (!u.modifiedCount) throw conflict('Already submitted', 'ALREADY_SUBMITTED')
      await VerificationEvent.create([{ user: user._id, action: 'submitted' }], { session })
    })
    ok(res, await ownView(user))
  })

  return r
}
