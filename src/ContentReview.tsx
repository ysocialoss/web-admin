import { useEffect, useState } from 'react'
import { Alert, Button, ButtonGroup, Callout, Card, Classes, FormGroup, H1, HTMLSelect, HTMLTable, InputGroup, NonIdealState, SegmentedControl, Tag } from '@blueprintjs/core'
import { z } from 'zod'
import { AdminAccessError, adminRequest, postList, removeWithGround, setPostVisibility } from './adminApi'
import { LoadingRows, LoadingStatus } from './LoadingState'
import ContentMenu, { type ContentAction } from './ContentMenu'
import PostPreview, { PostVoice } from './PostPreview'
import { requestGround } from './ground'

const authorFilter = z.string().trim().toLowerCase().regex(/^(?:@?[a-z0-9_]{3,32})?$/)
const periodFilter = z.enum(['all', '1d', '7d', '30d']).catch('all')
const sortFilter = z.enum(['newest', 'oldest', 'author_asc', 'author_desc']).catch('newest')
const defaultFilters = { q: '', author: '', period: periodFilter.parse(undefined), sort: sortFilter.parse(undefined) }
type PostRow = z.infer<typeof postList>['posts'][number]
type PostChange = { post: PostRow; kind: 'visibility' | 'post' | 'gif' | 'voice' | 'images' | 'all' }
const attachmentLabels = { gif: 'GIF', voice: 'voice message', images: 'images' }

function changeLabel({ post, kind }: PostChange) {
  if (kind === 'visibility') return (post.hiddenAt ? 'Unhide ' : 'Hide ') + post.kind
  if (kind === 'post') return 'Delete ' + post.kind
  if (kind === 'all') return 'Clear All Attachments'
  return 'Remove ' + attachmentLabels[kind]
}

