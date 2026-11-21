import { useEffect, useState } from 'react'
import { z } from 'zod'

const user = z.object({ id: z.uuid(), name: z.string(), handle: z.string(), joined: z.string(), avatarUrl: z.string().nullable() })
export const roles = z.enum(['admin', 'moderator', 'og', 'user'])
const badgeFields = z.object({ icon: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), tooltip: z.string() })
const badge = badgeFields.extend({ id: z.uuid() })
const badges = z.array(badge).default([])
export type UserBadge = z.infer<typeof badge>
const badgeOptions = z.object({
  icons: z.array(z.string()),
  presets: z.array(badgeFields.extend({ label: z.string() })),
})
const accountStatus = {
  bannedAt: z.string().nullable().default(null),
  banReason: z.string().nullable().default(null),
  canModerateAccount: z.boolean().default(false),
}
const pronouns = z.string().default('')
const github = z.object({
  login: z.string().regex(/^[a-z\d][a-z\d_-]{0,99}$/i),
  contributionCount: z.number().int().nonnegative().nullable(),
}).nullable().default(null)
const managedUser = user.extend({ bio: z.string(), pronouns, role: roles, badges, github, canEditRole: z.boolean(), ...accountStatus })
export type ManagedUser = z.infer<typeof managedUser>
export const userList = z.object({
  users: z.array(managedUser),
  hasNextPage: z.boolean(),
  canEditProfiles: z.boolean(),
  canEditBadges: z.boolean().default(false),
})

export type ProfileChange =
  | { action: 'clearBio' | 'clearAvatar' | 'clearBanner' }
  | { action: 'changeUsername' | 'changeName' | 'changeBio' | 'changePronouns'; value: string }

export async function loadPronounRecommendations(signal: AbortSignal) {
  return z.object({
    languages: z.record(z.string(), z.array(z.string())),
    general: z.array(z.string()),
    maxLength: z.number().int().positive(),
  }).parse(await adminRequest('/api/profiles/pronouns/recommendations', signal))
}

export type BulkProfileAction = 'changeName' | 'changeBio'
export type AccountAction = 'ban' | 'unban' | 'remove'
export type BadgeChange =
  | ({ action: 'add' } & z.infer<typeof badgeFields>)
  | { action: 'remove'; id: string }

export async function loadBadgeOptions(signal: AbortSignal) {
  return badgeOptions.parse(await adminRequest('/api/admin/badge-options', signal))
}

export async function updateUserBadges(id: string, change: BadgeChange) {
  const result = await adminRequest('/api/admin/users/' + id + '/badges', undefined, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(change),
  })
  return z.object({ badges: z.array(badge) }).parse(result).badges
}

export async function moderateAccount(id: string, change: { action: 'ban'; reason: string } | { action: 'unban' | 'remove' }) {
  await adminRequest('/api/admin/users/' + id + '/account', undefined, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(change),
  })
}

export async function updateUserProfiles(ids: string[], action: BulkProfileAction, value: string) {
  const result = await adminRequest('/api/admin/users/profiles', undefined, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, action, value }),
  })
  return z.object({ users: z.array(managedUser.pick({ id: true, name: true, bio: true })) }).parse(result).users
}

export async function updateUserProfile(id: string, change: ProfileChange) {
  const result = await adminRequest('/api/admin/users/' + id + '/profile', undefined, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(change),
  })
  return managedUser.parse(result)
}

export async function updateUserRoles(ids: string[], role: ManagedUser['role']) {
  const result = await adminRequest('/api/admin/users/roles', undefined, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, role }),
  })
  return z.object({ users: z.array(managedUser.pick({ id: true, role: true })) }).parse(result).users
}

