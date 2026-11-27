import { useState } from 'react'
import {
  Button, ButtonGroup, Callout, Card, Classes, FormGroup, H1, H2, HTMLTable, InputGroup, NumericInput, Tag,
} from '@blueprintjs/core'
import { LoadingRows, LoadingStatus } from './LoadingState'
import PostPreview from './PostPreview'
import SeriesChart from './SeriesChart'
import CategoryChart from './CategoryChart'
import { Facts, Meter, Unavailable } from './System'
import { available, formatAge, formatBytes } from './systemApi'
import { percent, saveFeedConfig, useFeedDashboard, type FeedConfig, type FeedDashboard } from './feedApi'

const ranges = [7, 14, 30] as const
const headLabels: Record<string, string> = {
  dwell: 'Read 3s+', click: 'Open', profile: 'Profile open', like: 'Like', comment: 'Reply',
  share: 'Share', save: 'Save', follow: 'Follow', negative: 'Negative',
}
const sourceLabels: Record<string, string> = {
  recent: 'Recent', popular: 'Popular', followee_repost: 'Followee reposts',
  followee_reply: 'Followee replies', followee_like: 'Followee likes',
}
const surfaceLabels: Record<string, string> = { for_you: 'Feed', following: 'Following' }

function TooFew({ minUsers }: { minUsers: number }) {
  return <Callout icon="people" className={Classes.TEXT_MUTED}>Too few users to show this yet (needs at least {minUsers}).</Callout>
}

