import { useCallback, useEffect, useMemo, useState } from 'react'
import { pageUrl, useHistoryPage } from './useHistoryPage'
import {
  AnchorButton, Button, ButtonGroup, Callout, Card, Checkbox, Classes, H1, H2, HTMLSelect, HTMLTable, InputGroup,
  NonIdealState, PopoverNext, Tag,
} from '@blueprintjs/core'
import type { Intent } from '@blueprintjs/core'
import { z } from 'zod'
import { AdminAccessError, adminRequest } from './adminApi'
import { LoadingRows, LoadingStatus } from './LoadingState'
import BarChart from './BarChart'

const entry = z.object({
  id: z.uuid(), actorId: z.uuid(), actorHandle: z.string(), targetId: z.uuid(), targetHandle: z.string(),
  action: z.string(), detail: z.string().nullable(), createdAt: z.string(),
})
const activityPage = z.object({ entries: z.array(entry), hasNextPage: z.boolean(), total: z.number(), pageSize: z.number() })
const facetsSchema = z.object({
  actions: z.array(z.object({ action: z.string(), count: z.number() })),
  actors: z.array(z.object({ id: z.uuid(), handle: z.string(), count: z.number() })),
  totals: z.object({ total: z.number(), last24h: z.number(), last7d: z.number(), last30d: z.number(), first: z.string().nullable() }),
  byDay: z.array(z.object({ day: z.string(), count: z.number() })),
})

const actionLabels: Record<string, string> = {
  clearBio: 'Cleared bio', clearAvatar: 'Cleared avatar', clearBanner: 'Cleared banner',
  replaceAvatar: 'Replaced avatar', replaceBanner: 'Replaced banner', changeUsername: 'Changed username',
  changeName: 'Changed display name', changeBio: 'Changed bio', changePronouns: 'Changed pronouns',
  changeRole: 'Changed role', addBadge: 'Added badge', removeBadge: 'Removed badge',
  removePost: 'Removed content', hidePost: 'Hid content', unhidePost: 'Restored visibility',
  editPostText: 'Edited post text', removeGif: 'Removed GIF', removeVoice: 'Removed voice message',
  addImage: 'Added image', replaceImage: 'Replaced image', removeImage: 'Removed image', removeImages: 'Removed images',
  removeImageFlag: 'Removed image flag', clearAttachments: 'Cleared attachments', approveUser: 'Approved account',
  banUser: 'Banned account', unbanUser: 'Unbanned account', removeUser: 'Removed account',
  updateFeedConfig: 'Changed feed configuration',
}
const label = (action: string) => actionLabels[action] ?? action
const destructive = new Set(['removePost', 'removeImageFlag', 'banUser', 'removeUser'])
const intentFor = (action: string): Intent => destructive.has(action) ? 'danger' : ['approveUser', 'unbanUser', 'unhidePost'].includes(action) ? 'success' : 'primary'
const postActions = new Set(['hidePost', 'unhidePost', 'editPostText', 'removeGif', 'removeVoice', 'addImage', 'replaceImage', 'removeImage', 'removeImages', 'clearAttachments'])

type Filters = { q: string; actions: string[]; actor: string; target: string; from: string; to: string; sort: 'newest' | 'oldest'; size: number }
const defaults: Filters = { q: '', actions: [], actor: '', target: '', from: '', to: '', sort: 'newest', size: 25 }
const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search)
  const size = Number(params.get('size'))
  return {
    q: params.get('q')?.slice(0, 255) ?? '',
    actions: (params.get('action') ?? '').split(',').filter(value => /^[A-Za-z]{1,40}$/.test(value)).slice(0, 40),
    actor: params.get('actor') ?? '',
    target: params.get('target') ?? '',
    from: dateValue.safeParse(params.get('from')).data ?? '',
    to: dateValue.safeParse(params.get('to')).data ?? '',
    sort: params.get('sort') === 'oldest' ? 'oldest' : 'newest',
    size: [25, 50, 100].includes(size) ? size : 25,
  }
}

function filterParams(filters: Filters) {
  const params = new URLSearchParams()
  if (filters.q.trim()) params.set('q', filters.q.trim())
  if (filters.actions.length) params.set('action', filters.actions.join(','))
  if (filters.actor) params.set('actor', filters.actor)
  if (filters.target.trim()) params.set('target', filters.target.trim().replace(/^@/, ''))
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.sort !== 'newest') params.set('sort', filters.sort)
  if (filters.size !== 25) params.set('size', String(filters.size))
  return params
}

