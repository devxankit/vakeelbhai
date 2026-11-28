import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTitle } from '@/lib/format'
import { PortalLogin } from './common'

/**
 * The website's single login (/login), like the app: pick Client or Advocate, then OTP.
 * After login each role goes to its own area. ?role= preselects a role and ?next= returns
 * to the page the user came from, but only inside that role's own area.
 */
const HOME = { client: '/app', advocate: '/advocate' }

export default function Login() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  useTitle('Log in')
  const role = HOME[sp.get('role')] ? sp.get('role') : null
  const next = sp.get('next') ?? ''
  const target = (r) => (next === HOME[r] || next.startsWith(HOME[r] + '/') || next.startsWith(HOME[r] + '?') ? next : HOME[r])

  // Both portals check the API session themselves, so a logged-in user who lands here just logs in again.
  return <PortalLogin key={role ?? 'pick'} role={role} onDone={(r) => nav(target(r), { replace: true })} />
}
