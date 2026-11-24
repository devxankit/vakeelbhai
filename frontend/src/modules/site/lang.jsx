/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react'
import { HI } from './hi'

/** English / Hindi for the public website. Hindi is a draft for the client's reviewers. */
export const LangCtx = createContext({ lang: 'en', setLang: () => {} })
export const useLang = () => useContext(LangCtx)
export function useT() {
  const { lang } = useContext(LangCtx)
  return (s) => (lang === 'hi' && HI[s]) || s
}
