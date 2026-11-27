import { useEffect, useState } from 'react'
import {
  Button, ButtonGroup, Callout, Card, Checkbox, Classes, Dialog, DialogBody, DialogFooter, FormGroup, H1, H4,
  HTMLSelect, HTMLTable, InputGroup, NonIdealState, SegmentedControl, Tag, Text, TextArea,
} from '@blueprintjs/core'
import type { Intent } from '@blueprintjs/core'
import {
  AdminAccessError, adminRequest, escalateReport, reopenReport, reportDetail, reportPage, reportReasonLabels, reportReasons, resolveReport,
} from './adminApi'
import type { ReportDetail, ReportResolution, ReportRow, ReportSnapshot } from './adminApi'
import { LoadingRows, LoadingStatus } from './LoadingState'
import { GroundFields } from './GroundDialog'
import { emptyGround, groundReady, reasonClause, type Ground } from './ground'
import { PostImage } from './PostPreview'
import UserAvatar from './UserAvatar'
import { pageUrl, useHistoryPage } from './useHistoryPage'

type Status = 'open' | 'resolved' | 'dismissed' | 'all'
type TargetType = 'all' | 'post' | 'user' | 'message'
type Sort = 'newest' | 'oldest' | 'most_reported'
const statusIntent: Record<ReportRow['status'], Intent> = { open: 'warning', resolved: 'success', dismissed: 'none' }
const targetLabels = { post: 'Post', user: 'Profile', message: 'Message' }

function snapshotExcerpt(snapshot: ReportSnapshot) {
  if (snapshot.type === 'post') return snapshot.content || (snapshot.imageIds.length ? 'Image attachment' : snapshot.gifUrl ? 'GIF' : snapshot.hasVoice ? 'Voice message' : snapshot.pollTitle ?? snapshot.kind)
  if (snapshot.type === 'user') return [snapshot.displayName, snapshot.bio].filter(Boolean).join(' · ') || '@' + snapshot.handle
  return snapshot.messages.find(message => message.reported)?.text || 'Message'
}

function targetLabel(row: Pick<ReportRow, 'targetType' | 'snapshot'>) {
  return row.snapshot.type === 'post' ? row.snapshot.kind : targetLabels[row.targetType]
}

function readFilters() {
  const params = new URLSearchParams(window.location.search)
  const pick = <T extends string>(key: string, values: readonly T[], fallback: T) => {
    const value = params.get(key)
    return values.includes(value as T) ? value as T : fallback
  }
  return {
    status: pick<Status>('status', ['open', 'resolved', 'dismissed', 'all'], 'open'),
    type: pick<TargetType>('type', ['all', 'post', 'user', 'message'], 'all'),
    reason: pick<'all' | (typeof reportReasons)[number]>('reason', ['all', ...reportReasons], 'all'),
    sort: pick<Sort>('sort', ['newest', 'oldest', 'most_reported'], 'newest'),
  }
}

export default function Reports({ pathname, onNavigate, onOpenUser, onOpenPost, onAccessLost, onChanged }: {
  pathname: string
  onNavigate: (path: string) => void
  onOpenUser: (id: string) => void
  onOpenPost: (id: string) => void
  onAccessLost: () => void
  onChanged: () => void
}) {
  const id = /^\/reports\/([0-9a-f-]{36})\/?$/i.exec(pathname)?.[1]
  const openReport = (reportId: string) => onNavigate('/reports/' + reportId)
  return id
    ? <ReportView key={id} id={id} onBack={() => onNavigate('/reports')} onOpenReport={openReport} onOpenUser={onOpenUser} onOpenPost={onOpenPost}
        onAccessLost={onAccessLost} onChanged={onChanged} />
    : <ReportQueue onOpen={openReport} onAccessLost={onAccessLost} />
}

