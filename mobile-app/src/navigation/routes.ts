import { State } from '../store/AppStore';

/** Where the app should open, given what the user has done so far. */
export function startRoute(s: State): { name: string; params?: object } {
  if (!s.langChosen) return { name: 'Language' };
  if (!s.introSeen) return { name: 'Intro' };
  if (!s.role) return { name: 'Role' };
  if (!s.loggedIn) return { name: 'Login' };
  if (s.role === 'client') return s.client.name ? { name: 'ClientTabs' } : { name: 'ClientSetup' };
  const a = s.advocate;
  if (!a.name) return { name: 'AdvDetails' };
  if (!a.practice.length) return { name: 'AdvPractice' };
  if (a.verification === 'none') return { name: 'AdvReview' };
  if (a.verification !== 'approved') return { name: 'AdvStatus' };
  if (!a.membership) return { name: 'Plans' };
  return { name: 'AdvTabs' };
}
