import { useEffect, useState } from 'react'
import { Button, Callout } from '@blueprintjs/core'
import { z } from 'zod'

const checkEvery = 5 * 60_000
const version = z.object({ build: z.string().min(1) })

async function latestBuild(signal: AbortSignal) {
  const response = await fetch('/version.json', { cache: 'no-store', signal })
  if (!response.ok) return
  const parsed = version.safeParse(await response.json())
  return parsed.data?.build
}

export function AppUpdatePrompt() {
  const [available, setAvailable] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (available) return
    let controller: AbortController | undefined
    const check = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      controller?.abort()
      controller = new AbortController()
      const { signal } = controller
      void latestBuild(signal).then(build => {
        if (!signal.aborted && build && build !== __APP_BUILD__) setAvailable(true)
      }, () => undefined)
    }
    const first = window.setTimeout(check, 3000)
    const timer = window.setInterval(check, checkEvery)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', check)
    window.addEventListener('pageshow', check)
    return () => {
      controller?.abort()
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('online', check)
      window.removeEventListener('pageshow', check)
    }
  }, [available])

  return <div role="status" className="admin-update-prompt">
    {available && !dismissed && <Callout intent="warning" icon="warning-sign">
      <div className="admin-update-content">
        <span><strong>Update available.</strong> Reload to get it.</span>
        <Button size="small" icon="refresh" onClick={() => window.location.reload()}>Reload</Button>
        <Button size="small" variant="minimal" icon="cross" aria-label="Dismiss update"
          onClick={() => setDismissed(true)} />
      </div>
    </Callout>}
  </div>
}
