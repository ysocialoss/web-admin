import { useEffect, useState } from 'react'
import { useHistoryPage } from './useHistoryPage'
import { Alert, Button, ButtonGroup, Callout, Card, Classes, H1, HTMLTable, InputGroup, NonIdealState } from '@blueprintjs/core'
import { z } from 'zod'
import { AdminAccessError, adminRequest } from './adminApi'
import { LoadingRows, LoadingStatus } from './LoadingState'
import UserAvatar from './UserAvatar'

const waitlist = z.object({
  users: z.array(z.object({
    id: z.uuid(), name: z.string(), handle: z.string(), joined: z.string(), avatarUrl: z.string().nullable(),
  })),
  hasNextPage: z.boolean(),
  canApprove: z.boolean(),
})
type Applicant = z.infer<typeof waitlist>['users'][number]

export default function Waitlist({ onAccessLost, onOpenUser }: {
  onAccessLost: () => void
  onOpenUser: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useHistoryPage()
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<z.infer<typeof waitlist> | null>(null)
  const [error, setError] = useState('')
  const [applicant, setApplicant] = useState<Applicant | null>(null)
  const [approving, setApproving] = useState(false)
  const [approvalError, setApprovalError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ q: query, page: String(page) })
    adminRequest('/api/admin/waitlist?' + params, controller.signal)
      .then(value => {
        if (controller.signal.aborted) return
        setResult(waitlist.parse(value))
        setError('')
      })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setError(cause instanceof Error ? cause.message : 'Could not load the waitlist.')
      })
    return () => controller.abort()
  }, [query, page, revision, onAccessLost])

  useEffect(() => {
    let stream: EventSource
    let retry: number | undefined
    const refresh = () => setRevision(value => value + 1)
    function connect() {
      stream = new EventSource('/api/admin/waitlist/live')
      stream.addEventListener('open', refresh)
      stream.addEventListener('waitlist', refresh)
      stream.addEventListener('resync', refresh)
      stream.addEventListener('error', () => {
        if (stream.readyState === EventSource.CLOSED) {
          refresh()
          retry = window.setTimeout(connect, 5000)
        }
      })
    }
    connect()
    return () => { stream.close(); window.clearTimeout(retry) }
  }, [])

  function load(nextPage: number) {
    setPage(nextPage)
    setResult(null)
    setError('')
    setRevision(current => current + 1)
  }

  async function approve(user: Applicant) {
    setApproving(true)
    setApprovalError('')
    try {
      await adminRequest('/api/admin/waitlist/' + user.id + '/approve', undefined, { method: 'POST' })
      setApplicant(null)
      setNotice(user.handle + ' approved.')
      load(result?.users.length === 1 && page > 1 ? page - 1 : page)
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setApprovalError(cause instanceof Error ? cause.message : 'Could not approve this account.')
    } finally {
      setApproving(false)
    }
  }

  return <section className="overview" aria-labelledby="waitlist-title">
    <header className="overview-heading">
      <H1 id="waitlist-title">Waitlist</H1>
      <Button icon="refresh" variant="minimal" onClick={() => load(page)}>Refresh</Button>
    </header>
    {notice && <Callout className="admin-notice" intent="success" role="status">{notice}</Callout>}
    <Card className="admin-panel">
      <div className="admin-toolbar">
        <form role="search" onSubmit={event => { event.preventDefault(); setNotice(''); setQuery(search.trim()); load(1) }}>
          <InputGroup type="search" leftIcon="search" aria-label="Search waitlist" placeholder="Search by name or handle"
            value={search} maxLength={255} onChange={event => setSearch(event.currentTarget.value)}
            rightElement={<Button type="submit" variant="minimal">Search</Button>} />
        </form>
      </div>
      {error && <Callout intent="danger" role="alert">{error} <Button onClick={() => load(page)}>Retry</Button></Callout>}
      {!error && !result && <div className="admin-list-body">
        <LoadingStatus label="Loading waitlist…" /><LoadingRows rows={4} />
      </div>}
      {result && <>
        {result.users.length ? <div className="overview-table-scroll">
          <HTMLTable striped className="overview-table">
            <thead><tr><th scope="col">Account</th><th scope="col">Joined</th>{result.canApprove && <th scope="col">Approval</th>}</tr></thead>
            <tbody>{result.users.map(user => <tr key={user.id}>
              <td><Button variant="minimal" alignText="left" className="admin-user-link"
                icon={<UserAvatar src={user.avatarUrl} />} onClick={() => onOpenUser(user.id)}>
                <strong>{user.name || user.handle}</strong>
                {user.name && <span className={Classes.TEXT_MUTED}>{user.handle}</span>}
              </Button></td>
              <td><time dateTime={user.joined}>{new Date(user.joined).toLocaleString()}</time></td>
              {result.canApprove && <td><Button small intent="success" icon="tick" aria-label={`Approve ${user.handle}`}
                onClick={() => { setApprovalError(''); setApplicant(user) }}>Approve</Button></td>}
            </tr>)}</tbody>
          </HTMLTable>
        </div> : <NonIdealState icon="tick-circle" title={query ? 'No matching accounts' : 'No accounts awaiting approval'} />}
        {(page > 1 || result.hasNextPage) && <div className="admin-pagination">
          <span className={Classes.TEXT_MUTED}>Page {page}</span>
          <ButtonGroup>
            <Button icon="chevron-left" disabled={page === 1} onClick={() => load(page - 1)}>Previous</Button>
            <Button endIcon="chevron-right" disabled={!result.hasNextPage} onClick={() => load(page + 1)}>Next</Button>
          </ButtonGroup>
        </div>}
      </>}
    </Card>
    {applicant && <Alert isOpen icon="tick" intent="success" loading={approving}
      confirmButtonText="Approve account" cancelButtonText="Cancel"
      onCancel={() => setApplicant(null)} onConfirm={() => void approve(applicant)}>
      <p>Approve {applicant.handle} to post, follow accounts, and edit their profile?</p>
      {approvalError && <Callout intent="danger" role="alert">{approvalError}</Callout>}
    </Alert>}
  </section>
}
