import mongoose from 'mongoose'

/**
 * A client's request for legal help (SOW 5.3, SCOPE-OF-WORK 1 and 4.4).
 *
 * Server status (the full truth):
 *   submitted  waiting in the admin queue (new, or declined by the last advocate)
 *   assigned   the admin assigned an advocate; waiting for them to accept or decline
 *   accepted   the advocate accepted; the client now sees the advocate's card; chat is open
 *   quoted     the advocate sent a fee quote
 *   paid · done · completed · disputed   (payments phase)
 *
 * The client does not see an advocate until they accept, so `assigned` is shown to the
 * client as `submitted` (see toClientStatus). Assignment is manual by the admin; there is
 * no automatic timeout (pending business decision).
 */
export const REQUEST_STATUS = ['submitted', 'assigned', 'accepted', 'quoted', 'paid', 'done', 'completed', 'disputed', 'refunded', 'cancelled']

const fileRef = new mongoose.Schema({ path: { type: String, required: true }, mime: String, size: Number, sha256: String, uploadedAt: Date }, { _id: false })

const assignmentSchema = new mongoose.Schema(
  {
    advocate: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    response: { type: String, enum: ['pending', 'accepted', 'declined', 'withdrawn'], default: 'pending' },
    respondedAt: Date,
    reason: { type: String, maxlength: 200 },
  },
  { _id: false },
)

const serviceRequestSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    issue: { type: String, required: true, trim: true, minlength: 15, maxlength: 1000 },
    district: { type: String, required: true, trim: true, maxlength: 60 },
    language: { type: String, required: true, trim: true, maxlength: 30 },
    attachments: { type: [new mongoose.Schema({ file: fileRef }, { timestamps: { createdAt: true, updatedAt: false } })], default: [] },
    status: { type: String, enum: REQUEST_STATUS, default: 'submitted' },
    advocate: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: Date,
    acceptedAt: Date,
    assignments: { type: [assignmentSchema], default: [] },
    quote: {
      type: new mongoose.Schema({ feePaise: { type: Number, required: true }, scope: { type: String, required: true }, validTill: { type: Date, required: true }, sentAt: { type: Date, required: true } }, { _id: false }),
      default: null,
    },
    /** Payments phase: the paid checkout and what happened after. */
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    paidAt: Date,
    doneAt: Date,
    /** When "done" confirms by itself if the client neither confirms nor disputes (settings.autoConfirmDays). */
    autoConfirmAt: Date,
    completedAt: Date,
    completedBy: { type: String, enum: ['client', 'auto', 'admin'] },
    rating: { type: Number, min: 1, max: 5 },
    review: { type: String, maxlength: 1000 },
    dispute: {
      type: new mongoose.Schema(
        { reason: String, at: Date, status: { type: String, enum: ['open', 'released', 'refunded'] }, resolvedAt: Date, resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }, note: String },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
)

serviceRequestSchema.index({ status: 1, autoConfirmAt: 1 })
serviceRequestSchema.index({ client: 1, createdAt: -1 })
serviceRequestSchema.index({ advocate: 1, status: 1, updatedAt: -1 })
serviceRequestSchema.index({ 'assignments.advocate': 1 })
serviceRequestSchema.index({ status: 1, createdAt: 1 })

export const ServiceRequest = mongoose.model('ServiceRequest', serviceRequestSchema)

/** Chat message on a request. `from` is the side, `sender` the user (null for system). */
const messageSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRequest', required: true },
    from: { type: String, enum: ['client', 'advocate', 'system'], required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    kind: { type: String, enum: ['text', 'image', 'quote'], default: 'text' },
    text: { type: String, maxlength: 2000 },
    file: { type: fileRef, default: undefined },
    quote: { type: new mongoose.Schema({ feePaise: Number, scope: String, validTill: Date }, { _id: false }), default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

messageSchema.index({ request: 1, createdAt: 1 })

export const Message = mongoose.model('Message', messageSchema)
