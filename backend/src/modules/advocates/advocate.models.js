import mongoose from 'mongoose'

/**
 * Advocate registration and verification (SOW 4.1-4.3, SCOPE-OF-WORK 3.1-3.3).
 *
 * Verification status:
 *   draft     filling in details and documents (new advocates start here)
 *   pending   submitted, waiting for the admin; nothing can be changed
 *   reupload  the admin asked for specific documents again; only those can be replaced,
 *             and replacing the last one sends the profile back to `pending`
 *   approved  verified; documents are locked
 *   rejected  refused with a reason (whether they may re-apply is an open business decision)
 */
export const VERIFICATION = ['draft', 'pending', 'reupload', 'approved', 'rejected']
export const DOC_KEYS = ['districtBar', 'stateBar', 'enrolment', 'aadhaarFront', 'aadhaarBack']
export const DOC_TITLES = {
  districtBar: 'District Bar Association card',
  stateBar: 'State Bar Council certificate',
  enrolment: 'Enrolment certificate',
  aadhaarFront: 'Aadhaar (front)',
  aadhaarBack: 'Aadhaar (back)',
}

const fileRef = new mongoose.Schema({ path: { type: String, required: true }, mime: String, size: Number, sha256: String, uploadedAt: Date }, { _id: false })

const advocateProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    state: { type: String, trim: true, maxlength: 60, default: '' },
    district: { type: String, trim: true, maxlength: 60, default: '' },
    /** Category keys (see Category.key). */
    practice: { type: [String], default: [] },
    experienceYears: { type: Number, min: 0, max: 70, default: null },
    courts: { type: String, trim: true, maxlength: 200, default: '' },
    enrolmentNumber: { type: String, trim: true, maxlength: 40, default: '' },
    photo: { type: fileRef, default: null },
    verification: {
      status: { type: String, enum: VERIFICATION, default: 'draft' },
      submittedAt: Date,
      reviewedAt: Date,
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
      reason: { type: String, maxlength: 500 },
    },
  },
  { timestamps: true },
)

advocateProfileSchema.index({ 'verification.status': 1, 'verification.submittedAt': 1 })
advocateProfileSchema.index({ district: 1, practice: 1 })

export const AdvocateProfile = mongoose.model('AdvocateProfile', advocateProfileSchema)

/** The current file for each required document. Only the owner and admins can read it. */
const advocateDocumentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, enum: DOC_KEYS, required: true },
    file: { type: fileRef, required: true },
    status: { type: String, enum: ['uploaded', 'approved', 'reupload', 'rejected'], default: 'uploaded' },
    note: { type: String, maxlength: 300 },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
)

advocateDocumentSchema.index({ user: 1, key: 1 }, { unique: true })

export const AdvocateDocument = mongoose.model('AdvocateDocument', advocateDocumentSchema)

/** Approval history (append-only): who did what, when, and the notes per document. */
const verificationEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, enum: ['submitted', 'resubmitted', 'approved', 'reupload_requested', 'rejected', 'document_replaced'], required: true },
    byAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    reason: String,
    docNotes: { type: Map, of: String },
    docKey: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export const VerificationEvent = mongoose.model('VerificationEvent', verificationEventSchema)