export default function ContentReview({ type, onType, onOpenPost, onOpenUser, onAccessLost, notice }: {
  type: string
  onType: (type: string) => void
  onOpenPost: (id: string) => void
  onOpenUser: (id: string) => void
  onAccessLost: () => void
  notice: string
}) {
  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      q: (params.get('q') ?? '').trim().slice(0, 255),
      author: authorFilter.catch('').parse(params.get('author')),
      period: periodFilter.parse(params.get('period')),
      sort: sortFilter.parse(params.get('sort')),
    }
  })
  const [search, setSearch] = useState(filters.q)
  const [author, setAuthor] = useState(filters.author)
  const validAuthor = authorFilter.safeParse(author)
  const [page, setPage] = useState(() => {
    const value = Number(new URLSearchParams(window.location.search).get('page'))
    return Number.isInteger(value) && value >= 1 && value <= 1_000_000 ? value : 1
  })
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<ReturnType<typeof postList.parse> | null>(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<{ intent: 'success' | 'danger'; text: string } | null>(null)
  const [change, setChange] = useState<PostChange | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removalError, setRemovalError] = useState('')

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setFeedback({ intent: 'success', text: label + ' copied.' })
    } catch {
      setFeedback({ intent: 'danger', text: 'Could not copy ' + label.toLowerCase() + '.' })
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ ...filters, type, page: String(page) })
    adminRequest('/api/admin/posts?' + params, controller.signal)
      .then(value => { if (!controller.signal.aborted) setResult(postList.parse(value)) })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setError(cause instanceof Error ? cause.message : 'Could not load content.')
      })
    return () => controller.abort()
  }, [type, page, filters, revision, onAccessLost])

  function load(nextPage: number, nextFilters = filters) {
    const params = new URLSearchParams()
    if (nextFilters.q) params.set('q', nextFilters.q)
    if (nextFilters.author) params.set('author', nextFilters.author)
    if (nextFilters.period !== 'all') params.set('period', nextFilters.period)
    if (nextFilters.sort !== 'newest') params.set('sort', nextFilters.sort)
    if (nextPage > 1) params.set('page', String(nextPage))
    const url = window.location.pathname + (params.size ? '?' + params : '')
    if (url !== window.location.pathname + window.location.search) {
      if (nextPage !== page) window.history.pushState(window.history.state, '', url)
      else window.history.replaceState(window.history.state, '', url)
    }
    setFilters(nextFilters)
    setPage(nextPage)
    setResult(null)
    setError('')
    setRevision(current => current + 1)
  }

  function clearFilters() {
    setSearch('')
    setAuthor('')
    load(1, defaultFilters)
    if (type !== 'all') onType('all')
  }

  function postActions(post: PostRow, permissions: Pick<NonNullable<typeof result>, 'canModerate' | 'canSetVisibility'>): ContentAction[] {
    const actions: ContentAction[] = [
      { label: 'Open details', icon: 'document-open', run: () => onOpenPost(post.id) },
      { label: 'Copy post ID', icon: 'clipboard', run: () => void copy(post.id, 'Post ID') },
    ]
    if (post.content) actions.push({ label: 'Copy text', icon: 'clipboard', run: () => void copy(post.content, 'Post text') })
    function changeAction(kind: PostChange['kind']): ContentAction {
      return {
        label: changeLabel({ post, kind }),
        icon: kind === 'visibility' ? (post.hiddenAt ? 'eye-open' : 'eye-off') : kind === 'post' ? 'trash' : 'eraser',
        intent: kind === 'visibility' ? undefined : 'danger',
        run: () => { setRemovalError(''); setChange({ post, kind }) },
      }
    }

    if (permissions.canSetVisibility) actions.push(changeAction('visibility'))
    if (!permissions.canModerate) return actions
    if (post.gif) actions.push(changeAction('gif'))
    if (post.voiceUrl) actions.push(changeAction('voice'))
    if (post.imageIds.length) actions.push(changeAction('images'))
    if (post.gif || post.voiceUrl || post.imageIds.length || post.hasPoll) actions.push(changeAction('all'))
    actions.push(changeAction('post'))
    return actions
  }

  async function applyChange({ post, kind }: PostChange) {
    setRemoving(true)
    setRemovalError('')
    try {
      const ground = kind === 'visibility' && post.hiddenAt ? undefined
        : await requestGround(kind === 'visibility' ? 'Why hide this?' : kind === 'post' ? 'Why delete this?' : 'Why remove this attachment?')
      if (!ground && !(kind === 'visibility' && post.hiddenAt)) return
      if (kind === 'visibility') await setPostVisibility(post.id, !post.hiddenAt, ground ?? undefined)
      else await removeWithGround('/api/admin/posts/' + post.id + (kind === 'post' ? '' : '/attachments/' + kind), ground!)
      setChange(null)
      setFeedback({ intent: 'success', text: kind === 'visibility' ? post.kind + (post.hiddenAt ? ' unhidden.' : ' hidden.')
        : kind === 'post' ? post.kind + ' deleted.'
        : kind === 'all' ? 'Attachments cleared.' : kind === 'images' ? 'Images removed.'
          : kind === 'gif' ? 'GIF removed.' : 'Voice message removed.' })
      load(kind === 'post' && result?.posts.length === 1 && page > 1 ? page - 1 : page)
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setRemovalError(cause instanceof Error ? cause.message : 'Could not complete this action.')
    } finally {
      setRemoving(false)
    }
  }

  return <section className="overview" aria-labelledby="content-heading">
    <header className="overview-heading">
      <H1 id="content-heading">Content review</H1>
      <Button icon="refresh" variant="minimal" onClick={() => load(page)}>Refresh</Button>
    </header>
    {notice && <Callout intent="success" className="admin-notice" role="status">{notice}</Callout>}
    {feedback && <Callout intent={feedback.intent} className="admin-notice" role="status">{feedback.text}</Callout>}
    <Card className="admin-panel">
      <div className="admin-toolbar">
        <SegmentedControl aria-label="Content type" value={type} onValueChange={onType} options={[
          { label: 'All content', value: 'all' }, { label: 'Posts', value: 'post' }, { label: 'Replies', value: 'reply' },
        ]} />
        <Button variant="minimal" icon="filter-remove" onClick={clearFilters}
          disabled={!search && !author && !filters.q && !filters.author && filters.period === 'all' && filters.sort === 'newest' && type === 'all'}>Reset</Button>
      </div>
      <form role="search" className="admin-content-filters" onSubmit={event => {
        event.preventDefault()
        if (validAuthor.success) load(1, { ...filters, q: search.trim(), author: validAuthor.data })
      }}>
        <FormGroup label="Search" labelFor="content-query">
          <InputGroup id="content-query" type="search" leftIcon="search" aria-label="Search content" placeholder="Search by author or text"
            value={search} maxLength={255} onChange={event => setSearch(event.currentTarget.value)}
            rightElement={<Button type="submit" variant="minimal" disabled={!validAuthor.success}>Search</Button>} />
        </FormGroup>
        <FormGroup label="Author" labelFor="content-author" intent={validAuthor.success ? 'none' : 'warning'}
          helperText={validAuthor.success ? undefined : 'Enter a complete username.'}>
          <InputGroup id="content-author" placeholder="@username" value={author} maxLength={33}
            intent={validAuthor.success ? 'none' : 'warning'} onChange={event => setAuthor(event.currentTarget.value)} />
        </FormGroup>
        <FormGroup label="Published" labelFor="content-period">
          <HTMLSelect id="content-period" fill value={filters.period} onChange={event => load(1, {
            ...filters, period: periodFilter.parse(event.currentTarget.value),
          })} options={[
            { value: 'all', label: 'Any time' }, { value: '1d', label: 'Last 24 hours' },
            { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' },
          ]} />
        </FormGroup>
        <FormGroup label="Sort by" labelFor="content-sort">
          <HTMLSelect id="content-sort" fill value={filters.sort} onChange={event => load(1, {
            ...filters, sort: sortFilter.parse(event.currentTarget.value),
          })} options={[
            { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' },
            { value: 'author_asc', label: 'Author A–Z' }, { value: 'author_desc', label: 'Author Z–A' },
          ]} />
        </FormGroup>
      </form>
      {error && <Callout intent="danger" role="alert">{error} <Button onClick={() => load(page)}>Retry</Button></Callout>}
      {!result && !error && <div className="admin-list-body">
        <LoadingStatus label="Loading content…" /><LoadingRows rows={5} />
      </div>}
      {result && <>
        {result.posts.length ? <div className="overview-table-scroll">
          <HTMLTable striped className="overview-table admin-content-table">
            <thead><tr><th scope="col">Content</th><th scope="col">Author</th><th scope="col">Type</th><th scope="col">Published</th></tr></thead>
            <tbody>{result.posts.map(post => <tr key={post.id}>
              <td><ContentMenu label={post.content || post.gif?.title || (post.imageIds.length ? 'Image attachment' : post.voiceUrl ? 'Voice message' : 'Open media post')}
                onActivate={() => onOpenPost(post.id)} actions={postActions(post, result)}>
                <PostPreview content={post.content} gif={post.gif} voiceUrl={post.voiceUrl} imageIds={post.imageIds} />
              </ContentMenu>
              {post.voiceUrl && <PostVoice url={post.voiceUrl} compact />}</td>
              <td><ContentMenu label={post.author} actions={[
                { label: 'Open author profile', icon: 'person', run: () => onOpenUser(post.authorId) },
                { label: 'Filter by this author', icon: 'filter', run: () => {
                  setAuthor(post.author)
                  load(1, { ...filters, author: post.author })
                } },
                { label: 'Copy handle', icon: 'clipboard', run: () => void copy(post.author, 'Handle') },
              ]}>{post.author}</ContentMenu></td>
              <td><ContentMenu label={post.kind} actions={[
                { label: post.kind === 'Post' ? 'Show only posts' : 'Show only replies', icon: 'filter', run: () => onType(post.kind.toLowerCase()) },
                { label: 'Show all content', icon: 'filter-remove', run: () => onType('all') },
              ]}><Tag minimal intent={post.kind === 'Reply' ? 'primary' : 'none'}>{post.kind}</Tag></ContentMenu>
              {post.hiddenAt && <Tag minimal intent="warning">Hidden</Tag>}</td>
              <td className={Classes.TEXT_MUTED}><ContentMenu label={new Date(post.time).toLocaleString()} actions={[
                { label: 'Copy timestamp', icon: 'clipboard', run: () => void copy(post.time, 'Timestamp') },
              ]}><time dateTime={post.time}>{new Date(post.time).toLocaleString()}</time></ContentMenu></td>
            </tr>)}</tbody>
          </HTMLTable>
        </div> : <NonIdealState icon="search" title="No matching content" description="Try adjusting your filters." />}
        <div className="admin-pagination">
          <span className={Classes.TEXT_MUTED}>Page {page}</span>
          <ButtonGroup>
            <Button icon="chevron-left" disabled={page === 1} onClick={() => load(page - 1)}>Previous</Button>
            <Button endIcon="chevron-right" disabled={!result.hasNextPage} onClick={() => load(page + 1)}>Next</Button>
          </ButtonGroup>
        </div>
      </>}
    </Card>
    {change && <Alert isOpen intent={change.kind === 'visibility' ? 'primary' : 'danger'}
      icon={change.kind === 'visibility' ? (change.post.hiddenAt ? 'eye-open' : 'eye-off') : 'trash'} loading={removing}
      cancelButtonText="Cancel" confirmButtonText={changeLabel(change)}
      onCancel={() => setChange(null)} onConfirm={() => void applyChange(change)}>
      <p>{change.kind === 'visibility' ? `${changeLabel(change)} by ${change.post.author}?`
        : change.kind === 'post'
          ? `Permanently delete this ${change.post.kind.toLowerCase()} by ${change.post.author} and all its replies?`
          : change.kind === 'all'
            ? `Clear all attachments from this ${change.post.kind.toLowerCase()} by ${change.post.author}? Clearing a poll also removes its votes.`
            : `Remove the ${attachmentLabels[change.kind]} from this ${change.post.kind.toLowerCase()} by ${change.post.author}?`}</p>
      {removalError && <Callout intent="danger" role="alert">{removalError}</Callout>}
    </Alert>}
  </section>
}