function ReportQueue({ onOpen, onAccessLost }: { onOpen: (id: string) => void; onAccessLost: () => void }) {
  const [filters, setFilters] = useState(readFilters)
  const [page, setPage] = useHistoryPage()
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; data: ReturnType<typeof reportPage.parse> } | { key: string; error: string } | null>(null)
  const key = JSON.stringify({ filters, page, revision })

  useEffect(() => {
    const restore = () => setFilters(readFilters())
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ ...filters, page: String(page) })
    adminRequest('/api/admin/reports?' + params, controller.signal)
      .then(value => { if (!controller.signal.aborted) setResult({ key, data: reportPage.parse(value) }) })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setResult({ key, error: cause instanceof Error ? cause.message : 'Could not load reports.' })
      })
    return () => controller.abort()
  }, [filters, page, key, onAccessLost])

  function filter(next: Partial<typeof filters>) {
    const merged = { ...filters, ...next }
    const params = new URLSearchParams()
    if (merged.status !== 'open') params.set('status', merged.status)
    if (merged.type !== 'all') params.set('type', merged.type)
    if (merged.reason !== 'all') params.set('reason', merged.reason)
    if (merged.sort !== 'newest') params.set('sort', merged.sort)
    window.history.pushState(window.history.state, '', pageUrl(1, params))
    setFilters(merged)
    setPage(1)
  }

  const current = result?.key === key ? result : null
  const data = current && 'data' in current ? current.data : null
  const error = current && 'error' in current ? current.error : ''

  return <section className="overview" aria-labelledby="reports-heading">
    <header className="overview-heading">
      <H1 id="reports-heading">Reports</H1>
      <Button icon="refresh" variant="minimal" onClick={() => setRevision(value => value + 1)}>Refresh</Button>
    </header>
    <Card className="admin-panel">
      <div className="admin-toolbar admin-report-filters">
        <SegmentedControl aria-label="Report status" value={filters.status} onValueChange={value => filter({ status: value as Status })}
          options={[{ label: 'Open', value: 'open' }, { label: 'Resolved', value: 'resolved' }, { label: 'Dismissed', value: 'dismissed' }, { label: 'All', value: 'all' }]} />
        <FormGroup label="Type" inline>
          <HTMLSelect value={filters.type} onChange={event => filter({ type: event.currentTarget.value as TargetType })}
            options={[{ label: 'All content', value: 'all' }, { label: 'Posts, replies and quotes', value: 'post' }, { label: 'Profiles', value: 'user' }, { label: 'Messages', value: 'message' }]} />
        </FormGroup>
        <FormGroup label="Reason" inline>
          <HTMLSelect value={filters.reason} onChange={event => filter({ reason: event.currentTarget.value as typeof filters.reason })}
            options={[{ label: 'All reasons', value: 'all' }, ...reportReasons.map(value => ({ label: reportReasonLabels[value], value }))]} />
        </FormGroup>
        <FormGroup label="Sort" inline>
          <HTMLSelect value={filters.sort} onChange={event => filter({ sort: event.currentTarget.value as Sort })}
            options={[{ label: 'Newest', value: 'newest' }, { label: 'Oldest', value: 'oldest' }, { label: 'Most reported', value: 'most_reported' }]} />
        </FormGroup>
      </div>
      {error && <Callout intent="danger" role="alert">{error} <Button onClick={() => setRevision(value => value + 1)}>Retry</Button></Callout>}
      {!error && !data && <><LoadingStatus label="Loading reports…" /><LoadingRows rows={5} /></>}
      {data && <>
        {data.reports.length > 0 ? <div className="overview-table-scroll">
          <HTMLTable striped interactive className="overview-table">
            <thead><tr>
              <th scope="col">Content</th><th scope="col">Reason</th><th scope="col">Reported</th>
              <th scope="col">Reporter</th><th scope="col">Status</th><th scope="col">Received</th>
            </tr></thead>
            <tbody>{data.reports.map(row => <tr key={row.id} onClick={() => onOpen(row.id)}>
              <td>
                <div className="admin-report-target">
                  <Tag minimal>{targetLabel(row)}</Tag>
                  {row.openOnTarget > 1 && <Tag minimal intent="danger" title="Open reports on this content">{row.openOnTarget} reports</Tag>}
                </div>
                <a href={'/reports/' + row.id} className="admin-content-excerpt" onClick={event => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) { event.stopPropagation(); return }
                  event.preventDefault()
                }}>{snapshotExcerpt(row.snapshot)}</a>
              </td>
              <td>{reportReasonLabels[row.reason]}{row.details && <div className={Classes.TEXT_MUTED + ' admin-content-excerpt'}>{row.details}</div>}</td>
              <td>@{row.targetHandle}</td>
              <td>@{row.reporterHandle}</td>
              <td><Tag minimal intent={statusIntent[row.status]}>{row.status}</Tag></td>
              <td><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time></td>
            </tr>)}</tbody>
          </HTMLTable>
        </div> : <NonIdealState icon="tick-circle" title={filters.status === 'open' ? 'No open reports' : 'No reports found'}
          description={filters.status === 'open' ? 'Reports from users appear here for review.' : 'Try different filters.'} />}
        {(page > 1 || data.hasNextPage) && <div className="admin-pagination">
          <span className={Classes.TEXT_MUTED}>Page {page}</span>
          <ButtonGroup>
            <Button icon="chevron-left" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button endIcon="chevron-right" disabled={!data.hasNextPage} onClick={() => setPage(page + 1)}>Next</Button>
          </ButtonGroup>
        </div>}
      </>}
    </Card>
  </section>
}

