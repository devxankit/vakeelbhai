/**
 * DEVELOPMENT ONLY: a local single-node MongoDB replica set for machines without MongoDB
 * installed. Data is kept in backend/.dev-db (git-ignored) between runs.
 *
 *   npm run dev:db      (leave it running; then `npm run dev` in another terminal)
 *
 * Put the printed URI in backend/.env as MONGODB_URI.
 */
import path from 'node:path'
import fs from 'node:fs'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

const dbPath = process.env.DEV_DB_PATH || path.resolve(import.meta.dirname, '../.dev-db')
fs.mkdirSync(dbPath, { recursive: true })
const port = Number(process.env.DEV_DB_PORT || 27018)

const repl = await MongoMemoryReplSet.create({
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port, dbPath }],
})
console.log('Dev MongoDB replica set running. Use:\nMONGODB_URI=' + repl.getUri('vakeelbhai_dev'))
console.log('Data folder: ' + dbPath + '   (Ctrl+C to stop)')

const stop = async () => {
  await repl.stop({ doCleanup: false })
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
