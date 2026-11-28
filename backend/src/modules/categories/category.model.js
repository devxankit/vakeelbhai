import mongoose from 'mongoose'

/**
 * Legal service categories, managed by the admin (SOW 5.2, SCOPE-OF-WORK 4.3).
 * `key` is the stable identifier the apps already use ('criminal', 'civil', ...) and
 * cannot change once created. Categories are deactivated, never deleted, so old
 * requests always point at a real category.
 */
const categorySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, immutable: true, match: /^[a-z][a-z0-9-]{1,39}$/ },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    short: { type: String, required: true, trim: true, maxlength: 30 },
    covers: { type: String, trim: true, maxlength: 160, default: '' },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    typicalDocs: { type: [{ type: String, trim: true, maxlength: 80 }], default: [] },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    /** Whether GST is charged on the client's fee for this category. Pending CA confirmation. */
    gstOnService: { type: Boolean, default: true },
    /** Commission override for this category (bp). null = use the global rate. */
    commissionBp: { type: Number, default: null, min: 0, max: 10000 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true },
)

categorySchema.index({ active: 1, order: 1 })

export const Category = mongoose.model('Category', categorySchema)