function SnapshotView({ report, onOpenUser, onOpenPost }: {
  report: ReportDetail
  onOpenUser: (id: string) => void
  onOpenPost: (id: string) => void
}) {
  const snapshot = report.snapshot
  if (snapshot.type === 'post') return <div className="admin-report-snapshot">
    <div className="admin-post-meta">
      <Tag minimal>{snapshot.kind}</Tag>
      <Text>{snapshot.authorName || '@' + snapshot.authorHandle} <span className={Classes.TEXT_MUTED}>@{snapshot.authorHandle}</span></Text>
      <Text className={Classes.TEXT_MUTED}><time dateTime={snapshot.createdAt}>{new Date(snapshot.createdAt).toLocaleString()}</time></Text>
    </div>
    {snapshot.content && <Text className="overview-details">{snapshot.content}</Text>}
    {snapshot.gifUrl && <img src={snapshot.gifUrl} alt="Attached GIF" referrerPolicy="no-referrer" className="admin-post-media" />}
    {report.target.exists && snapshot.imageIds.map((imageId, index) =>
      <PostImage key={imageId} url={`/api/admin/post-images/${imageId}`} alt={`Attached image ${index + 1}`} />)}
    {!report.target.exists && snapshot.imageIds.length > 0 && <Callout icon="media">{snapshot.imageIds.length} image attachment(s), no longer available.</Callout>}
    {snapshot.hasVoice && <Callout icon="volume-up">Voice message attached.</Callout>}
    {snapshot.pollTitle && <Callout icon="chart" title="Poll">{snapshot.pollTitle}</Callout>}
    <div className="admin-report-links">
      {report.target.exists && <Button icon="document-open" variant="minimal" onClick={() => onOpenPost(report.targetKey)}>Open in content review</Button>}
      {snapshot.parentId && <Button icon="comment" variant="minimal" onClick={() => onOpenPost(snapshot.parentId!)}>View parent post</Button>}
      {snapshot.quotedPostId && <Button icon="citation" variant="minimal" onClick={() => onOpenPost(snapshot.quotedPostId!)}>View quoted post</Button>}
    </div>
  </div>
  if (snapshot.type === 'user') return <div className="admin-report-snapshot">
    <header className="admin-user-identity">
      <UserAvatar src={snapshot.avatarUrl} size={48} />
      <div><H4>{snapshot.displayName || '@' + snapshot.handle}</H4><Text className={Classes.TEXT_MUTED}>@{snapshot.handle}{snapshot.pronouns && ' · ' + snapshot.pronouns}</Text></div>
    </header>
    {snapshot.bannerUrl && <img src={snapshot.bannerUrl} alt="Profile banner at the time of the report" className="admin-post-media" referrerPolicy="no-referrer" />}
    <Text className="overview-details">{snapshot.bio || 'No bio.'}</Text>
    {report.targetUserId && <Button icon="person" variant="minimal" onClick={() => onOpenUser(report.targetUserId!)}>Open profile moderation</Button>}
  </div>
  return <div className="admin-report-snapshot">
    <Callout intent="warning" icon="unlock" title="Decrypted by the reporter">
      Chats are end-to-end encrypted. This text was decrypted on the reporter's device and submitted with the report.
      Message IDs and senders were checked by the server, the wording cannot be verified.
    </Callout>
    <ol className="admin-report-messages" aria-label="Reported conversation excerpt">
      {snapshot.messages.map(message => <li key={message.id} data-reported={message.reported || undefined}>
        <div className="admin-post-meta">
          <strong>@{message.senderHandle}</strong>
          <Text className={Classes.TEXT_MUTED}><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></Text>
          {message.reported && <Tag minimal intent="danger">Reported</Tag>}
        </div>
        <Text className="overview-details">{message.text || '(empty)'}</Text>
      </li>)}
    </ol>
  </div>
}