// Date inputs are local calendar days; the API takes instants.
function apiParams(filters: Filters, extra: Record<string, string> = {}) {
  const params = filterParams(filters)
  params.delete('size')
  params.delete('from')
  params.delete('to')
  if (filters.from) params.set('from', new Date(filters.from + 'T00:00:00').toISOString())
  if (filters.to) params.set('to', new Date(filters.to + 'T23:59:59.999').toISOString())
  for (const [key, value] of Object.entries(extra)) params.set(key, value)
  return params
}

const hasFilters = (filters: Filters) => filterParams({ ...filters, sort: 'newest', size: 25 }).size > 0

export default function Activity({ onAccessLost, onOpenUser, onOpenPost }: {
  onAccessLost: () => void
  onOpenUser: (id: string) => void
  onOpenPost: (id: string) => void
}) {
  const [page, setPage] = useHistoryPage()
  const [filters, setFilters] = useState(readFilters)
  const [searchInput, setSearchInput] = useState(filters.q)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<z.infer<typeof activityPage> | null>(null)
  const [facets, setFacets] = useState<z.infer<typeof facetsSchema> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    const restore = () => { const next = readFilters(); setFilters(next); setSearchInput(next.q) }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  const query = useMemo(() => apiParams(filters, { page: String(page), pageSize: String(filters.size) }).toString(), [filters, page])

  useEffect(() => {
    const controller = new AbortController()
    adminRequest('/api/admin/activity?' + query, controller.signal)
      .then(value => {
        if (controller.signal.aborted) return
        setResult(activityPage.parse(value))
        setError('')
        setLoading(false)
      })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else { setError(cause instanceof Error ? cause.message : 'Could not load activity.'); setLoading(false) }
      })
    return () => controller.abort()
  }, [query, revision, onAccessLost])

  useEffect(() => {
    const controller = new AbortController()
    adminRequest('/api/admin/activity/facets', controller.signal)
      .then(value => { if (!controller.signal.aborted) setFacets(facetsSchema.parse(value)) })
      .catch(cause => { if (cause instanceof AdminAccessError && !controller.signal.aborted) onAccessLost() })
    return () => controller.abort()
  }, [revision, onAccessLost])

  const apply = useCallback((patch: Partial<Filters>) => {
    const next = { ...filters, ...patch }
    const params = filterParams(next)
    window.history.pushState(window.history.state, '', pageUrl(1, params))
    setFilters(next)
    setPage(1)
    setLoading(true)
  }, [filters, setPage])

  useEffect(() => {
    if (searchInput.trim() === filters.q) return
    const timer = window.setTimeout(() => apply({ q: searchInput.trim() }), 350)
    return () => window.clearTimeout(timer)
  }, [searchInput, filters.q, apply])

  function reload() {
    setLoading(true)
    setError('')
    setRevision(value => value + 1)
  }

  function goTo(next: number) {
    setPage(next)
    setLoading(true)
  }

  function clear() {
    setSearchInput('')
    apply({ ...defaults, sort: filters.sort, size: filters.size })
  }

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(id)
      window.setTimeout(() => setCopied(current => current === id ? '' : current), 1500)
    } catch {
      // Clipboard access can be denied; the ID stays visible for manual copy.
    }
  }

  const exportQuery = apiParams(filters, { sort: filters.sort }).toString()
  const total = result?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / filters.size))
  const first = total ? (page - 1) * filters.size + 1 : 0
  const last = result ? (page - 1) * filters.size + result.entries.length : 0
  const actorHandle = facets?.actors.find(actor => actor.handle === filters.actor)?.handle
  const chips: { key: string; text: string; clear: () => void }[] = [
    ...(filters.q ? [{ key: 'q', text: `Search: ${filters.q}`, clear: () => { setSearchInput(''); apply({ q: '' }) } }] : []),
    ...filters.actions.map(action => ({ key: 'a' + action, text: label(action), clear: () => apply({ actions: filters.actions.filter(item => item !== action) }) })),
    ...(filters.actor ? [{ key: 'actor', text: `Staff: @${filters.actor}`, clear: () => apply({ actor: '' }) }] : []),
    ...(filters.target ? [{ key: 'target', text: `Target: @${filters.target.replace(/^@/, '')}`, clear: () => apply({ target: '' }) }] : []),
    ...(filters.from ? [{ key: 'from', text: `From ${filters.from}`, clear: () => apply({ from: '' }) }] : []),
    ...(filters.to ? [{ key: 'to', text: `To ${filters.to}`, clear: () => apply({ to: '' }) }] : []),
  ]

  return <section className="overview" aria-labelledby="activity-heading">
    <header className="overview-heading">
      <H1 id="activity-heading">Activity history</H1>
      <div className="admin-heading-actions">
        <ButtonGroup>
          <AnchorButton icon="export" href={'/api/admin/activity/export?format=csv&' + exportQuery} download disabled={!total}>Export CSV</AnchorButton>
          <AnchorButton icon="code" href={'/api/admin/activity/export?format=json&' + exportQuery} download disabled={!total}>JSON</AnchorButton>
        </ButtonGroup>
        <Button icon="refresh" variant="minimal" onClick={reload}>Refresh</Button>
      </div>
    </header>

    {facets && <div className="admin-activity-summary">
      <Card className="admin-metric">
        <span className={Classes.TEXT_MUTED}>Recorded actions</span>
        <strong className="overview-metric-number">{facets.totals.total.toLocaleString()}</strong>
        <span className={Classes.TEXT_MUTED}>
          {facets.totals.last24h} today · {facets.totals.last7d} this week · {facets.totals.last30d} this month
          {facets.totals.first && <> · since {new Date(facets.totals.first).toLocaleDateString()}</>}
        </span>
        <BarChart data={facets.byDay} label="Actions, 30 days" unit="actions" />
      </Card>
    </div>}

    <Card className="admin-panel">
      <header className="admin-toolbar"><H2>Filters</H2>
        {hasFilters(filters) && <Button variant="minimal" icon="filter-remove" onClick={clear}>Clear filters</Button>}
      </header>
      <form className="admin-activity-filters" role="search" aria-label="Filter activity" onSubmit={event => { event.preventDefault(); apply({ q: searchInput.trim() }) }}>
        <label className="admin-field admin-field-wide">
          <span>Search</span>
          <InputGroup leftIcon="search" type="search" placeholder="Handle, action, detail or ID" value={searchInput} maxLength={255}
            onChange={event => setSearchInput(event.currentTarget.value)} />
        </label>
        <div className="admin-field">
          <span>Actions</span>
          <PopoverNext placement="bottom-start" content={<div className="admin-action-picker">
            {facets ? facets.actions.map(item => <Checkbox key={item.action} checked={filters.actions.includes(item.action)}
              onChange={() => apply({ actions: filters.actions.includes(item.action) ? filters.actions.filter(value => value !== item.action) : [...filters.actions, item.action] })}>
              {label(item.action)} <span className={Classes.TEXT_MUTED}>({item.count})</span>
            </Checkbox>) : <LoadingStatus label="Loading actions…" />}
            {facets?.actions.length === 0 && <span className={Classes.TEXT_MUTED}>No actions recorded yet.</span>}
          </div>}>
            <Button endIcon="caret-down" alignText="left" fill>{filters.actions.length ? `${filters.actions.length} selected` : 'Any action'}</Button>
          </PopoverNext>
        </div>
        <label className="admin-field">
          <span>Staff member</span>
          <HTMLSelect fill value={filters.actor} onChange={event => apply({ actor: event.currentTarget.value })}>
            <option value="">Anyone</option>
            {filters.actor && !actorHandle && <option value={filters.actor}>@{filters.actor}</option>}
            {facets?.actors.map(actor => <option key={actor.id} value={actor.handle}>@{actor.handle} ({actor.count})</option>)}
          </HTMLSelect>
        </label>
        <label className="admin-field">
          <span>Target handle</span>
          <InputGroup placeholder="@handle" value={filters.target} maxLength={33}
            onChange={event => setFilters(current => ({ ...current, target: event.currentTarget.value }))}
            onBlur={() => { if (filters.target !== readFilters().target) apply({ target: filters.target }) }}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply({ target: filters.target }) } }} />
        </label>
        <label className="admin-field">
          <span>From</span>
          <InputGroup type="date" value={filters.from} max={filters.to || undefined} onChange={event => apply({ from: event.currentTarget.value })} />
        </label>
        <label className="admin-field">
          <span>To</span>
          <InputGroup type="date" value={filters.to} min={filters.from || undefined} onChange={event => apply({ to: event.currentTarget.value })} />
        </label>
        <label className="admin-field">
          <span>Sort</span>
          <HTMLSelect fill value={filters.sort} onChange={event => apply({ sort: event.currentTarget.value === 'oldest' ? 'oldest' : 'newest' })}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
          </HTMLSelect>
        </label>
        <label className="admin-field">
          <span>Rows per page</span>
          <HTMLSelect fill value={filters.size} onChange={event => apply({ size: Number(event.currentTarget.value) })}>
            {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </HTMLSelect>
        </label>
      </form>
      {chips.length > 0 && <div className="admin-tag-row admin-filter-chips" aria-label="Active filters">
        {chips.map(chip => <Tag key={chip.key} onRemove={chip.clear} minimal>{chip.text}</Tag>)}
      </div>}
    </Card>

    <Card className="admin-panel admin-activity-results" aria-busy={loading}>
      {error && <Callout intent="danger" role="alert">{error} <Button onClick={reload}>Retry</Button></Callout>}
      {!result && !error && <div className="admin-list-body"><LoadingStatus label="Loading activity…" /><LoadingRows rows={5} /></div>}
      {result && <>
        <div className="admin-results-summary" role="status">
          {total ? `Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()} ${hasFilters(filters) ? 'matching ' : ''}actions` : 'No matching actions'}
          {loading && <span className={Classes.TEXT_MUTED}> · updating…</span>}
        </div>
        {result.entries.length ? <div className="overview-table-scroll">
          <HTMLTable striped className="overview-table admin-activity-table">
            <thead><tr><th scope="col">Action</th><th scope="col">Staff member</th><th scope="col">Target</th><th scope="col">Time</th></tr></thead>
            <tbody>{result.entries.map(row => <tr key={row.id}>
              <td>
                <Tag minimal intent={intentFor(row.action)}>{label(row.action)}</Tag>
                {row.detail && <div className={`admin-activity-detail ${Classes.TEXT_MUTED}`}>{row.detail}</div>}
              </td>
              <td><Button variant="minimal" onClick={() => onOpenUser(row.actorId)}>@{row.actorHandle}</Button>
                <Button variant="minimal" size="small" icon="filter" aria-label={`Show only actions by @${row.actorHandle}`} title="Filter by this staff member"
                  onClick={() => apply({ actor: row.actorHandle })} /></td>
              <td className="admin-activity-target">
                {row.action === 'removePost'
                  ? <><div>{row.targetHandle ? 'By @' + row.targetHandle : 'Content'}</div></>
                  : postActions.has(row.action)
                    ? <Button variant="minimal" onClick={() => onOpenPost(row.targetId)}>{row.targetHandle ? 'Post by @' + row.targetHandle : 'View post'}</Button>
                    : row.action === 'removeUser' ? '@' + row.targetHandle
                      : <Button variant="minimal" onClick={() => onOpenUser(row.targetId)}>@{row.targetHandle}</Button>}
                <div><code>{row.targetId}</code>
                  <Button variant="minimal" size="small" icon={copied === row.targetId ? 'tick' : 'duplicate'} aria-label="Copy target ID"
                    onClick={() => void copy(row.targetId)} />
                  <Button variant="minimal" size="small" icon="history" aria-label="Show all actions on this target" title="All actions on this target"
                    onClick={() => { setSearchInput(row.targetId); apply({ q: row.targetId }) }} /></div>
              </td>
              <td className={Classes.TEXT_MUTED}><time dateTime={row.createdAt} title={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time></td>
            </tr>)}</tbody>
          </HTMLTable>
        </div> : <NonIdealState icon="history" title={hasFilters(filters) ? 'No actions match these filters' : 'No moderation actions yet'}
          action={hasFilters(filters) ? <Button onClick={clear}>Clear filters</Button> : undefined} />}
        <div className="admin-pagination">
          <span className={Classes.TEXT_MUTED}>Page {page} of {lastPage.toLocaleString()}</span>
          <ButtonGroup>
            <Button icon="double-chevron-left" aria-label="First page" disabled={page === 1} onClick={() => goTo(1)} />
            <Button icon="chevron-left" disabled={page === 1} onClick={() => goTo(page - 1)}>Previous</Button>
            <Button endIcon="chevron-right" disabled={!result.hasNextPage} onClick={() => goTo(page + 1)}>Next</Button>
            <Button icon="double-chevron-right" aria-label="Last page" disabled={!result.hasNextPage} onClick={() => goTo(lastPage)} />
          </ButtonGroup>
        </div>
      </>}
    </Card>
  </section>
}
