import { createContext, useContext, useEffect, useState } from 'react'
import { adminApi } from '@/lib/api'

export const AdminCtx = createContext(null)
/** { admin, isSuper, setAdmin, logout } */
export const useAdmin = () => useContext(AdminCtx)

/** Load data from the admin API with loading and error state. */
export function useAdminData(path) {
  const [state, setState] = useState({ data: null, meta: null, error: null, loading: true })
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    adminApi(path)
      .then((j) => live && setState({ data: j.data, meta: j.meta ?? null, error: null, loading: false }))
      .catch((e) => live && setState({ data: null, meta: null, error: e.message, loading: false }))
    return () => {
      live = false
    }
  }, [path, n])
  return { ...state, reload: () => setN((x) => x + 1), setData: (data) => setState((s) => ({ ...s, data })) }
}
