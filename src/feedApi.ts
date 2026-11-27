import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { AdminAccessError, adminRequest } from './adminApi'

const failed = z.object({ error: z.literal(true) })
const section = <T extends z.ZodType>(schema: T) => z.union([schema, failed])
const nullableNumber = z.number().nullable()

const weights = z.object({
  dwell: z.number(), click: z.number(), profile: z.number(), like: z.number(), comment: z.number(),
  share: z.number(), save: z.number(), follow: z.number(), negative: z.number(),
})
const levels = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])
const controlsConfig = z.object({
  freshnessScale: levels,
  repliesFactor: levels,
  discoveryFactor: levels,
  interestedAuthor: z.number(),
  interestedTopic: z.number(),
  notInterestedAuthor: z.number(),
  notInterestedTopic: z.number(),
  topicMore: z.number(),
  topicLess: z.number(),
  feedbackDays: z.number(),
  snoozeDays: z.number(),
})
export type FeedControlsConfig = z.infer<typeof controlsConfig>
export const feedConfigSchema = z.object({
  weights,
  epsilon: z.number(),
  exploreFrom: z.number(),
  windowHours: z.number(),
  wideWindowHours: z.number(),
  minCandidates: z.number(),
  maxCandidates: z.number(),
  storedCandidates: z.number(),
  pageSize: z.number(),
  freshnessHalfLifeHours: z.number(),
  freshnessFloor: z.number(),
  seenPenalty: z.number(),
  authorGap: z.number(),
  authorMaxPer10: z.number(),
  publicCacheSeconds: z.number(),
  timeoutMs: z.number(),
  controls: controlsConfig,
})
export type FeedConfig = z.infer<typeof feedConfigSchema>

const adoption = z.object({
  optedIn: z.number(), optedOut: z.number(), undecided: z.number(),
  activeUsers7d: z.number(), activeOptedIn7d: z.number(),
  choicesByDay: z.array(z.object({ day: z.string(), optedIn: z.number(), optedOut: z.number() })),
  unlocksFromNav: z.number(), declinesFromNav: z.number(),
  homeRequests: z.object({ personal: z.number(), public: z.number() }),
})
const pipeline = z.object({
  requestsByDay: z.array(z.object({ day: z.string(), personal: z.number(), public: z.number(), following: z.number() })),
  latencyMs: z.object({ p50: z.number(), p95: z.number(), p99: z.number() }).nullable(),
  stages: z.array(z.object({ stage: z.string(), p50: z.number(), p95: z.number() })),
  candidates: z.object({ p50: z.number(), min: z.number() }).nullable(),
  sources: z.array(z.object({ source: z.string(), count: z.number() })),
  continuationRate: nullableNumber,
  caughtUp: z.number(),
  cursorRejected: z.number(),
  publicCache: z.object({ hits: z.number(), misses: z.number() }),
  problemsByDay: z.array(z.object({ day: z.string(), errors: z.number(), fallbacks: z.number() })),
})
const per100 = z.object({
  opens: nullableNumber, dwells: nullableNumber, likes: nullableNumber,
  replies: nullableNumber, shares: nullableNumber, profiles: nullableNumber,
})
const engagement = z.object({
  surfaces: z.array(z.object({ surface: z.string(), viewers: nullableNumber, impressions: nullableNumber, per100: per100.nullable() })),
  dailyActionsPer100: z.array(z.object({ day: z.string(), forYou: nullableNumber, following: nullableNumber })),
})
const slot = z.object({ served: z.number(), impressions: z.number(), engagementRate: nullableNumber })
const position = z.object({
  enough: z.boolean(),
  byPosition: z.array(z.object({ position: z.number(), impressions: z.number(), openRate: nullableNumber, likeRate: nullableNumber })),
  explore: z.object({ explored: slot, ranked: slot }).nullable(),
})
const diversity = z.object({
  authorsPerPage: nullableNumber,
  inNetworkShare: nullableNumber,
  top5AuthorShare: nullableNumber,
  recentCoverage: nullableNumber,
  neverShownShare: nullableNumber,
  topPosts: z.array(z.object({
    id: z.string(), handle: z.string(), content: z.string(),
    gif: z.object({ url: z.string(), title: z.string().optional() }).nullable(),
    voiceUrl: z.string().nullable(), imageIds: z.array(z.string()),
    createdAt: z.string(), impressions: z.number(), viewers: z.number(),
  })),
})
const training = z.object({
  since: z.string().nullable(),
  examples: z.number(),
  heads: z.array(z.object({ head: z.string(), positives: z.number(), minimum: z.number(), perDay: z.number(), etaDays: nullableNumber })),
})
const model = z.object({
  active: z.object({ id: z.string(), activatedAt: z.string().nullable(), featureVersion: z.number() }).nullable(),
  featureVersion: z.number(),
  featureNames: z.array(z.string()),
  prior: z.record(z.string(), z.object({ bias: z.number(), weights: z.record(z.string(), z.number()) })),
  configId: z.string().nullable(),
  config: feedConfigSchema,
  defaults: feedConfigSchema,
  history: z.array(z.object({ id: z.string(), createdAt: z.string(), handle: z.string().nullable(), values: z.unknown() })),
})
const volume = z.object({
  tables: z.array(z.object({ name: z.string(), rows: z.number(), bytes: z.number(), oldest: z.string().nullable() })),
  retentionDue: z.array(z.object({ rule: z.string(), rows: z.number() })),
})

