import { useEffect, useState } from 'react'
import { useHistoryPage } from './useHistoryPage'
import { Alert, Button, ButtonGroup, Callout, Card, Classes, H1, HTMLTable, NonIdealState, Tag } from '@blueprintjs/core'
import { AdminAccessError, adminRequest, imageFlagPage } from './adminApi'
import { LoadingRows, LoadingStatus } from './LoadingState'
import { PostImage } from './PostPreview'

type FlagPage = ReturnType<typeof imageFlagPage.parse>

export default function Flags({ onAccessLost, onOpenUser }: {
  onAccessLost: () => void
  onOpenUser: (id: string) => void
}) {
  const [page, setPage] = useHistoryPage()
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<FlagPage | null>(null)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [removal, setRemoval] = useState<FlagPage['flags'][number] | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removalError, setRemovalError] = useState('')
  const [notice, setNotice] = useState('')
  const [suspected, setSuspected] = useState<FlagPage['flags'][number] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    adminRequest('/api/admin/flags?page=' + page, controller.signal)
      .then(value => {
        if (!controller.signal.aborted) setResult(imageFlagPage.parse(value))
      })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setError(cause instanceof Error ? cause.message : 'Could not load flags.')
      })
    return () => controller.abort()
  }, [page, revision, onAccessLost])

  function load(nextPage: number) {
    setPage(nextPage)
    setRevision(value => value + 1)
    setResult(null)
    setError('')
    setRevealed(null)
  }

  async function remove(flag: FlagPage['flags'][number]) {
    setRemoving(true)
    setRemovalError('')
    try {
      await adminRequest(`/api/admin/flags/${flag.id}`, undefined, { method: 'DELETE' })
      setRemoval(null)
      setNotice('Flag removed.')
      load(result?.flags.length === 1 && page > 1 ? page - 1 : page)
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setRemovalError(cause instanceof Error ? cause.message : 'Could not remove the flag.')
    } finally {
      setRemoving(false)
    }
  }

  async function markSuspected(flag: FlagPage['flags'][number]) {
    setRemoving(true)
    setRemovalError('')
    try {
      await adminRequest(`/api/admin/safety/flags/${flag.id}/suspected-csam`, undefined, { method: 'POST' })
      setSuspected(null)
      setRevealed(null)
      setNotice('Image deleted, account suspended and incident recorded. Report it from Safety incidents.')
      load(result?.flags.length === 1 && page > 1 ? page - 1 : page)
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setRemovalError(cause instanceof Error ? cause.message : 'Could not record the incident.')
    } finally {
      setRemoving(false)
    }
  }

  return <section className="overview" aria-labelledby="flags-heading">
    <header className="overview-heading">
      <H1 id="flags-heading">Flags</H1>
      <Button icon="refresh" variant="minimal" onClick={() => load(1)}>Refresh</Button>
    </header>
    {notice && <Callout className="admin-notice" intent="success" role="status">{notice}</Callout>}
    <Card className="admin-panel">
      {error && <Callout intent="danger" role="alert">{error} <Button onClick={() => load(page)}>Retry</Button></Callout>}
      {!error && !result && <><LoadingStatus label="Loading flags…" /><LoadingRows rows={5} /></>}
      {result && <>
        {result.flags.length > 0 ? <div className="overview-table-scroll">
          <HTMLTable striped className="overview-table">
            <thead><tr><th scope="col">Image</th><th scope="col">Uploader</th><th scope="col">Screening result</th><th scope="col">Flagged</th>
              {result.canRemove && <th scope="col">Actions</th>}
            </tr></thead>
            <tbody>{result.flags.map(flag => <tr key={flag.id}>
              <td>
                <div className="admin-content-excerpt">{flag.filename ?? 'Image upload'}</div>
                <Button variant="minimal" icon={revealed === flag.id ? 'eye-off' : 'eye-open'}
                  aria-expanded={revealed === flag.id} onClick={() => setRevealed(revealed === flag.id ? null : flag.id)}>
                  {revealed === flag.id ? 'Hide image' : 'Reveal image'}
                </Button>
                {revealed === flag.id && <PostImage url={`/api/admin/flags/${flag.id}/image`} alt="Flagged upload" />}
              </td>
              <td><Button variant="minimal" onClick={() => onOpenUser(flag.uploaderId)}>@{flag.handle}</Button></td>
              <td><Tag minimal intent="warning">NSFW</Tag>
                {flag.confidence !== null && <div className={Classes.TEXT_MUTED}>{flag.confidence.toFixed(1)}% confidence</div>}
              </td>
              <td><time dateTime={flag.createdAt}>{new Date(flag.createdAt).toLocaleString()}</time></td>
              {result.canRemove && <td><Button variant="minimal" intent="danger" icon="trash" onClick={() => {
                setRemovalError('')
                setRemoval(flag)
              }}>Remove</Button>
                <Button variant="minimal" intent="danger" icon="shield" onClick={() => {
                  setRemovalError('')
                  setSuspected(flag)
                }}>Suspected CSAM</Button></td>}
            </tr>)}</tbody>
          </HTMLTable>
        </div> : <NonIdealState icon="flag" title="No flagged uploads" description="Image uploads rejected by NSFW screening appear here for seven days." />}
        {(page > 1 || result.hasNextPage) && <div className="admin-pagination">
          <span className={Classes.TEXT_MUTED}>Page {page}</span>
          <ButtonGroup>
            <Button icon="chevron-left" disabled={page === 1} onClick={() => load(page - 1)}>Previous</Button>
            <Button endIcon="chevron-right" disabled={!result.hasNextPage} onClick={() => load(page + 1)}>Next</Button>
          </ButtonGroup>
        </div>}
      </>}
    </Card>
    {removal && <Alert isOpen intent="danger" icon="trash" loading={removing}
      cancelButtonText="Cancel" confirmButtonText="Remove flag"
      onCancel={() => setRemoval(null)} onConfirm={() => void remove(removal)}>
      <p>Permanently remove the flag and image for {removal.filename ?? 'this upload'}?</p>
      {removalError && <Callout intent="danger" role="alert">{removalError}</Callout>}
    </Alert>}
    {suspected && <Alert isOpen intent="danger" icon="shield" loading={removing}
      cancelButtonText="Cancel" confirmButtonText="Delete image and record incident"
      onCancel={() => setSuspected(null)} onConfirm={() => void markSuspected(suspected)}>
      <p><strong>Do not download, screenshot or forward this image.</strong></p>
      <p>This deletes the image immediately, keeps only its hash and metadata, suspends @{suspected.handle} and records a safety incident
        for reporting to the BKA. Follow the CSAM procedure in the compliance repo.</p>
      {removalError && <Callout intent="danger" role="alert">{removalError}</Callout>}
    </Alert>}
  </section>
}
