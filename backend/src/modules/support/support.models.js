import mongoose from 'mongoose'

/**
 * Help desk (SCOPE-OF-WORK 11): clients and advocates raise a ticket and chat with the
 * Vakeel Bhai team inside the app or website. The admin panel answers and closes tickets.
 *
 * status:
 *   open      waiting for the support team (new, or the user wrote again)
 *   answered  the team replied; waiting for the user
 *   closed    resolved. Writing again reopens it.
 */
export const SUPPORT_TOPICS = ['payments', 'membership', 'services', 'echallan', 'gst', 'account', 'technical', 'other']
export const TICKET_STATUS = ['open', 'answered', 'closed']

const ticketSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['client', 'advocate'], required: true },
    topic: { type: String, enum: SUPPORT_TOPICS, required: true },
    subject: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    /** Optional link to what the ticket is about: a request (VB-1001), an e-Challan order (EC-1001)… */
    ref: { type: String, trim: true, maxlength: 20, default: null },
    status: { type: String, enum: TICKET_STATUS, default: 'open' },
    lastMessageAt: { type: Date, default: Date.now },
    /** Unread markers, so each side sees a dot. */
    userUnread: { type: Boolean, default: false },
    adminUnread: { type: Boolean, default: true },
    closedAt: Date,
    closedBy: { type: String, enum: ['user', 'admin'] },
  },
  { timestamps: true },
)
ticketSchema.index({ user: 1, lastMessageAt: -1 })
ticketSchema.index({ status: 1, lastMessageAt: 1 })
export const SupportTicket = mongoose.model('SupportTicket', ticketSchema)

const fileRef = new mongoose.Schema({ path: { type: String, required: true }, mime: String, size: Number, sha256: String, uploadedAt: Date }, { _id: false })

/** One message on a ticket. `from`: the user, the support team, or the system. */
const supportMessageSchema = new mongoose.Schema(
  {
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket', required: true },
    from: { type: String, enum: ['user', 'support', 'system'], required: true },
    sender: { type: mongoose.Schema.Types.ObjectId },
    /** Support replies show the staff member's first name ("Neha from Vakeel Bhai"). */
    senderName: { type: String, maxlength: 80 },
    kind: { type: String, enum: ['text', 'image'], default: 'text' },
    text: { type: String, maxlength: 2000 },
    file: { type: fileRef, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
supportMessageSchema.index({ ticket: 1, createdAt: 1 })
export const SupportMessage = mongoose.model('SupportMessage', supportMessageSchema)
