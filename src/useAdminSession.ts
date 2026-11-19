import { useCallback, useEffect, useState } from 'react'
type Status = 'loading' | 'allowed' | 'anonymous' | 'forbidden' | 'unavailable'

export function useAdminSession() {
  const [status, setStatus] = useState<Status>('loading')
  const [revision, setRevision] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(() => {
    setStatus('loading')
    setRevision(value => value + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return
        switch (response.status) {
          case 204: setStatus('allowed'); break
          case 401: setStatus('anonymous'); break
          case 403: setStatus('forbidden'); break
          default: setStatus('unavailable')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('unavailable')
      })
    return () => controller.abort()
  }, [revision])

  async function signOut() {
    setSigningOut(true)
    setError('')
    try {
      const response = await fetch('/auth/admin/logout', { method: 'POST', credentials: 'same-origin' })
      if (!response.ok) throw new Error('Sign-out failed.')
      window.history.replaceState(null, '', '/')
      refresh()
    } catch {
      setError('Could not sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return { status, refresh, signOut, signingOut, error }
}