const post = z.object({
  id: z.uuid(), authorId: z.uuid(), author: z.string(), content: z.string(),
  kind: z.enum(['Post', 'Reply']), time: z.string(),
  gif: z.object({ url: z.url({ protocol: /^https?$/ }), title: z.string() }).nullable().default(null),
  imageIds: z.array(z.uuid()).default([]),
  voiceUrl: z.string().startsWith('/api/voices/').nullable().default(null),
  hasPoll: z.boolean().default(false),
})
export type AdminPostGif = z.infer<typeof post>['gif']
export const postList = z.object({ posts: z.array(post), hasNextPage: z.boolean(), canModerate: z.boolean().default(false) })
export const imageFlagPage = z.object({
  flags: z.array(z.object({
    id: z.uuid(),
    uploaderId: z.uuid(),
    handle: z.string(),
    filename: z.string().nullable(),
    confidence: z.number().min(0).max(100).nullable(),
    createdAt: z.iso.datetime(),
  })),
  hasNextPage: z.boolean(),
  canRemove: z.boolean().default(false),
})
const overviewSchema = z.object({
  metrics: z.array(z.object({ label: z.string(), value: z.string(), detail: z.string() })),
  recentUsers: z.array(user), recentPosts: z.array(post),
})
const health = z.object({ checks: z.record(z.string(), z.object({ status: z.string() })) })
export const targetSchema = z.discriminatedUnion('kind', [
  user.extend({
    kind: z.literal('user'),
    bio: z.string(),
    pronouns,
    role: roles,
    badges,
    github,
    canEditProfile: z.boolean(),
    canEditBadges: z.boolean().default(false),
    ...accountStatus,
    bannerUrl: z.string().nullable(),
    bannerCrop: z.object({
      x: z.number().min(0).max(1), y: z.number().min(0).max(1),
      width: z.number().positive().max(1), height: z.number().positive().max(1),
    }).nullable(),
    followerCount: z.number(),
    followingCount: z.number(),
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    updatedAt: z.string(),
  }),
  post.omit({ kind: true }).extend({
    kind: z.literal('post'),
    type: z.enum(['Post', 'Reply']),
    canRemove: z.boolean(),
    parentId: z.uuid().nullable(),
    quotedPostId: z.uuid().nullable(),
    pollTitle: z.string().nullable(),
  }),
])
export type ModerationDetail = z.infer<typeof targetSchema>
export type AdminOverview = z.infer<typeof overviewSchema>
const empty: AdminOverview = { metrics: [], recentUsers: [], recentPosts: [] }

export class AdminAccessError extends Error {}
export class AdminRoleRequiredError extends Error {
  constructor() {
    super('This action requires an admin role.')
  }
}

export async function adminRequest(path: string, signal?: AbortSignal, options?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...options, credentials: 'same-origin', signal, cache: 'no-store' })
  if (!response.ok) {
    if (response.status === 401) throw new AdminAccessError('Your session expired. Sign in again.')
    if (response.status === 403) {
      const error = z.object({ error: z.string() }).safeParse(await response.json().catch(() => null))
      if (error.data?.error === 'admin_required') throw new AdminRoleRequiredError()
      if (error.data?.error === 'invalid_origin') throw new Error('The dashboard origin is not configured for moderation actions.')
      throw new AdminAccessError('You do not have permission to access the admin dashboard.')
    }
    if (response.status === 409) {
      const error = z.object({ error: z.string() }).safeParse(await response.json().catch(() => null))
      if (error.data?.error === 'reserved_username') throw new Error('This username is reserved.')
      if (error.data?.error === 'protected_account') throw new Error('This account is protected.')
      if (error.data?.error === 'account_banned') throw new Error('Unban this account before approving it.')
      if (error.data?.error === 'attachment_required') throw new Error('Removing these attachments would leave the post empty. Delete the post instead.')
      if (error.data?.error === 'Handle is already taken') throw new Error('That username is already taken.')
      throw new Error('This role is protected.')
    }
    if (response.status === 503) throw new Error('Admin API unavailable. Check API configuration and database connectivity.')
    if (response.status === 404) throw new Error('This item was not found.')
    throw new Error(`API request failed (${response.status}).`)
  }
  return response.status === 204 ? null : response.json()
}

export function useAdminOverview(search: string | null, onAccessLost: () => void) {
  const [completed, setCompleted] = useState<{ search: string | null; revision: number; data: AdminOverview; error: string }>()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (search === '') return
    const controller = new AbortController()
    async function load() {
      try {
        const term = search?.replace(/^@/, '').trim() ?? ''
        const response = await adminRequest('/api/admin/overview?q=' + encodeURIComponent(term), controller.signal)
        const data = overviewSchema.parse(response)
        if (!controller.signal.aborted) setCompleted({ search, revision, data, error: '' })
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setCompleted({
          search,
          revision,
          data: empty,
          error: cause instanceof Error ? cause.message : 'Could not load admin data.',
        })
      }
    }
    void load()
    return () => controller.abort()
  }, [search, revision, onAccessLost])
  const current = completed?.search === search && completed.revision === revision ? completed : undefined
  return {
    data: current?.data ?? empty,
    error: current?.error ?? '',
    loading: search !== '' && !current,
    refresh: () => setRevision(value => value + 1),
  }
}

const serviceNames: Record<string, string> = { database: 'Database', r2: 'Media storage', cns: 'Login provider', klipy: 'GIF provider' }

export function useAdminHealth() {
  const [services, setServices] = useState<{ name: string; status: string }[] | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/health', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const { checks } = health.parse(await response.json())
        if (!controller.signal.aborted) {
          setServices(Object.entries(checks).map(([key, check]) => ({ name: serviceNames[key] ?? key, status: check.status })))
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setServices([{ name: 'API health', status: 'unavailable' }])
      })
    return () => controller.abort()
  }, [])
  return services
}
