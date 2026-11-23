import { useState } from 'react'
import { Button, Callout, Card, Classes, H1, H2, HTMLTable, Icon, ProgressBar, Switch, Tag } from '@blueprintjs/core'
import { LoadingRows, LoadingStatus } from './LoadingState'
import BarChart from './BarChart'
import {
  available, formatAge, overallStatus, statusIntent, statusText, formatBytes, formatDuration, integrationLabels, serviceLabels, useSystemStatus,
} from './systemApi'
import type { SystemStatus } from './systemApi'

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return <dl className="admin-facts">{items.map(([name, value]) => <div key={name}><dt className={Classes.TEXT_MUTED}>{name}</dt><dd>{value}</dd></div>)}</dl>
}

function Meter({ label, value, max, detail }: { label: string; value: number; max: number; detail: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0
  return <div className="admin-meter">
    <div><span>{label}</span><span className={Classes.TEXT_MUTED}>{detail}</span></div>
    <ProgressBar value={ratio} stripes={false} animate={false} intent={ratio > 0.9 ? 'danger' : ratio > 0.75 ? 'warning' : 'primary'} aria-label={label} />
  </div>
}

const Unavailable = () => <Callout intent="warning" icon="warning-sign">This section could not be loaded.</Callout>

export function ServiceTable({ services }: { services: SystemStatus['services'] }) {
  return <div className="overview-table-scroll">
    <HTMLTable className="overview-table" compact>
      <thead><tr><th scope="col">Service</th><th scope="col">Status</th><th scope="col">Latency</th><th scope="col">Checked</th></tr></thead>
      <tbody>{Object.entries(services).map(([key, check]) => <tr key={key}>
        <td>{serviceLabels[key] ?? key}</td>
        <td><Tag minimal intent={statusIntent(check.status)}>{statusText(check.status)}</Tag></td>
        <td>{check.latencyMs} ms</td>
        <td className={Classes.TEXT_MUTED}><time dateTime={check.checkedAt}>{formatAge(check.checkedAt)} ago</time></td>
      </tr>)}</tbody>
    </HTMLTable>
  </div>
}

export default function System({ onAccessLost }: { onAccessLost: () => void }) {
  const [auto, setAuto] = useState(true)
  const { data, error, loading, refresh } = useSystemStatus(onAccessLost, auto ? 15_000 : null)

  return <section className="overview" aria-labelledby="system-heading">
    <header className="overview-heading">
      <H1 id="system-heading">System status</H1>
      <div className="admin-heading-actions">
        <Switch checked={auto} label="Auto-refresh" onChange={event => setAuto(event.currentTarget.checked)} />
        <Button icon="refresh" variant="minimal" onClick={refresh} loading={loading && !data}>Refresh</Button>
      </div>
    </header>
    {error && <Callout intent="danger" role="alert">{error} <Button onClick={refresh}>Retry</Button></Callout>}
    {!data && !error && <><LoadingStatus label="Loading system status…" /><LoadingRows rows={6} /></>}
    {data && <SystemBody data={data} />}
  </section>
}

function SystemBody({ data }: { data: SystemStatus }) {
  const overall = overallStatus(data.services)
  const { runtime, host } = { runtime: data.runtime, host: data.runtime.host }
  const memoryUsed = host.memoryTotal - host.memoryFree
  const { database, queues, community, moderation } = data
  return <>
    <Callout intent={overall.intent} icon={overall.intent === 'success' ? 'tick-circle' : 'warning-sign'} className="admin-overall">
      <strong>{overall.text}</strong>
      <span className={Classes.TEXT_MUTED}> · updated <time dateTime={data.generatedAt}>{new Date(data.generatedAt).toLocaleTimeString()}</time></span>
      {runtime.draining && <Tag intent="warning" minimal>Draining for shutdown</Tag>}
    </Callout>
    <div className="admin-system-grid">
      <Card className="admin-panel admin-system-wide">
        <header className="admin-toolbar"><H2>Services</H2></header>
        <ServiceTable services={data.services} />
      </Card>

      <Card className="admin-panel">
        <header className="admin-toolbar"><H2>API process</H2><Tag minimal>{runtime.environment}</Tag></header>
        <div className="admin-panel-body">
          <Facts items={[
            ['Uptime', `${formatDuration(runtime.uptimeSeconds)} (since ${new Date(runtime.startedAt).toLocaleString()})`],
            ['Node.js', runtime.node], ['Platform', `${runtime.platform} · pid ${runtime.pid}`],
            ['Event loop lag', `mean ${runtime.eventLoopMs.mean} ms · p99 ${runtime.eventLoopMs.p99} ms · max ${runtime.eventLoopMs.max} ms`],
            ['Memory', `${formatBytes(runtime.memory.rss)} RSS · ${formatBytes(runtime.memory.heapUsed)} heap used`],
            ['Load average', `${host.load.join(' · ')} on ${host.cores} cores`],
          ]} />
          <Meter label="Host memory" value={memoryUsed} max={host.memoryTotal} detail={`${formatBytes(memoryUsed)} of ${formatBytes(host.memoryTotal)}`} />
          <Meter label="Live streams" value={runtime.liveStreams.open} max={runtime.liveStreams.max}
            detail={`${runtime.liveStreams.open.toLocaleString()} of ${runtime.liveStreams.max.toLocaleString()}`} />
        </div>
      </Card>

      <Card className="admin-panel">
        <header className="admin-toolbar"><H2>Database</H2>{available(database) && <Tag minimal>{database.latencyMs} ms</Tag>}</header>
        <div className="admin-panel-body">
          {available(database) ? <>
            <Facts items={[
              ['Server', database.version], ['Size', formatBytes(database.sizeBytes)],
              ['Server uptime', formatAge(database.startedAt)],
              ['Cache hit ratio', database.cacheHitRatio === null ? '—' : (database.cacheHitRatio * 100).toFixed(2) + '%'],
              ['Transactions', `${database.transactions.commits.toLocaleString()} committed · ${database.transactions.rollbacks.toLocaleString()} rolled back`],
              ['Deadlocks', database.deadlocks.toLocaleString()],
              ['Migrations applied', database.migrations?.applied ?? '—'],
            ]} />
            <Meter label="Server connections" value={database.connections.open} max={database.connections.max}
              detail={`${database.connections.open} of ${database.connections.max}`} />
            <Meter label="API pool" value={database.pool.total - database.pool.idle} max={database.pool.max}
              detail={`${database.pool.total - database.pool.idle} busy · ${database.pool.idle} idle · ${database.pool.waiting} waiting`} />
          </> : <Unavailable />}
        </div>
      </Card>

      <Card className="admin-panel">
        <header className="admin-toolbar"><H2>Background queues</H2></header>
        <div className="admin-panel-body">
          {available(queues) ? <Facts items={[
            ['Media deletions', <>{queues.mediaDeletions.pending} pending · {queues.mediaDeletions.due} due{queues.mediaDeletions.retrying > 0 && <Tag minimal intent="warning" className="admin-inline-tag">{queues.mediaDeletions.retrying} retrying</Tag>}</>],
            ['Voice transcodes', <>{queues.voiceJobs.pending} pending{queues.voiceJobs.failed > 0 && <Tag minimal intent="danger" className="admin-inline-tag">{queues.voiceJobs.failed} failed</Tag>}</>],
            ['GitHub contribution syncs', `${queues.githubContributions.due} due`],
            ['Push deliveries', <>{queues.pushDeliveries.pending} pending{queues.pushDeliveries.retrying > 0 && <Tag minimal intent="warning" className="admin-inline-tag">{queues.pushDeliveries.retrying} retrying</Tag>}</>],
            ['Push subscriptions', queues.pushSubscriptions.toLocaleString()],
          ]} /> : <Unavailable />}
        </div>
      </Card>

      <Card className="admin-panel">
        <header className="admin-toolbar"><H2>Configuration</H2></header>
        <ul className="admin-config-list">
          {Object.entries(data.configured).map(([key, enabled]) => <li key={key}>
            <Icon icon={enabled ? 'tick-circle' : 'remove'} intent={enabled ? 'success' : 'none'} />
            <span>{integrationLabels[key] ?? key}</span>
            <span className={Classes.TEXT_MUTED}>{enabled ? 'Configured' : 'Not configured'}</span>
          </li>)}
        </ul>
      </Card>

      <Card className="admin-panel">
        <header className="admin-toolbar"><H2>Community</H2></header>
        <div className="admin-panel-body">
          {available(community) ? <>
            <Facts items={[
              ['Users', `${community.users.total.toLocaleString()} (${community.users.signups7d} this week)`],
              ['Waiting for approval', community.users.pendingApproval], ['Banned', community.users.banned],
              ['Staff', `${community.users.admins} admin · ${community.users.moderators} moderator · ${community.users.ogs} og`],
              ['Posts and replies', `${community.posts.total.toLocaleString()} (${community.posts.topLevel.toLocaleString()} posts, ${community.posts.replies.toLocaleString()} replies)`],
              ['Active sessions', community.activeSessions.toLocaleString()],
              ['Images · conversations', `${community.images.toLocaleString()} · ${community.conversations.toLocaleString()}`],
            ]} />
            <div className="admin-chart-row">
              <BarChart data={community.signupsByDay} label="Signups, 14 days" unit="signups" />
              <BarChart data={community.postsByDay} label="Posts, 14 days" unit="posts" />
            </div>
          </> : <Unavailable />}
        </div>
      </Card>

      <Card className="admin-panel">
        <header className="admin-toolbar"><H2>Moderation workload</H2></header>
        <div className="admin-panel-body">
          {available(moderation) ? <>
            <Facts items={[
              ['Open reports', <>{moderation.openReports}{moderation.oldestOpenReportAt && <span className={Classes.TEXT_MUTED}> · oldest {formatAge(moderation.oldestOpenReportAt)}</span>}</>],
              ['Reports this week', `${moderation.reports7d} filed · ${moderation.handled7d} handled`],
              ['Image flags this week', moderation.imageFlags7d], ['Waitlist', moderation.waitlist],
              ['Staff actions', `${moderation.actions24h} in 24 hours · ${moderation.actions7d} this week`],
            ]} />
            {moderation.openByReason.length > 0 && <div className="admin-tag-row">{moderation.openByReason.map(item =>
              <Tag key={item.reason} minimal>{item.reason.replace('_', ' ')} · {item.count}</Tag>)}</div>}
          </> : <Unavailable />}
        </div>
      </Card>

      {available(database) && <Card className="admin-panel admin-system-wide">
        <header className="admin-toolbar"><H2>Largest tables</H2></header>
        <div className="overview-table-scroll">
          <HTMLTable striped compact className="overview-table">
            <thead><tr><th scope="col">Table</th><th scope="col">Rows (estimate)</th><th scope="col">Size</th></tr></thead>
            <tbody>{database.tables.map(table => <tr key={table.name}>
              <td><code>{table.name}</code></td><td>{table.rows.toLocaleString()}</td><td>{formatBytes(table.bytes)}</td>
            </tr>)}</tbody>
          </HTMLTable>
        </div>
      </Card>}
    </div>
  </>
}