function ReportView({ id, onBack, onOpenReport, onOpenUser, onOpenPost, onAccessLost, onChanged }: {
  id: string
  onBack: () => void
  onOpenReport: (id: string) => void
  onOpenUser: (id: string) => void
  onOpenPost: (id: string) => void
  onAccessLost: () => void
  onChanged: () => void
}) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ revision: number; report?: ReportDetail; error?: string }>()
  const [dialog, setDialog] = useState<'resolve' | 'dismiss' | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    adminRequest('/api/admin/reports/' + id, controller.signal)
      .then(value => { if (!controller.signal.aborted) setState({ revision, report: reportDetail.parse(value) }) })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setState({ revision, error: cause instanceof Error ? cause.message : 'Could not load report.' })
      })
    return () => controller.abort()
  }, [id, revision, onAccessLost])

  const current = state?.revision === revision ? state : undefined
  const report = current?.report
  const [escalating, setEscalating] = useState(false)

  async function reopen() {
    setBusy(true)
    setActionError('')
    try {
      await reopenReport(id)
      setNotice('Report reopened.')
      setRevision(value => value + 1)
      onChanged()
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setActionError(cause instanceof Error ? cause.message : 'Could not reopen the report.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="overview" aria-labelledby="report-heading">
    <Button variant="minimal" icon="arrow-left" className="admin-back" onClick={onBack}>Reports</Button>
    <header className="overview-heading">
      <H1 id="report-heading">{report ? `${targetLabel(report)} report` : 'Report'}</H1>
      {report?.status === 'open' && report.canResolve && <ButtonGroup>
        <Button icon="cross" onClick={() => setDialog('dismiss')}>Dismiss</Button>
        <Button intent="primary" icon="take-action" onClick={() => setDialog('resolve')}>Take action</Button>
      </ButtonGroup>}
      {report && report.status !== 'open' && <Button icon="undo" loading={busy} onClick={() => void reopen()}>Reopen</Button>}
      {report && <Button icon="high-priority" intent={report.escalatedAt ? 'none' : 'warning'} onClick={() => setEscalating(true)}>
        {report.escalatedAt ? 'Escalated' : 'Threat to life or safety'}
      </Button>}
    </header>
    {notice && <Callout className="admin-notice" intent="success" role="status">{notice}</Callout>}
    {actionError && <Callout className="admin-notice" intent="danger" role="alert">{actionError}</Callout>}
    {!current && <Card><LoadingStatus label="Loading report…" /><LoadingRows rows={4} /></Card>}
    {current?.error && <Card><p role="alert">{current.error}</p><Button onClick={() => setRevision(value => value + 1)}>Retry</Button></Card>}
    {report && <div className="admin-report-layout">
      <Card className="admin-panel">
        <header className="admin-toolbar">
          <h2 className={Classes.HEADING}>Reported content</h2>
          {!report.target.exists && <Tag minimal intent="danger">Removed since</Tag>}
        </header>
        <SnapshotView report={report} onOpenUser={onOpenUser} onOpenPost={onOpenPost} />
      </Card>
      <Card className="admin-panel">
        <dl className="admin-user-facts">
          <div><dt>Status</dt><dd><Tag minimal intent={statusIntent[report.status]}>{report.status}</Tag></dd></div>
          <div><dt>Reason</dt><dd>{reportReasonLabels[report.reason]}</dd></div>
          <div><dt>Reporter</dt><dd>{report.channel === 'public'
            ? <>Public form: {report.notifierName ?? 'anonymous'}{report.notifierEmail && <> &lt;<a href={'mailto:' + report.notifierEmail}>{report.notifierEmail}</a>&gt;</>}</>
            : report.reporterId
              ? <a href={'/moderation/user/' + report.reporterId} onClick={event => { event.preventDefault(); onOpenUser(report.reporterId!) }}>@{report.reporterHandle}</a>
              : report.reporterHandle ? '@' + report.reporterHandle : 'Deleted account'}</dd></div>
          {report.legalGround && <div><dt>Law named</dt><dd>{report.legalGround}</dd></div>}
          {report.goodFaithAt && <div><dt>Good faith statement</dt><dd>Confirmed</dd></div>}
          {report.escalatedAt && <div><dt>Escalated</dt><dd>{report.escalationAuthority}{report.escalationRef ? ` (${report.escalationRef})` : ''}, <time dateTime={report.escalatedAt}>{new Date(report.escalatedAt).toLocaleString()}</time></dd></div>}
          <div><dt>Received</dt><dd><time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString()}</time></dd></div>
          <div><dt>Reported user</dt><dd>{report.target.owner
            ? <a href={'/moderation/user/' + report.target.owner.id} onClick={event => { event.preventDefault(); onOpenUser(report.target.owner!.id) }}>@{report.target.owner.handle}</a>
            : '@' + report.targetHandle}
            {report.target.owner?.bannedAt && <> <Tag minimal intent="danger">Banned</Tag></>}
          </dd></div>
          <div><dt>Reports against them</dt><dd>{report.target.ownerReports.total} total, {report.target.ownerReports.actioned} actioned</dd></div>
          {report.resolvedAt && <div><dt>Handled</dt><dd>{report.resolution} by @{report.resolvedByHandle}, <time dateTime={report.resolvedAt}>{new Date(report.resolvedAt).toLocaleString()}</time></dd></div>}
          {report.note && <div><dt>Moderator note</dt><dd>{report.note}</dd></div>}
        </dl>
        {report.details && <Callout icon="comment" title="Reporter's details" className="admin-notice">{report.details}</Callout>}
        {report.related.length > 0 && <section aria-labelledby="related-reports">
          <h3 id="related-reports" className={Classes.HEADING}>Other reports on this content ({report.related.length})</h3>
          <HTMLTable compact className="overview-table">
            <tbody>{report.related.map(row => <tr key={row.id}>
              <td><a href={'/reports/' + row.id} onClick={event => {
                event.preventDefault()
                onOpenReport(row.id)
              }}>@{row.reporterHandle}</a></td>
              <td>{reportReasonLabels[row.reason]}{row.details && <div className={Classes.TEXT_MUTED}>{row.details}</div>}</td>
              <td><Tag minimal intent={statusIntent[row.status]}>{row.status}</Tag></td>
              <td><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleDateString()}</time></td>
            </tr>)}</tbody>
          </HTMLTable>
        </section>}
      </Card>
    </div>}
    {report && escalating && <EscalateDialog report={report} onClose={() => setEscalating(false)} onAccessLost={onAccessLost}
      onDone={() => {
        setEscalating(false)
        setNotice('Escalation recorded.')
        setRevision(value => value + 1)
      }} />}
    {report && dialog && <ResolveDialog report={report} decision={dialog} onClose={() => setDialog(null)} onAccessLost={onAccessLost}
      onDone={message => {
        setDialog(null)
        setNotice(message)
        setRevision(value => value + 1)
        onChanged()
      }} />}
  </section>
}

