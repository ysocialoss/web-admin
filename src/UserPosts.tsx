import { useEffect, useState } from 'react'
import { Button, ButtonGroup, Callout, Card, Classes, H2, HTMLTable, NonIdealState, Tag } from '@blueprintjs/core'
import { AdminAccessError, adminRequest, postList } from './adminApi'
import { LoadingRows, LoadingStatus } from './LoadingState'
import PostPreview, { PostVoice } from './PostPreview'

export default function UserPosts({ userId, onOpenPost, onAccessLost }: {
  userId: string
  onOpenPost: (id: string) => void
  onAccessLost: () => void
}) {
  const [page, setPage] = useState(() => {
    const value = Number(new URLSearchParams(window.location.search).get('page'))
    return Number.isInteger(value) && value >= 1 && value <= 1_000_000 ? value : 1
  })
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<ReturnType<typeof postList.parse> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ authorId: userId, page: String(page) })
    adminRequest('/api/admin/posts?' + params, controller.signal)
      .then(value => { if (!controller.signal.aborted) setResult(postList.parse(value)) })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setError(cause instanceof Error ? cause.message : 'Could not load posts.')
      })
    return () => controller.abort()
  }, [userId, page, revision, onAccessLost])

  function load(nextPage: number) {
    const query = nextPage > 1 ? '?page=' + nextPage : ''
    window.history.replaceState(window.history.state, '', window.location.pathname + query)
    setPage(nextPage)
    setResult(null)
    setError('')
    setRevision(current => current + 1)
  }

  return <Card className="admin-panel admin-profile-posts">
    <section aria-labelledby="admin-user-posts">
      <header className="admin-toolbar"><H2 id="admin-user-posts">Posts and replies</H2></header>
      {error && <Callout intent="danger" role="alert">{error} <Button onClick={() => load(page)}>Retry</Button></Callout>}
      {!result && !error && <div className="admin-list-body">
        <LoadingStatus label="Loading posts and replies…" /><LoadingRows rows={3} />
      </div>}
      {result && <>
        {result.posts.length ? <div className="overview-table-scroll">
          <HTMLTable striped className="overview-table admin-content-table">
            <thead><tr><th scope="col">Content</th><th scope="col">Type</th><th scope="col">Published</th></tr></thead>
            <tbody>{result.posts.map(post => <tr key={post.id}>
              <td><Button variant="minimal" alignText="left" onClick={() => onOpenPost(post.id)}>
                <PostPreview content={post.content} gif={post.gif} voiceUrl={post.voiceUrl} />
              </Button>
              {post.voiceUrl && <PostVoice url={post.voiceUrl} compact />}</td>
              <td><Tag minimal intent={post.kind === 'Reply' ? 'primary' : 'none'}>{post.kind}</Tag></td>
              <td className={Classes.TEXT_MUTED}><time dateTime={post.time}>{new Date(post.time).toLocaleString()}</time></td>
            </tr>)}</tbody>
          </HTMLTable>
        </div> : <NonIdealState icon="document" title={page === 1 ? 'No posts or replies yet' : 'No posts on this page'} />}
        {(page > 1 || result.hasNextPage) && <div className="admin-pagination">
          <span className={Classes.TEXT_MUTED}>Page {page}</span>
          <ButtonGroup>
            <Button icon="chevron-left" disabled={page === 1} onClick={() => load(page - 1)}>Previous</Button>
            <Button endIcon="chevron-right" disabled={!result.hasNextPage} onClick={() => load(page + 1)}>Next</Button>
          </ButtonGroup>
        </div>}
      </>}
    </section>
  </Card>
}
