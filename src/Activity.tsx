import { useEffect, useState } from 'react'
import { Button, ButtonGroup, Callout, Card, Classes, H1, HTMLTable, NonIdealState, Tag } from '@blueprintjs/core'
import { z } from 'zod'
import { AdminAccessError, adminRequest } from './adminApi'
import { LoadingRows, LoadingStatus } from './LoadingState'

const activityPage = z.object({
  entries: z.array(z.object({
    id: z.uuid(),
    actorId: z.uuid(),
    actorHandle: z.string(),
    targetId: z.uuid(),
    targetHandle: z.string(),
    action: z.string(),
    detail: z.string().nullable(),
    createdAt: z.string(),
  })),
  hasNextPage: z.boolean(),
})

const actionLabels: Record<string, string> = {
  clearBio: 'Cleared bio',
  clearAvatar: 'Cleared avatar',
  clearBanner: 'Cleared banner',
  changeUsername: 'Changed username',
  changeName: 'Changed display name',
  changeBio: 'Changed bio',
  changePronouns: 'Changed pronouns',
  changeRole: 'Changed role',
  addBadge: 'Added badge',
  removeBadge: 'Removed badge',
  removePost: 'Removed content',
  removeGif: 'Removed GIF',
  removeVoice: 'Removed voice message',
  removeImages: 'Removed images',
  removeImageFlag: 'Removed image flag',
  clearAttachments: 'Cleared attachments',
  approveUser: 'Approved account',
  banUser: 'Banned account',
  unbanUser: 'Unbanned account',
  removeUser: 'Removed account',
}

export default function Activity({ onAccessLost, onOpenUser, onOpenPost }: {
  onAccessLost: () => void
  onOpenUser: (id: string) => void
  onOpenPost: (id: string) => void
}) {
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<z.infer<typeof activityPage> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    adminRequest('/api/admin/activity?page=' + page, controller.signal)
      .then(value => { if (!controller.signal.aborted) setResult(activityPage.parse(value)) })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setError(cause instanceof Error ? cause.message : 'Could not load activity.')
      })
    return () => controller.abort()
  }, [page, revision, onAccessLost])

  function load(nextPage: number) {
    setPage(nextPage)
    setResult(null)
    setError('')
    setRevision(current => current + 1)
  }

  return <section className="overview" aria-labelledby="activity-heading">
    <header className="overview-heading">
      <H1 id="activity-heading">Activity history</H1>
      <Button icon="refresh" variant="minimal" onClick={() => load(page)}>Refresh</Button>
    </header>
    <Card className="admin-panel">
      {error && <Callout intent="danger" role="alert">{error} <Button onClick={() => load(page)}>Retry</Button></Callout>}
      {!result && !error && <div className="admin-list-body">
        <LoadingStatus label="Loading activity…" /><LoadingRows rows={5} />
      </div>}
      {result && <>
        {result.entries.length ? <div className="overview-table-scroll">
          <HTMLTable striped className="overview-table admin-activity-table">
            <thead><tr><th scope="col">Action</th><th scope="col">Staff member</th><th scope="col">Target</th><th scope="col">Time</th></tr></thead>
            <tbody>{result.entries.map(entry => <tr key={entry.id}>
              <td>
                <Tag minimal intent={['removePost', 'removeImageFlag', 'banUser', 'removeUser'].includes(entry.action) ? 'danger' : 'primary'}>{actionLabels[entry.action] ?? entry.action}</Tag>
                {entry.detail && <div className={Classes.TEXT_MUTED}>{entry.detail}</div>}
              </td>
              <td><Button variant="minimal" onClick={() => onOpenUser(entry.actorId)}>@{entry.actorHandle}</Button></td>
              <td className="admin-activity-target">{entry.action === 'removePost'
                ? <><div>{entry.targetHandle ? 'By @' + entry.targetHandle : 'Content'}</div><code>{entry.targetId}</code></>
                : ['removeGif', 'removeVoice', 'removeImages', 'clearAttachments'].includes(entry.action)
                  ? <Button variant="minimal" onClick={() => onOpenPost(entry.targetId)}>
                      {entry.targetHandle ? 'Post by @' + entry.targetHandle : 'View post'}
                    </Button>
                  : entry.action === 'removeUser' ? '@' + entry.targetHandle
                    : <Button variant="minimal" onClick={() => onOpenUser(entry.targetId)}>@{entry.targetHandle}</Button>}</td>
              <td className={Classes.TEXT_MUTED}><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></td>
            </tr>)}</tbody>
          </HTMLTable>
        </div> : <NonIdealState icon="history" title="No moderation actions yet" />}
        <div className="admin-pagination">
          <span className={Classes.TEXT_MUTED}>Page {page}</span>
          <ButtonGroup>
            <Button icon="chevron-left" disabled={page === 1} onClick={() => load(page - 1)}>Previous</Button>
            <Button endIcon="chevron-right" disabled={!result.hasNextPage} onClick={() => load(page + 1)}>Next</Button>
          </ButtonGroup>
        </div>
      </>}
    </Card>
  </section>
}