function ResolveDialog({ report, decision, onClose, onDone, onAccessLost }: {
  report: ReportDetail
  decision: 'resolve' | 'dismiss'
  onClose: () => void
  onDone: (message: string) => void
  onAccessLost: () => void
}) {
  const [note, setNote] = useState('')
  const [removeContent, setRemoveContent] = useState(false)
  const [clearProfile, setClearProfile] = useState<NonNullable<ReportResolution['clearProfile']>>([])
  const [ban, setBan] = useState(false)
  const [banReason, setBanReason] = useState(() => reportReasonLabels[report.reason])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ground, setGround] = useState<Ground>(() => ({ ...emptyGround, ref: reasonClause[report.reason] ?? '' }))
  const acting = removeContent || ban || clearProfile.length > 0
  const total = report.related.filter(row => row.status === 'open').length + 1

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await resolveReport(report.id, decision === 'dismiss' ? { decision, note } : {
        decision, note, removeContent,
        clearProfile: report.targetType === 'user' ? clearProfile : [],
        ban: ban ? { reason: banReason.trim() } : undefined,
        ground: acting ? { ...ground, facts: ground.facts.trim() } : undefined,
      })
      onDone(decision === 'dismiss' ? `Dismissed ${total} report${total === 1 ? '' : 's'}.` : `Resolved ${total} report${total === 1 ? '' : 's'}.`)
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setError(cause instanceof Error ? cause.message : 'Could not save the decision.')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (part: (typeof clearProfile)[number]) => setClearProfile(current =>
    current.includes(part) ? current.filter(value => value !== part) : [...current, part])

  return <Dialog isOpen onClose={onClose} title={decision === 'dismiss' ? 'Dismiss report' : 'Take action'} icon={decision === 'dismiss' ? 'cross' : 'take-action'}>
    <DialogBody>
      <p>{total > 1 ? `This closes all ${total} open reports on this content.` : 'This closes the report.'}</p>
      {decision === 'resolve' && <>
        {!report.canAct && report.targetType === 'post' && report.target.exists && !report.canRemoveContent && <Callout intent="primary" icon="info-sign" className="admin-notice">
          To remove this post, open a report filed by another account.
        </Callout>}
        {report.canRemoveContent && <Checkbox checked={removeContent} onChange={event => setRemoveContent(event.currentTarget.checked)}
          label={report.targetType === 'message' ? 'Delete the reported message for both participants'
            : report.canAct ? `Remove this ${targetLabel(report).toLowerCase()} and all replies to it`
              : `Remove this ${targetLabel(report).toLowerCase()} and keep its replies`} />}
        {report.canAct && report.targetType === 'user' && <FormGroup label="Clear from profile">
          {(['name', 'bio', 'avatar', 'banner'] as const).map(part =>
            <Checkbox key={part} inline checked={clearProfile.includes(part)} onChange={() => toggle(part)}
              label={{ name: 'Display name', bio: 'Bio', avatar: 'Avatar', banner: 'Banner' }[part]} />)}
        </FormGroup>}
        {report.canBan && <>
          <Checkbox checked={ban} onChange={event => setBan(event.currentTarget.checked)} label={`Ban @${report.target.owner?.handle}`} />
          {ban && <FormGroup label="Ban reason (shown on their profile)" labelFor="report-ban-reason">
            <TextArea id="report-ban-reason" fill maxLength={280} value={banReason} onChange={event => setBanReason(event.currentTarget.value)} />
          </FormGroup>}
        </>}
        {acting && <GroundFields value={ground} onChange={setGround} />}
      </>}
      <FormGroup label="Note for other moderators (optional)" labelFor="report-note">
        <TextArea id="report-note" fill maxLength={1000} value={note} onChange={event => setNote(event.currentTarget.value)} />
      </FormGroup>
      {error && <Callout intent="danger" role="alert">{error}</Callout>}
    </DialogBody>
    <DialogFooter actions={<>
      <Button onClick={onClose} disabled={saving}>Cancel</Button>
      <Button intent={removeContent || ban ? 'danger' : 'primary'} loading={saving} disabled={(ban && !banReason.trim()) || (acting && !groundReady(ground))} onClick={() => void submit()}>
        {decision === 'dismiss' ? 'Dismiss' : removeContent || ban || clearProfile.length ? 'Apply and resolve' : 'Resolve without action'}
      </Button>
    </>} />
  </Dialog>
}

