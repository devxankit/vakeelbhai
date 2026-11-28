import mongoose from 'mongoose'

/** Atomic sequences for human-readable numbers (VB-1001, VB-AD-00001). */
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false })
export const Counter = mongoose.model('Counter', counterSchema)

export async function nextSeq(name, start = 0, session) {
  const c = await Counter.findOneAndUpdate({ _id: name }, [{ $set: { seq: { $add: [{ $ifNull: ['$seq', start] }, 1] } } }], { upsert: true, new: true, session })
  return c.seq
}
