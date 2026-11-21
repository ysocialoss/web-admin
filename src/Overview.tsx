import { useAdminHealth } from './adminApi'
import UserAvatar from './UserAvatar'
import PostPreview, { PostVoice } from './PostPreview'
import { LoadingRows, LoadingStatus } from './LoadingState'
import type { AdminOverview } from './adminApi'
import type { ModerationTarget } from './Moderation'
import { Button, Card, Classes, H1, H2, HTMLTable, Icon, Tag, Text } from '@blueprintjs/core'
import './Overview.css'

export default function Overview({ data, onOpenModeration, onNavigate, onRefresh }: {
  data: AdminOverview
  onOpenModeration: (target: ModerationTarget) => void
  onNavigate: (path: string) => void
  onRefresh: () => void
}) {
  const services = useAdminHealth()

  return <section className="overview" aria-labelledby="overview-title">
    <header className="overview-heading">
      <H1 id="overview-title">Overview</H1>
      <Button icon="refresh" variant="minimal" onClick={onRefresh}>Refresh</Button>
    </header>
    <div className="overview-metrics" aria-label="Community summary">
      {data.metrics.map(metric => <Card key={metric.label} className="admin-metric">
        <Icon icon={metric.label === 'Users' ? 'people' : 'document'} className="admin-metric-icon" />
        <Text className={Classes.TEXT_MUTED}>{metric.label}</Text>
        <strong className="overview-metric-number">{Number(metric.value).toLocaleString()}</strong>
        <Text className={Classes.TEXT_MUTED}>{metric.detail}</Text>
      </Card>)}
      <Card className="admin-metric">
        <Icon icon="pulse" className="admin-metric-icon" />
        <Text className={Classes.TEXT_MUTED}>System status</Text>
        {services === null ? <LoadingStatus label="Checking services…" /> : <div className="admin-service-list">
          {services.map(({ name, status }) => <div key={name}>
            <Text>{name}</Text><Tag minimal intent={status === 'ok' ? 'success' : 'warning'}>{status}</Tag>
          </div>)}
        </div>}
      </Card>
    </div>
    <div className="overview-columns">
      <Card className="admin-panel">
        <header className="admin-toolbar">
          <H2>Recent content</H2>
          <Button variant="minimal" endIcon="arrow-right" onClick={() => onNavigate('/moderation')}>Review content</Button>
        </header>
        <div className="overview-table-scroll">
          <HTMLTable striped className="overview-table admin-content-table">
            <thead><tr><th scope="col">Content</th><th scope="col">Type</th><th scope="col">Published</th></tr></thead>
            <tbody>
              {data.recentPosts.slice(0, 8).map(post => <tr key={post.id}>
                <td><Button variant="minimal" alignText="left" className="admin-user-link" onClick={() =>
                  onOpenModeration({ kind: 'post', id: post.id })}>
                  <PostPreview content={post.content} gif={post.gif} voiceUrl={post.voiceUrl} imageIds={post.imageIds} />
                  <span className={Classes.TEXT_MUTED}>{post.author}</span>
                </Button>
                {post.voiceUrl && <PostVoice url={post.voiceUrl} compact />}</td>
                <td><Tag minimal>{post.kind}</Tag></td>
                <td className={Classes.TEXT_MUTED}><time dateTime={post.time}>{new Date(post.time).toLocaleDateString()}</time></td>
              </tr>)}
              {!data.recentPosts.length && <tr><td colSpan={3}>No content yet.</td></tr>}
            </tbody>
          </HTMLTable>
        </div>
      </Card>
      <Card className="admin-panel">
        <header className="admin-toolbar">
          <H2>Recent signups</H2>
          <Button variant="minimal" endIcon="arrow-right" onClick={() => onNavigate('/users')}>All users</Button>
        </header>
        <div className="admin-signups">
          {data.recentUsers.slice(0, 8).map(user => <Button key={user.id} variant="minimal" alignText="left"
            className="admin-user-link" icon={<UserAvatar src={user.avatarUrl} size={32} />}
            onClick={() => onOpenModeration({ kind: 'user', id: user.id })}>
            <strong>{user.name || user.handle}</strong>
            {user.name && <span className={Classes.TEXT_MUTED}>{user.handle}</span>}
          </Button>)}
          {!data.recentUsers.length && <Text>No signups yet.</Text>}
        </div>
      </Card>
    </div>
  </section>
}

export function OverviewLoading() {
  return <section className="overview" aria-labelledby="overview-loading-heading">
    <header className="overview-heading"><H1 id="overview-loading-heading">Overview</H1></header>
    <LoadingStatus label="Loading overview…" />
    <div aria-busy="true" className="overview-metrics">
      {[0, 1, 2].map(index => <Card key={index}><LoadingRows rows={3} /></Card>)}
    </div>
  </section>
}