function EscalateDialog({ report, onClose, onDone, onAccessLost }: {
  report: ReportDetail
  onClose: () => void
  onDone: () => void
  onAccessLost: () => void
}) {
  const [authority, setAuthority] = useState(report.escalationAuthority ?? '')
  const [reference, setReference] = useState(report.escalationRef ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    setSaving(true)
    setError('')
    try {
      await escalateReport(report.id, authority.trim(), reference.trim())
      onDone()
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setError(cause instanceof Error ? cause.message : 'Could not record the escalation.')
    } finally {
      setSaving(false)
    }
  }
  return <Dialog isOpen onClose={onClose} title="Report to law enforcement (Art. 18 DSA)" icon="high-priority">
    <DialogBody>
      <Callout intent="warning" className="admin-notice">
        If someone is in immediate danger, call 110 first. Otherwise send the details to the BKA (Zentrale Meldestelle für
        strafbare Inhalte im Internet) or the police of Schleswig-Holstein, then record it here. Follow the Art. 18 procedure in the compliance repo.
      </Callout>
      <FormGroup label="Authority" labelFor="escalation-authority">
        <InputGroup id="escalation-authority" maxLength={120} value={authority} onChange={event => setAuthority(event.currentTarget.value)}
          placeholder="BKA, Polizei Schleswig-Holstein, …" />
      </FormGroup>
      <FormGroup label="Case reference (optional)" labelFor="escalation-ref">
        <InputGroup id="escalation-ref" maxLength={200} value={reference} onChange={event => setReference(event.currentTarget.value)} />
      </FormGroup>
      {error && <Callout intent="danger" role="alert">{error}</Callout>}
    </DialogBody>
    <DialogFooter actions={<>
      <Button onClick={onClose} disabled={saving}>Cancel</Button>
      <Button intent="warning" loading={saving} disabled={!authority.trim()} onClick={() => void submit()}>Record escalation</Button>
    </>} />
  </Dialog>
}
