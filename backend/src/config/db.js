import mongoose from 'mongoose'
import { logger } from '../utils/logger.js'

// Query-operator injection ({ "$gt": "" } in a body) is blocked before it reaches a query:
// middleware/sanitize.js rejects $-keys and zod validates every field's type.
mongoose.set('strictQuery', true)

export async function connectDb(uri) {
  await mongoose.connect(uri, { autoIndex: true, serverSelectionTimeoutMS: 10000 })
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected')
  return mongoose.connection
}

export const disconnectDb = () => mongoose.disconnect()

/**
 * Run `fn` inside a MongoDB transaction. Wallet and payment code (Phase 4) must use this,
 * so a balance never changes without its ledger entry. Needs a replica set: Atlas, a local
 * single-node replica set, or mongodb-memory-server's MongoMemoryReplSet in tests.
 */
export async function withTransaction(fn) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      result = await fn(session)
    })
    return result
  } finally {
    await session.endSession()
  }
}
