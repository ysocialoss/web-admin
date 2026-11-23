import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import type { Intent } from '@blueprintjs/core'
import { AdminAccessError, adminRequest } from './adminApi'

const probe = z.object({ status: z.string(), checkedAt: z.string(), latencyMs: z.number() })
const failed = z.object({ error: z.literal(true) })
const section = <T extends z.ZodType>(schema: T) => z.union([schema, failed])
const day = z.array(z.object({ day: z.string(), count: z.number() }))

const database = z.object({
  version: z.string(), sizeBytes: z.number(), startedAt: z.string(), latencyMs: z.number(),
  connections: z.object({ open: z.number(), max: z.number() }),
  pool: z.object({ total: z.number(), idle: z.number(), waiting: z.number(), max: z.number() }),
  cacheHitRatio: z.number().nullable(),
  transactions: z.object({ commits: z.number(), rollbacks: z.number() }),
  deadlocks: z.number(),
  migrations: z.object({ applied: z.number() }).nullable(),
  tables: z.array(z.object({ name: z.string(), rows: z.number(), bytes: z.number() })),
})
const queues = z.object({
  mediaDeletions: z.object({ pending: z.number(), due: z.number(), retrying: z.number() }),
  voiceJobs: z.object({ pending: z.number(), failed: z.number() }),
  githubContributions: z.object({ due: z.number() }),
  pushDeliveries: z.object({ pending: z.number(), retrying: z.number() }),
  pushSubscriptions: z.number(),
})
const community = z.object({
  users: z.object({
    total: z.number(), pendingApproval: z.number(), banned: z.number(),
    admins: z.number(), moderators: z.number(), ogs: z.number(), signups7d: z.number(),
  }),
  posts: z.object({ total: z.number(), topLevel: z.number(), replies: z.number(), last7d: z.number() }),
  activeSessions: z.number(), images: z.number(), conversations: z.number(),
  signupsByDay: day, postsByDay: day,
})
const moderation = z.object({
  openReports: z.number(), oldestOpenReportAt: z.string().nullable(), reports7d: z.number(), handled7d: z.number(),
  imageFlags7d: z.number(), actions24h: z.number(), actions7d: z.number(), waitlist: z.number(),
  openByReason: z.array(z.object({ reason: z.string(), count: z.number() })),
})
const runtime = z.object({
  node: z.string(), platform: z.string(), pid: z.number(), environment: z.string(), startedAt: z.string(),
  uptimeSeconds: z.number(), draining: z.boolean(),
  memory: z.object({ rss: z.number(), heapUsed: z.number(), heapTotal: z.number(), external: z.number() }),
  eventLoopMs: z.object({ mean: z.number(), p99: z.number(), max: z.number() }),
  host: z.object({ cores: z.number(), load: z.array(z.number()), memoryTotal: z.number(), memoryFree: z.number() }),
  liveStreams: z.object({ open: z.number(), max: z.number() }),
})
export const systemStatus = z.object({
  generatedAt: z.string(),
  services: z.record(z.string(), probe),
  runtime,
  configured: z.record(z.string(), z.boolean()),
  database: section(database),
  queues: section(queues),
  community: section(community),
  moderation: section(moderation),
})
export type SystemStatus = z.infer<typeof systemStatus>
export const available = <T extends object>(value: T | { error: true }): value is T => !('error' in value)

export const serviceLabels: Record<string, string> = {
  database: 'Database', r2: 'Media storage', cns: 'Login provider (CNS)', klipy: 'GIF provider (Klipy)', nsfw: 'NSFW scanner',
}
export const integrationLabels: Record<string, string> = {
  mediaStorage: 'Media storage (R2)', gifSearch: 'GIF search', webPush: 'Web push', github: 'GitHub connections',
  discord: 'Discord connections', twitch: 'Twitch connections', steam: 'Steam connections', domainConnect: 'Domain Connect',
  adminOrigin: 'Admin origin (moderation writes)', encryptedSessions: 'Session encryption key',
}

export function useSystemStatus(onAccessLost: () => void, pollMs: number | null = 30_000) {
  const [state, setState] = useState<{ data: SystemStatus | null; error: string; loading: boolean }>({ data: null, error: '', loading: true })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const data = systemStatus.parse(await adminRequest('/api/admin/system', controller.signal))
        if (!controller.signal.aborted) setState({ data, error: '', loading: false })
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setState(current => ({ ...current, loading: false, error: cause instanceof Error ? cause.message : 'Could not load system status.' }))
      }
    }
    void load()
    const timer = pollMs ? window.setInterval(() => void load(), pollMs) : undefined
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [revision, pollMs, onAccessLost])
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  return { ...state, refresh }
}

export function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export function formatDuration(seconds: number) {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor(seconds % 86_400 / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m`
  return `${Math.floor(seconds)}s`
}

export function formatAge(iso: string, now = Date.now()) {
  return formatDuration(Math.max(0, (now - new Date(iso).getTime()) / 1000))
}

export const statusIntent = (status: string): Intent => status === 'ok' ? 'success' : status === 'rate_limited' ? 'warning' : 'danger'
export const statusText = (status: string) => status === 'ok' ? 'Operational' : status === 'rate_limited' ? 'Rate limited' : 'Unavailable'

export function overallStatus(services: SystemStatus['services']) {
  const entries = Object.entries(services)
  if (services.database && services.database.status !== 'ok') return { intent: 'danger' as const, text: 'Major outage' }
  if (entries.some(([, check]) => check.status !== 'ok')) return { intent: 'warning' as const, text: 'Degraded' }
  return { intent: 'success' as const, text: 'All systems operational' }
}

