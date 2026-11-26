import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { Ground } from './ground'

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

export async function moderateAccount(id: string, change: { action: 'ban'; reason: string; ground: Ground } | { action: 'unban' | 'remove' }) {
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

export async function updateUserProfile(id: string, change: ProfileChange, ground?: Ground) {
  const result = await adminRequest('/api/admin/users/' + id + '/profile', undefined, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ground ? { ...change, ground } : change),
  })
  return managedUser.parse(result)
}

export async function replaceUserProfileImage(id: string, kind: 'avatar' | 'banner', file: File) {
  let query = ''
  if (kind === 'banner') {
    const url = URL.createObjectURL(file)
    const image = new Image()
    try {
      image.src = url
      await image.decode()
      const aspect = image.naturalWidth / image.naturalHeight
      const width = Math.min(1, 3 / aspect)
      const height = Math.min(1, aspect / 3)
      query = '?' + new URLSearchParams({
        crop: JSON.stringify({ x: (1 - width) / 2, y: (1 - height) / 2, width, height }),
      })
    } catch {
      throw new Error('Could not open this banner image.')
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  const result = await adminRequest('/api/admin/users/' + id + '/profile/' + kind + query, undefined, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  return z.object({ url: z.string() }).parse(result).url
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
  gif: z.object({
    url: z.url({ protocol: /^https?$/ }).or(z.literal('/easter-egg.gif')),
    title: z.string(),
  }).nullable().default(null),
  imageIds: z.array(z.uuid()).default([]),
  voiceUrl: z.string().startsWith('/api/voices/').nullable().default(null),
  hasPoll: z.boolean().default(false),
  hiddenAt: z.iso.datetime().nullable().default(null),
})
export type AdminPostGif = z.infer<typeof post>['gif']
export const postList = z.object({
  posts: z.array(post), hasNextPage: z.boolean(), canModerate: z.boolean().default(false), canSetVisibility: z.boolean().default(false),
})

export async function setPostVisibility(id: string, hidden: boolean, ground?: Ground) {
  await adminRequest('/api/admin/posts/' + id + '/visibility', undefined, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hidden ? { hidden, ground } : { hidden }),
  })
}

export async function removeWithGround(path: string, ground: Ground) {
  await adminRequest(path, undefined, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ground }),
  })
}
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
    canSetVisibility: z.boolean().default(false),
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

const requestErrors = new Map([
  ['independent_post_report_required', 'Open a report filed by another account to remove this post.'],
  ['avatar_png_required', 'Choose a PNG image for the avatar.'],
  ['invalid_avatar', 'Choose a valid static PNG image.'],
  ['invalid_banner', 'Choose a valid PNG, JPEG, WebP, GIF, or AVIF image.'],
  ['invalid_post_image', 'Choose a static JPEG, PNG, or WebP image.'],
  ['post_image_limit', 'A post can have at most four images.'],
  ['post_image_busy', 'Image uploads are busy. Try again shortly.'],
  ['post_image_rejected', 'The image did not pass the NSFW check.'],
  ['post_image_check_unavailable', 'The NSFW check is unavailable. Try again shortly.'],
  ['release_exists', 'A release with this tag already exists for this app.'],
  ['release_empty', 'This app has no unreleased entries to release.'],
  ['changelog_entry_released', 'This entry was already released and can no longer change.'],
  ['invalid_release', 'Enter a release tag of up to 128 characters.'],
  ['ground_required', 'Choose a ground and describe the facts. The user receives them as the statement of reasons.'],
  ['invalid_ground', 'Choose a valid terms clause or legal ground and describe the facts.'],
  ['invalid_content','Use up to 2,000 characters and no more than two blank lines in a row. A post without attachments needs text.'],
])

