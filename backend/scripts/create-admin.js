/**
 * Create a super admin for the admin panel. Run once per environment:
 *
 *   npm run admin:create -- --email you@company.com --name "Your Name"
 *
 * The password is read from the ADMIN_PASSWORD environment variable (so it does not land
 * in your shell history), or asked for interactively. Refuses if the email exists.
 */
import { parseArgs } from 'node:util'
import readline from 'node:readline/promises'
import bcrypt from 'bcryptjs'
import { env } from '../src/config/env.js'
import { connectDb, disconnectDb } from '../src/config/db.js'
import { AdminUser } from '../src/modules/admin/adminUser.model.js'

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', default: 'super_admin' } } })
if (!values.email || !values.name) {
  console.error('Usage: npm run admin:create -- --email you@company.com --name "Your Name" [--role staff]')
  process.exit(1)
}
if (!['super_admin', 'staff'].includes(values.role)) {
  console.error('--role must be super_admin or staff')
  process.exit(1)
}

let password = process.env.ADMIN_PASSWORD
if (!password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  password = await rl.question('Password (at least 10 characters): ')
  rl.close()
}
if (!password || password.length < 10) {
  console.error('The password must be at least 10 characters')
  process.exit(1)
}

await connectDb(env.MONGODB_URI)
try {
  const email = values.email.trim().toLowerCase()
  if (await AdminUser.exists({ email })) throw new Error('An admin with this email already exists')
  const admin = await AdminUser.create({ name: values.name.trim(), email, role: values.role, passwordHash: await bcrypt.hash(password, 12) })
  console.log('Created ' + admin.role + ' ' + admin.email)
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
} finally {
  await disconnectDb()
}
