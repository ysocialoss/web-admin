import { useEffect, useState } from 'react'

function readPage() {
  const value = Number(new URLSearchParams(window.location.search).get('page'))
  return Number.isInteger(value) && value >= 1 && value <= 1_000_000 ? value : 1
}

export function pageUrl(page: number, params = new URLSearchParams(window.location.search)) {
  const next = new URLSearchParams(params)
  if (page > 1) next.set('page', String(page))
  else next.delete('page')
  return window.location.pathname + (next.size ? '?' + next : '')
}

export function useHistoryPage() {
  const [page, setPage] = useState(readPage)
  useEffect(() => {
    const restore = () => setPage(readPage())
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  function goTo(next: number) {
    if (next !== readPage()) window.history.pushState(window.history.state, '', pageUrl(next))
    setPage(next)
  }
  return [page, goTo] as const
}