const controls = z.object({
  enough: z.boolean(),
  optedIn: z.number(),
  usersActed: nullableNumber,
  usersWithControls: nullableNumber,
  usersTuned: nullableNumber,
  active: z.object({
    notInterested: z.number(), interested: z.number(), snoozes: z.number(),
    authors: z.number(), topicsMore: z.number(), topicsLess: z.number(),
  }),
  actionsByDay: z.array(z.object({ day: z.string(), less: z.number(), more: z.number(), topic: z.number() })),
  sliders: z.array(z.object({ slider: z.string(), levels: z.array(z.object({ level: z.number(), users: z.number() })) })),
  topTopics: z.array(z.object({ topic: z.string(), direction: z.enum(['more', 'less']), users: z.number() })),
})

export const feedDashboard = z.object({
  generatedAt: z.string(),
  days: z.number(),
  thresholds: z.object({ minUsers: z.number(), minViewers: z.number() }),
  adoption: section(adoption),
  pipeline: section(pipeline),
  engagement: section(engagement),
  position: section(position),
  diversity: section(diversity),
  training: section(training),
  model: section(model),
  volume: section(volume),
  controls: section(controls).optional(),
})
export type FeedDashboard = z.infer<typeof feedDashboard>

export function useFeedDashboard(days: number, onAccessLost: () => void) {
  const [state, setState] = useState<{ data: FeedDashboard | null; error: string; loading: boolean }>({ data: null, error: '', loading: true })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    adminRequest(`/api/admin/feed?days=${days}`, controller.signal)
      .then(raw => {
        if (!controller.signal.aborted) setState({ data: feedDashboard.parse(raw), error: '', loading: false })
      })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setState(current => ({ ...current, loading: false, error: cause instanceof Error ? cause.message : 'Could not load feed statistics.' }))
      })
    return () => controller.abort()
  }, [days, revision, onAccessLost])
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  return { ...state, refresh }
}

export async function saveFeedConfig(config: FeedConfig, note: string) {
  const raw = await adminRequest('/api/admin/feed/config', undefined, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note ? { config, note } : { config }),
  })
  return z.object({ id: z.string(), config: feedConfigSchema }).parse(raw)
}

export const percent = (value: number | null, digits = 0) => value === null ? 'n/a' : `${(value * 100).toFixed(digits)}%`
