import { useSyncExternalStore } from 'react';
import { DICT } from './dict';

/**
 * Languages. Screens are written in English; <T> looks each string up in the
 * chosen language's dictionary (dict.ts) and falls back to English when a
 * string has no translation yet. All non-English text is a draft for the
 * client's reviewers.
 */
export const LANGS = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
] as const;

export type LangCode = (typeof LANGS)[number]['code'];

let current: LangCode = 'en';
const listeners = new Set<() => void>();

export function setLang(code: LangCode) {
  if (code === current) return;
  current = code;
  listeners.forEach(l => l());
}

export function getLang() {
  return current;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Re-render when the language changes. */
export function useLang() {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Translate one English string. `{x}` placeholders are filled from `vars`. */
export function tr(en: string, vars?: Record<string, string | number>) {
  const table = DICT[current];
  let s = (table && table[en]) || en;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  }
  return s;
}