function Panel({ title, wide = false, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  return <Card className={`admin-panel${wide ? ' admin-system-wide' : ''}`}>
    <header className="admin-toolbar"><H2>{title}</H2></header>
    <div className="admin-panel-body">{children}</div>
  </Card>
}

export default function Feed({ onAccessLost }: { onAccessLost: () => void }) {
  const [days, setDays] = useState<(typeof ranges)[number]>(14)
  const { data, error, loading, refresh } = useFeedDashboard(days, onAccessLost)
  return <section className="overview" aria-labelledby="feed-heading">
    <header className="overview-heading">
      <H1 id="feed-heading">Feed</H1>
      <div className="admin-heading-actions">
        <ButtonGroup aria-label="Time range">
          {ranges.map(range => <Button key={range} active={days === range} onClick={() => setDays(range)}>{range} days</Button>)}
        </ButtonGroup>
        <Button icon="refresh" variant="minimal" onClick={refresh} loading={loading && !!data}>Refresh</Button>
      </div>
    </header>
    {error && <Callout intent="danger" role="alert">{error} <Button onClick={refresh}>Retry</Button></Callout>}
    {!data && !error && <><LoadingStatus label="Loading feed statistics…" /><LoadingRows rows={6} /></>}
    {data && <FeedBody data={data} onSaved={refresh} />}
  </section>
}

function FeedBody({ data, onSaved }: { data: FeedDashboard; onSaved: () => void }) {
  const { adoption, pipeline, engagement, position, diversity, training, model, volume } = data
  const { minUsers, minViewers } = data.thresholds
  return <>
    <p className={Classes.TEXT_MUTED}>
      Aggregates only. Breakdowns backed by fewer than {minUsers} people are hidden, and posts are listed only once {minViewers} people saw them.
      Updated <time dateTime={data.generatedAt}>{formatAge(data.generatedAt)} ago</time>.
    </p>
    <div className="admin-feed-grid">
      <Panel title="Adoption">
        {available(adoption) ? <>
          <Facts items={[
            ['Opted in', adoption.optedIn],
            ['Opted out', adoption.optedOut],
            ['Not decided yet', adoption.undecided],
            ['Active this week, opted in', `${adoption.activeOptedIn7d} of ${adoption.activeUsers7d} (${percent(adoption.activeUsers7d ? adoption.activeOptedIn7d / adoption.activeUsers7d : null)})`],
            ['Turned on from the Feed tab', adoption.unlocksFromNav],
            ['Declined from the Feed tab', adoption.declinesFromNav],
            ['Feed loads', `${adoption.homeRequests.personal.toLocaleString()} personal · ${adoption.homeRequests.public.toLocaleString()} public`],
          ]} />
          <SeriesChart label="Feed choices per day" unit="choices"
            series={[{ key: 'optedIn', label: 'Turned on' }, { key: 'optedOut', label: 'Kept off' }]}
            data={adoption.choicesByDay.map(row => ({ day: row.day, values: { optedIn: row.optedIn, optedOut: row.optedOut } }))} />
        </> : <Unavailable />}
      </Panel>

      <Panel title="Pipeline health">
        {available(pipeline) ? <>
          <Facts items={[
            ['Latency', pipeline.latencyMs
              ? <>p50 {Math.round(pipeline.latencyMs.p50)} ms · p95 {Math.round(pipeline.latencyMs.p95)} ms · p99 {Math.round(pipeline.latencyMs.p99)} ms
                {pipeline.latencyMs.p95 > 150 && <Tag minimal intent="warning" icon="warning-sign" className="admin-inline-tag">p95 over 150 ms</Tag>}</>
              : 'No requests yet'],
            ['Candidates per ranking', pipeline.candidates ? `median ${Math.round(pipeline.candidates.p50)} · lowest ${pipeline.candidates.min}` : 'n/a'],
            ['Continuations', percent(pipeline.continuationRate)],
            ['Caught up', pipeline.caughtUp.toLocaleString()],
            ['Rejected cursors', pipeline.cursorRejected.toLocaleString()],
            ['Public cache', `${percent(pipeline.publicCache.hits + pipeline.publicCache.misses ? pipeline.publicCache.hits / (pipeline.publicCache.hits + pipeline.publicCache.misses) : null)} hits (${pipeline.publicCache.hits} of ${pipeline.publicCache.hits + pipeline.publicCache.misses})`],
          ]} />
          <SeriesChart label="Rankings per day" unit="requests"
            series={[{ key: 'personal', label: 'Feed, personal' }, { key: 'public', label: 'Feed, public' }, { key: 'following', label: 'Following, logged' }]}
            data={pipeline.requestsByDay.map(row => ({ day: row.day, values: { personal: row.personal, public: row.public, following: row.following } }))} />
          {pipeline.problemsByDay.some(row => row.errors || row.fallbacks)
            ? <SeriesChart label="Errors and fallbacks per day" unit="times"
              series={[{ key: 'errors', label: 'Pipeline errors' }, { key: 'fallbacks', label: 'Timeouts (chronological fallback)' }]}
              data={pipeline.problemsByDay.map(row => ({ day: row.day, values: { errors: row.errors, fallbacks: row.fallbacks } }))} />
            : <Tag minimal intent="success" icon="tick-circle">No pipeline errors or fallbacks in this range</Tag>}
        </> : <Unavailable />}
      </Panel>

      <Panel title="Where the time goes">
        {available(pipeline) ? (pipeline.stages.length
          ? <CategoryChart label="p95 per stage (ms)" format={value => `${Math.round(value)} ms`}
            data={pipeline.stages.map(stage => ({ label: stage.stage, value: stage.p95, detail: `${stage.stage}: p50 ${Math.round(stage.p50)} ms, p95 ${Math.round(stage.p95)} ms` }))} />
          : <p className={Classes.TEXT_MUTED}>No rankings yet.</p>) : <Unavailable />}
      </Panel>

      <Panel title="Candidate sources">
        {available(pipeline) ? (pipeline.sources.length
          ? <CategoryChart label="Candidates by source (a post can have several)"
            data={pipeline.sources.map(source => ({ label: sourceLabels[source.source] ?? source.source, value: source.count }))} />
          : <p className={Classes.TEXT_MUTED}>No rankings yet.</p>) : <Unavailable />}
      </Panel>

      <Panel title="Engagement by feed" wide>
        {available(engagement) ? <>
          <Callout icon="info-sign">Not a randomized comparison: people choose which feed they open, so differences are hints, not proof.</Callout>
          <div className="overview-table-scroll">
            <HTMLTable compact striped className="overview-table">
              <thead><tr><th scope="col">Feed</th><th scope="col">Viewers</th><th scope="col">Impressions</th><th scope="col">Opens</th>
                <th scope="col">Read 3s+</th><th scope="col">Likes</th><th scope="col">Replies</th><th scope="col">Shares</th><th scope="col">Profile opens</th></tr></thead>
              <tbody>{engagement.surfaces.map(row => <tr key={row.surface}>
                <td>{surfaceLabels[row.surface] ?? row.surface}</td>
                {row.per100 ? <>
                  <td>{row.viewers}</td><td>{row.impressions?.toLocaleString()}</td>
                  <td>{row.per100.opens ?? 'n/a'}</td><td>{row.per100.dwells ?? 'n/a'}</td><td>{row.per100.likes ?? 'n/a'}</td>
                  <td>{row.per100.replies ?? 'n/a'}</td><td>{row.per100.shares ?? 'n/a'}</td><td>{row.per100.profiles ?? 'n/a'}</td>
                </> : <td colSpan={8} className={Classes.TEXT_MUTED}>Too few viewers (needs {minUsers})</td>}
              </tr>)}</tbody>
            </HTMLTable>
          </div>
          <p className={Classes.TEXT_MUTED}>Rates are per 100 impressions.</p>
          <SeriesChart kind="line" label="Actions per 100 impressions, per day" unit="per 100"
            series={[{ key: 'forYou', label: 'Feed' }, { key: 'following', label: 'Following' }]}
            data={engagement.dailyActionsPer100.map(row => ({ day: row.day, values: { forYou: row.forYou, following: row.following } }))} />
        </> : <Unavailable />}
      </Panel>

      <Panel title="Position and exploration">
        {available(position) ? (position.enough ? <>
          <CategoryChart label="Open rate by position in the Feed" format={value => percent(value, 1)}
            data={position.byPosition.map(row => ({ label: `#${row.position + 1}`, value: row.openRate ?? 0, detail: `#${row.position + 1}: ${row.impressions} impressions, open ${percent(row.openRate, 1)}, like ${percent(row.likeRate, 1)}` }))} />
          {position.explore && <HTMLTable compact className="overview-table">
            <thead><tr><th scope="col">Slot</th><th scope="col">Served</th><th scope="col">Seen</th><th scope="col">Engaged when seen</th></tr></thead>
            <tbody>
              <tr><td>Ranked</td><td>{position.explore.ranked.served}</td><td>{position.explore.ranked.impressions}</td><td>{percent(position.explore.ranked.engagementRate, 1)}</td></tr>
              <tr><td>Exploration</td><td>{position.explore.explored.served}</td><td>{position.explore.explored.impressions}</td><td>{percent(position.explore.explored.engagementRate, 1)}</td></tr>
            </tbody>
          </HTMLTable>}
        </> : <TooFew minUsers={minUsers} />) : <Unavailable />}
      </Panel>

      <Panel title="Diversity and coverage">
        {available(diversity) ? <>
          <Facts items={[
            ['Authors per page', diversity.authorsPerPage === null ? `Too few users (needs ${minUsers})` : diversity.authorsPerPage.toFixed(1)],
            ['From people you follow', diversity.inNetworkShare === null ? `Too few users (needs ${minUsers})` : percent(diversity.inNetworkShare)],
            ['Top 5 authors, share of impressions', diversity.top5AuthorShare === null ? `Too few users (needs ${minUsers})` : percent(diversity.top5AuthorShare)],
            ['Posts from the last 72 hours shown', percent(diversity.recentCoverage)],
            ['Older posts never shown', percent(diversity.neverShownShare)],
          ]} />
        </> : <Unavailable />}
      </Panel>

      <Panel title="Most seen in the Feed" wide>
        {available(diversity) ? (diversity.topPosts.length
          ? <div className="overview-table-scroll">
            <HTMLTable compact striped className="overview-table">
              <thead><tr><th scope="col">Post</th><th scope="col">Author</th><th scope="col">Impressions</th><th scope="col">Viewers</th><th scope="col">Age</th></tr></thead>
              <tbody>{diversity.topPosts.map(post => <tr key={post.id}>
                <td><PostPreview content={post.content} gif={post.gif ? { url: post.gif.url, title: post.gif.title ?? '' } : null} voiceUrl={post.voiceUrl} imageIds={post.imageIds} /></td>
                <td>@{post.handle}</td><td>{post.impressions}</td><td>{post.viewers}</td>
                <td className={Classes.TEXT_MUTED}>{formatAge(post.createdAt)}</td>
              </tr>)}</tbody>
            </HTMLTable>
          </div>
          : <p className={Classes.TEXT_MUTED}>No post has been seen by {minViewers} people in the Feed yet.</p>) : <Unavailable />}
      </Panel>

      <Panel title="Training readiness">
        {available(training) ? <>
          <p className={Classes.TEXT_MUTED}>
            {training.since ? <>Counting since the Feed launched {formatAge(training.since)} ago. {training.examples.toLocaleString()} training examples so far (seen at least 24 hours ago). Counts are approximate until training ships.</> : 'The Feed has not served anyone yet.'}
          </p>
          {training.heads.map(head => <Meter key={head.head} label={headLabels[head.head] ?? head.head} value={head.positives} max={head.minimum}
            intent={head.positives >= head.minimum ? 'success' : 'primary'}
            detail={`${head.positives} of ${head.minimum}${head.etaDays === 0 ? ' · ready' : head.etaDays === null ? ' · no recent signal' : ` · about ${head.etaDays} days at ${head.perDay}/day`}`} />)}
        </> : <Unavailable />}
      </Panel>

      <Panel title="Data volume and retention">
        {available(volume) ? <>
          <HTMLTable compact striped className="overview-table">
            <thead><tr><th scope="col">Table</th><th scope="col">Rows</th><th scope="col">Size</th><th scope="col">Oldest</th></tr></thead>
            <tbody>{volume.tables.map(table => <tr key={table.name}>
              <td><code>{table.name}</code></td><td>{table.rows.toLocaleString()}</td><td>{formatBytes(table.bytes)}</td>
              <td className={Classes.TEXT_MUTED}>{table.oldest ? `${formatAge(table.oldest)} ago` : 'empty'}</td>
            </tr>)}</tbody>
          </HTMLTable>
          <Facts items={volume.retentionDue.map(rule => [rule.rule, rule.rows ? `${rule.rows.toLocaleString()} rows due` : 'nothing due'])} />
        </> : <Unavailable />}
      </Panel>

      <Card className="admin-panel admin-system-wide">
        <header className="admin-toolbar"><H2>Model and configuration</H2></header>
        <div className="admin-panel-body">
          {available(model) ? <ModelPanel model={model} onSaved={onSaved} /> : <Unavailable />}
        </div>
      </Card>
    </div>
  </>
}

type ModelInfo = Extract<FeedDashboard['model'], { config: FeedConfig }>
const numberFields: { key: Exclude<keyof FeedConfig, 'weights'>; label: string; step: number; min: number; max: number }[] = [
  { key: 'epsilon', label: 'Exploration share', step: 0.01, min: 0, max: 0.5 },
  { key: 'exploreFrom', label: 'Explore from position', step: 1, min: 0, max: 20 },
  { key: 'windowHours', label: 'Window (hours)', step: 1, min: 12, max: 336 },
  { key: 'wideWindowHours', label: 'Wide window (hours)', step: 1, min: 24, max: 720 },
  { key: 'minCandidates', label: 'Widen below (candidates)', step: 10, min: 0, max: 600 },
  { key: 'maxCandidates', label: 'Max candidates', step: 10, min: 50, max: 600 },
  { key: 'storedCandidates', label: 'Stored per ranking', step: 10, min: 20, max: 200 },
  { key: 'pageSize', label: 'Page size', step: 1, min: 5, max: 50 },
  { key: 'freshnessHalfLifeHours', label: 'Freshness half-life (hours)', step: 1, min: 1, max: 168 },
  { key: 'freshnessFloor', label: 'Freshness floor', step: 0.05, min: 0, max: 1 },
  { key: 'seenPenalty', label: 'Seen 1 to 7 days ago', step: 0.05, min: 0, max: 1 },
  { key: 'authorGap', label: 'Same author gap', step: 1, min: 1, max: 5 },
  { key: 'authorMaxPer10', label: 'Same author per 10', step: 1, min: 1, max: 10 },
  { key: 'publicCacheSeconds', label: 'Public cache (seconds)', step: 30, min: 0, max: 3600 },
  { key: 'timeoutMs', label: 'Timeout (ms)', step: 100, min: 200, max: 10000 },
]
const weightKeys = ['comment', 'share', 'save', 'like', 'click', 'profile', 'dwell', 'follow', 'negative'] as const

function changes(before: FeedConfig, after: FeedConfig) {
  const list: string[] = []
  for (const key of weightKeys)
    if (before.weights[key] !== after.weights[key]) list.push(`Weight ${headLabels[key] ?? key}: ${before.weights[key]} → ${after.weights[key]}`)
  for (const field of numberFields)
    if (before[field.key] !== after[field.key]) list.push(`${field.label}: ${before[field.key]} → ${after[field.key]}`)
  return list
}

function ModelPanel({ model, onSaved }: { model: ModelInfo; onSaved: () => void }) {
  const [draft, setDraft] = useState<FeedConfig>(model.config)
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ intent: 'success' | 'danger'; text: string } | null>(null)
  const diff = changes(model.config, draft)
  const invalid = draft.wideWindowHours < draft.windowHours
  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      await saveFeedConfig(draft, note.trim())
      setMessage({ intent: 'success', text: 'Saved. Rankings use it within 30 seconds.' })
      setConfirming(false)
      setNote('')
      onSaved()
    } catch (cause) {
      setMessage({ intent: 'danger', text: cause instanceof Error ? cause.message : 'Could not save the configuration.' })
    } finally {
      setSaving(false)
    }
  }
  const setNumber = (key: Exclude<keyof FeedConfig, 'weights'>, value: number) => setDraft(current => ({ ...current, [key]: value }))
  return <>
    <Facts items={[
      ['Active model', model.active ? <>Trained model <code>{model.active.id.slice(0, 8)}</code></> : <Tag minimal>Prior (hand-set weights)</Tag>],
      ['Feature set', `version ${model.featureVersion}, ${model.featureNames.length} features`],
      ['Configuration', model.configId ? <>Saved row <code>{model.configId.slice(0, 8)}</code></> : 'Code defaults'],
    ]} />
    <details>
      <summary className={Classes.TEXT_MUTED}>Feature names</summary>
      <div className="admin-tag-row">{model.featureNames.map(name => <Tag key={name} minimal>{name}</Tag>)}</div>
    </details>
    <h3 className="admin-subheading">Value weights</h3>
    <div className="admin-config-form">
      {weightKeys.map(key => <FormGroup key={key} label={headLabels[key] ?? key} labelFor={`weight-${key}`}>
        <NumericInput id={`weight-${key}`} fill min={0} max={50} stepSize={0.5} minorStepSize={0.1} value={draft.weights[key]}
          onValueChange={value => Number.isFinite(value) && setDraft(current => ({ ...current, weights: { ...current.weights, [key]: value } }))} />
      </FormGroup>)}
    </div>
    <h3 className="admin-subheading">Ranking rules</h3>
    <div className="admin-config-form">
      {numberFields.map(field => <FormGroup key={field.key} label={field.label} labelFor={`config-${field.key}`}>
        <NumericInput id={`config-${field.key}`} fill min={field.min} max={field.max} stepSize={field.step} minorStepSize={field.step < 1 ? 0.01 : null}
          value={draft[field.key]} onValueChange={value => Number.isFinite(value) && setNumber(field.key, value)} />
      </FormGroup>)}
    </div>
    {invalid && <Callout intent="warning">The wide window has to be at least as long as the normal window.</Callout>}
    {message && <Callout intent={message.intent} role={message.intent === 'danger' ? 'alert' : 'status'}>{message.text}</Callout>}
    {confirming && diff.length > 0 ? <Callout intent="primary" title="Review the changes">
      <ul className="admin-diff">{diff.map(line => <li key={line}>{line}</li>)}</ul>
      <FormGroup label="Note for the activity log (optional)" labelFor="config-note">
        <InputGroup id="config-note" maxLength={200} value={note} onChange={event => setNote(event.currentTarget.value)} />
      </FormGroup>
      <div className="admin-heading-actions">
        <Button intent="primary" loading={saving} onClick={() => void save()}>Save configuration</Button>
        <Button variant="minimal" onClick={() => setConfirming(false)}>Back</Button>
      </div>
    </Callout> : <div className="admin-heading-actions">
      <Button intent="primary" disabled={!diff.length || invalid} onClick={() => setConfirming(true)}>Review {diff.length || ''} {diff.length === 1 ? 'change' : 'changes'}</Button>
      <Button variant="minimal" disabled={!diff.length} onClick={() => setDraft(model.config)}>Discard</Button>
      <Button variant="minimal" icon="reset" onClick={() => setDraft(model.defaults)}>Load defaults</Button>
    </div>}
    <details>
      <summary className={Classes.TEXT_MUTED}>Change history ({model.history.length})</summary>
      {model.history.length ? <HTMLTable compact striped className="overview-table">
        <thead><tr><th scope="col">When</th><th scope="col">By</th><th scope="col">Row</th></tr></thead>
        <tbody>{model.history.map(row => <tr key={row.id}>
          <td>{formatAge(row.createdAt)} ago</td><td>{row.handle ? `@${row.handle}` : 'unknown'}</td><td><code>{row.id.slice(0, 8)}</code></td>
        </tr>)}</tbody>
      </HTMLTable> : <p className={Classes.TEXT_MUTED}>No saved configuration yet; the code defaults apply.</p>}
    </details>
  </>
}
