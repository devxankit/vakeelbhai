import type { Me } from '../store/AppStore';
import { DOC_STEPS } from '../data/catalog';

type Start = { prefs: { langChosen: boolean; introSeen: boolean; role: string | null }; me: Me | null };

/** Where the app should open, from the device preferences and the profile on the server. */
export function startRoute({ prefs, me }: Start): { name: string; params?: object } {
  if (!prefs.langChosen) return { name: 'Language' };
  if (!prefs.introSeen) return { name: 'Intro' };
  if (!me) return prefs.role ? { name: 'Login' } : { name: 'Role' };
  if (me.kind === 'client') return me.complete ? { name: 'ClientTabs' } : { name: 'ClientSetup' };
  return advocateRoute(me);
}

/** The advocate's next step in registration → verification → membership → dashboard. */
export function advocateRoute(a: Extract<Me, { kind: 'advocate' }>): { name: string; params?: object } {
  const v = a.verification.status;
  if (v === 'draft') {
    if (!a.user.name || !a.user.email || !a.address || !a.state || !a.district || !a.hasPhoto) return { name: 'AdvDetails' };
    if (!a.practice.length || a.experienceYears == null || !a.courts || !a.enrolmentNumber) return { name: 'AdvPractice' };
    const i = DOC_STEPS.findIndex(d => a.documents.find(x => x.key === d.key)?.status === 'missing');
    if (i >= 0) return { name: 'AdvDoc', params: { i } };
    return { name: 'AdvReview' };
  }
  if (v !== 'approved') return { name: 'AdvStatus' };
  if (!a.membership?.active) return { name: 'Plans' };
  return { name: 'AdvTabs' };
}
