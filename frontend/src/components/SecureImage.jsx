import { useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { cx } from '@/components/ui'

/**
 * Shows a private image (verification document, profile photo). Such files need the
 * login token, so they are fetched with it and shown from a temporary object URL,
 * never from a public link. `load` is adminFileUrl or userFileUrl; `version` reloads it.
 */
export default function SecureImage({ load, path, version, alt, className, style, onClick }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    let made = null
    setUrl(null)
    setFailed(false)
    load(path)
      .then((u) => {
        made = u
        if (live) setUrl(u)
        else URL.revokeObjectURL(u)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [load, path, version])
  if (failed)
    return (
      <span className={cx('grid place-items-center bg-surface-2 text-muted', className)} style={style}>
        <ImageOff className="size-5" />
      </span>
    )
  if (!url)
    return (
      <span className={cx('grid place-items-center bg-surface-2', className)} style={style}>
        <Loader2 className="size-5 animate-spin text-gold" />
      </span>
    )
  return <img src={url} alt={alt} className={className} style={style} onClick={onClick} />
}
