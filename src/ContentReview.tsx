import { useEffect, useState } from 'react'
import { Alert, Button, ButtonGroup, Callout, Card, Classes, FormGroup, H1, HTMLSelect, HTMLTable, InputGroup, NonIdealState, SegmentedControl, Tag } from '@blueprintjs/core'
import { z } from 'zod'
import { AdminAccessError, adminRequest, postList } from './adminApi'
import { LoadingRows, LoadingStatus } from './LoadingState'
import ContentMenu, { type ContentAction } from './ContentMenu'
import PostPreview, { PostVoice } from './PostPreview'

const authorFilter = z.string().trim().toLowerCase().regex(/^(?:@?[a-z0-9_]{3,32})?$/)
const periodFilter = z.enum(['all', '1d', '7d', '30d']).catch('all')
const sortFilter = z.enum(['newest', 'oldest', 'author_asc', 'author_desc']).catch('newest')
const defaultFilters = { q: '', author: '', period: periodFilter.parse(undefined), sort: sortFilter.parse(undefined) }
type PostRow = z.infer<typeof postList>['posts'][number]
type Removal = { post: PostRow; kind: 'post' | 'gif' | 'voice' | 'all' }

function removalLabel({ post, kind }: Removal) {
  if (kind === 'post') return 'Delete ' + post.kind
  if (kind === 'all') return 'Clear All Attachments'
  return kind === 'gif' ? 'Remove GIF' : 'Remove Voice Message'
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
  const [removal, setRemoval] = useState<Removal | null>(null)
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
    window.history.replaceState(window.history.state, '', window.location.pathname + (params.size ? '?' + params : ''))
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

  function postActions(post: PostRow, canModerate: boolean): ContentAction[] {
    const actions: ContentAction[] = [
      { label: 'Open details', icon: 'document-open', run: () => onOpenPost(post.id) },
      { label: 'Copy post ID', icon: 'clipboard', run: () => void copy(post.id, 'Post ID') },
    ]
    if (post.content) actions.push({ label: 'Copy text', icon: 'clipboard', run: () => void copy(post.content, 'Post text') })
    if (!canModerate) return actions

    function removalAction(kind: Removal['kind']): ContentAction {
      return {
        label: removalLabel({ post, kind }), icon: kind === 'post' ? 'trash' : 'eraser', intent: 'danger',
        run: () => { setRemovalError(''); setRemoval({ post, kind }) },
      }
    }

    if (post.gif) actions.push(removalAction('gif'))
    if (post.voiceUrl) actions.push(removalAction('voice'))
    if (post.gif || post.voiceUrl || post.hasPoll) actions.push(removalAction('all'))
    actions.push(removalAction('post'))
    return actions
  }

  async function remove({ post, kind }: Removal) {
    setRemoving(true)
    setRemovalError('')
    try {
      await adminRequest('/api/admin/posts/' + post.id + (kind === 'post' ? '' : '/attachments/' + kind), undefined, { method: 'DELETE' })
      setRemoval(null)
      setFeedback({ intent: 'success', text: kind === 'post' ? post.kind + ' deleted.'
        : kind === 'all' ? 'Attachments cleared.' : kind === 'gif' ? 'GIF removed.' : 'Voice message removed.' })
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
              <td><ContentMenu label={post.content || post.gif?.title || (post.voiceUrl ? 'Voice message' : 'Open media post')}
                onActivate={() => onOpenPost(post.id)} actions={postActions(post, result.canModerate)}>
                <PostPreview content={post.content} gif={post.gif} voiceUrl={post.voiceUrl} />
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
              ]}><Tag minimal intent={post.kind === 'Reply' ? 'primary' : 'none'}>{post.kind}</Tag></ContentMenu></td>
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
    {removal && <Alert isOpen intent="danger" icon="trash" loading={removing}
      cancelButtonText="Cancel" confirmButtonText={removalLabel(removal)}
      onCancel={() => setRemoval(null)} onConfirm={() => void remove(removal)}>
      <p>{removal.kind === 'post'
        ? `Permanently delete this ${removal.post.kind.toLowerCase()} by ${removal.post.author} and all its replies?`
        : removal.kind === 'all'
          ? `Clear all attachments from this ${removal.post.kind.toLowerCase()} by ${removal.post.author}? Clearing a poll also removes its votes.`
        : `Remove the ${removal.kind === 'gif' ? 'GIF' : 'voice message'} from this ${removal.post.kind.toLowerCase()} by ${removal.post.author}?`}</p>
      {removalError && <Callout intent="danger" role="alert">{removalError}</Callout>}
    </Alert>}
  </section>
}
