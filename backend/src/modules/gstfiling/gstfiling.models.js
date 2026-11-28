import mongoose from 'mongoose'

/**
 * GST filing assistance (SCOPE-OF-WORK 10): a client asks our team to file a return or
 * register for GST. Workflow: requested → in_review → documents_needed → filed → closed.
 * The admin sets the service fee; the client pays it (plus GST) in the app before filing.
 * The conversation happens on a linked help-desk ticket (topic "gst").
 */
export const GST_RETURN_TYPES = ['GSTR-1', 'GSTR-3B', 'GSTR-9 (annual)', 'GSTR-4', 'New GST registration', 'Other']
export const GST_STATUS = ['requested', 'in_review', 'documents_needed', 'filed', 'closed']

const fileRef = new mongoose.Schema({ path: { type: String, required: true }, mime: String, size: Number, sha256: String, uploadedAt: Date }, { _id: false })

const gstFilingSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    returnType: { type: String, enum: GST_RETURN_TYPES, required: true },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    businessName: { type: String, trim: true, maxlength: 120, default: '' },
    period: { type: String, trim: true, maxlength: 40, default: '' },
    note: { type: String, trim: true, maxlength: 1000, default: '' },
    docs: { type: [new mongoose.Schema({ file: fileRef, name: String }, { timestamps: { createdAt: true, updatedAt: false } })], default: [] },
    status: { type: String, enum: GST_STATUS, default: 'requested' },
    /** Set by the admin; the client pays fee + GST. */
    feePaise: { type: Number, default: null, min: 0 },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    paidAt: { type: Date, default: null },
    /** Acknowledgement number (ARN) once filed. */
    filedRef: { type: String, default: '' },
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket' },
    events: { type: [new mongoose.Schema({ status: String, at: Date, note: String }, { _id: false })], default: [] },
  },
  { timestamps: true },
)
gstFilingSchema.index({ user: 1, createdAt: -1 })
gstFilingSchema.index({ status: 1, updatedAt: -1 })
export const GstFiling = mongoose.model('GstFiling', gstFilingSchema)