export async function adminRequest(path: string, signal?: AbortSignal, options?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...options, credentials: 'same-origin', signal, cache: 'no-store' })
  if (!response.ok) {
    if (response.status === 401) throw new AdminAccessError('Your session expired. Sign in again.')
    const error = z.object({ error: z.string() }).safeParse(await response.json().catch(() => null))
    const message = requestErrors.get(error.data?.error ?? '')
    if (message) throw new Error(message)
    if (response.status === 403) {
      if (error.data?.error === 'admin_required') throw new AdminRoleRequiredError()
      if (error.data?.error === 'invalid_origin') throw new Error('The dashboard origin is not configured for moderation actions.')
      throw new AdminAccessError('You do not have permission to access the admin dashboard.')
    }
    if (response.status === 409) {
      if (error.data?.error === 'reserved_username') throw new Error('This username is reserved.')
      if (error.data?.error === 'protected_account') throw new Error('This account is protected.')
      if (error.data?.error === 'account_banned') throw new Error('Unban this account before approving it.')
      if (error.data?.error === 'attachment_required') throw new Error('Removing these attachments would leave the post empty. Delete the post instead.')
      if (error.data?.error === 'Handle is already taken') throw new Error('That username is already taken.')
      if (error.data?.error === 'report_closed') throw new Error('This report was already handled.')
      if (error.data?.error === 'report_already_open') throw new Error('The reporter has another open report on this content.')
      if (error.data?.error === 'independent_review_required') throw new Error('Another staff member has to review an appeal against your own decision.')
      if (error.data?.error === 'appeal_closed') throw new Error('This appeal was already decided.')
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

export const reportReasons = ['spam', 'harassment', 'hate', 'violence', 'sexual', 'self_harm', 'misinformation', 'impersonation', 'illegal', 'other'] as const
export const reportReasonLabels: Record<(typeof reportReasons)[number], string> = {
  spam: 'Spam', harassment: 'Harassment', hate: 'Hate speech', violence: 'Violence or threats', sexual: 'Sexual content',
  self_harm: 'Self-harm', misinformation: 'Misinformation', impersonation: 'Impersonation', illegal: 'Illegal content', other: 'Other',
}
const reportSnapshot = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('post'), kind: z.enum(['Post', 'Reply', 'Quote']), authorHandle: z.string(), authorName: z.string(),
    content: z.string(), parentId: z.uuid().nullable(), quotedPostId: z.uuid().nullable(),
    gifUrl: z.string().nullable(), imageIds: z.array(z.uuid()), hasVoice: z.boolean(), pollTitle: z.string().nullable(), createdAt: z.string(),
  }),
  z.object({
    type: z.literal('user'), handle: z.string(), displayName: z.string(), bio: z.string(), pronouns: z.string(),
    avatarUrl: z.string().nullable(), bannerUrl: z.string().nullable(),
  }),
  z.object({
    type: z.literal('message'), peerHandle: z.string(),
    messages: z.array(z.object({
      id: z.uuid(), senderId: z.uuid(), senderHandle: z.string(), text: z.string(), createdAt: z.string(), reported: z.boolean(),
    })),
  }),
])
export type ReportSnapshot = z.infer<typeof reportSnapshot>
const reportStatus = z.enum(['open', 'resolved', 'dismissed'])
const reportRow = z.object({
  id: z.uuid(), reporterId: z.uuid().nullable(), reporterHandle: z.string(),
  targetType: z.enum(['post', 'user', 'message']), targetKey: z.uuid(), targetUserId: z.uuid().nullable(), targetHandle: z.string(),
  reason: z.enum(reportReasons), details: z.string(), snapshot: reportSnapshot, status: reportStatus,
  resolution: z.string().nullable(), note: z.string().nullable(), resolvedByHandle: z.string().nullable(), resolvedAt: z.string().nullable(),
  createdAt: z.string(), openOnTarget: z.number(),
  channel: z.enum(['in_app', 'public']).default('in_app'), legalGround: z.string().nullable().default(null),
  notifierName: z.string().nullable().default(null), notifierEmail: z.string().nullable().default(null),
  goodFaithAt: z.string().nullable().default(null), escalatedAt: z.string().nullable().default(null),
  escalationAuthority: z.string().nullable().default(null), escalationRef: z.string().nullable().default(null),
})
export type ReportRow = z.infer<typeof reportRow>
export const reportPage = z.object({ reports: z.array(reportRow), hasNextPage: z.boolean(), canResolve: z.boolean(), canAct: z.boolean() })
export const reportDetail = reportRow.extend({
  related: z.array(z.object({
    id: z.uuid(), reporterHandle: z.string(), reporterId: z.uuid().nullable(), reason: z.enum(reportReasons),
    details: z.string(), status: reportStatus, createdAt: z.string(),
  })),
  target: z.object({
    exists: z.boolean(),
    owner: z.object({ id: z.uuid(), handle: z.string(), role: roles, bannedAt: z.string().nullable(), banReason: z.string().nullable() }).nullable(),
    ownerReports: z.object({ total: z.number(), actioned: z.number() }),
  }),
  canResolve: z.boolean(), canAct: z.boolean(), canBan: z.boolean(), canRemoveContent: z.boolean().default(false),
})
export type ReportDetail = z.infer<typeof reportDetail>
export type ReportResolution = {
  decision: 'resolve' | 'dismiss'
  note?: string
  removeContent?: boolean
  clearProfile?: ('bio' | 'avatar' | 'banner' | 'name')[]
  ban?: { reason: string }
  ground?: Ground
}

export async function resolveReport(id: string, resolution: ReportResolution) {
  await adminRequest('/api/admin/reports/' + id + '/resolve', undefined, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resolution),
  })
}

export async function escalateReport(id: string, authority: string, reference: string) {
  await adminRequest('/api/admin/reports/' + id + '/escalate', undefined, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authority, reference }),
  })
}

export async function reopenReport(id: string) {
  await adminRequest('/api/admin/reports/' + id + '/reopen', undefined, { method: 'POST' })
}

export function useOpenReportCount(onAccessLost: () => void, refreshKey: unknown) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const load = () => adminRequest('/api/admin/reports/summary', controller.signal)
      .then(value => setCount(z.object({ open: z.number() }).parse(value).open))
      .catch(cause => { if (cause instanceof AdminAccessError) onAccessLost() })
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [onAccessLost, refreshKey])
  return count
}
