/**
 * Insert the seven service categories named in the signed SOW (section 5.2), with the
 * texts already used by the website and app. Safe to run again: existing keys are skipped,
 * so admin edits are never overwritten. This is reference data, not sample data.
 *
 *   npm run seed:categories
 */
import { env } from '../src/config/env.js'
import { connectDb, disconnectDb } from '../src/config/db.js'
import { Category } from '../src/modules/categories/category.model.js'
import { SOW_CATEGORIES } from '../src/modules/categories/sowCategories.js'

await connectDb(env.MONGODB_URI)
try {
  let added = 0
  for (const [i, c] of SOW_CATEGORIES.entries()) {
    const r = await Category.updateOne({ key: c.key }, { $setOnInsert: { ...c, order: i } }, { upsert: true })
    if (r.upsertedCount) added++
  }
  console.log('Categories added: ' + added + ', already present: ' + (SOW_CATEGORIES.length - added))
} finally {
  await disconnectDb()
}
