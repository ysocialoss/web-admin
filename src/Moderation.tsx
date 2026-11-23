import { useEffect, useState } from 'react'
import { AdminAccessError, adminRequest, targetSchema } from './adminApi'
import type { AccountAction, ModerationDetail } from './adminApi'
import UserAvatar from './UserAvatar'
import { LoadingRows, LoadingStatus } from './LoadingState'
import { Alert, Button, Callout, Card, Classes, H1, H4, NonIdealState, PopoverNext, Tag, Text } from '@blueprintjs/core'
import { AccountActionDialog, UserActionDialog, UserActions } from './UserActions'
import type { UserProfileAction } from './UserActions'
import { UserBadgesDialog } from './UserBadgesDialog'
import UserPosts from './UserPosts'
import { PostGif, PostVoice } from './PostPreview'
import PostImageAttachments from './PostImageAttachments'
import PostTextEditor from './PostTextEditor'

export type ModerationTarget = { kind: 'user' | 'post'; id: string }

export default function Moderation({ onAccessLost, pathname, onNavigate, onOpenProfilePost, onRemoved, returnTo, navigationNotice }: {
  onAccessLost: () => void
  pathname: string
  onNavigate: (path: string) => void
  onOpenProfilePost: (id: string) => void
  onRemoved: () => void
  returnTo?: string
  navigationNotice: string
}) {
  const match = /^\/moderation\/(user|post)\/([0-9a-f-]+)\/?$/i.exec(pathname)
  const detailPath = match ? '/api/admin/' + match[1].toLowerCase() + '/' + match[2] : null
  const [revision, setRevision] = useState(0)
  const [profileAction, setProfileAction] = useState<UserProfileAction | null>(null)
  const [accountAction, setAccountAction] = useState<AccountAction | null>(null)
  const [badgeUserId, setBadgeUserId] = useState<string | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [confirmRemoval, setConfirmRemoval] = useState<'post' | 'images' | null>(null)
  const [removing, setRemoving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [completed, setCompleted] = useState<{ revision: number } & (
    { target: ModerationDetail } | { error: string }
  )>()
  useEffect(() => {
    if (!detailPath) return
    const controller = new AbortController()
    adminRequest(detailPath, controller.signal)
      .then(value => {
        if (!controller.signal.aborted) setCompleted({ revision, target: targetSchema.parse(value) })
      })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setCompleted({ revision, error: cause instanceof Error ? cause.message : 'Could not load item.' })
      })
    return () => controller.abort()
  }, [detailPath, revision, onAccessLost])

  const current = completed?.revision === revision ? completed : undefined
  const loading = Boolean(detailPath && !current)
  const error = current && 'error' in current ? current.error : ''
  const target = current && 'target' in current ? current.target : null
  const isUser = /^\/moderation\/user\//i.test(pathname)

  async function remove(id: string, kind: 'post' | 'images') {
    setRemoving(true)
    setActionError('')
    try {
      await adminRequest('/api/admin/posts/' + id + (kind === 'images' ? '/attachments/images' : ''), undefined, { method: 'DELETE' })
      if (kind === 'post') onRemoved()
      else {
        setConfirmRemoval(null)
        setRevision(value => value + 1)
        setNotice('Images removed.')
      }
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setActionError(cause instanceof Error ? cause.message : 'Could not remove content.')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <section className="overview" aria-labelledby="moderation-heading">
      <Button variant="minimal" icon="arrow-left" className="admin-back"
        onClick={() => onNavigate(returnTo ?? (isUser ? '/users' : '/moderation'))}>{returnTo ? 'Back' : isUser ? 'Users' : 'Content review'}</Button>
      <header className="overview-heading">
        <H1 id="moderation-heading">{target?.kind === 'post' ? target.type : isUser ? 'User profile' : 'Content details'}</H1>
        {target?.kind === 'user' && target.canEditProfile && <PopoverNext placement="bottom-end"
          content={<UserActions user={target} onAction={setProfileAction} onAccountAction={setAccountAction}
            onBadges={target.canEditBadges ? () => setBadgeUserId(target.id) : undefined} />}>
          <Button icon="edit" endIcon="chevron-down">Profile actions</Button>
        </PopoverNext>}
        {target?.kind === 'post' && target.canRemove &&
          <Button intent="danger" icon="trash" onClick={() => setConfirmRemoval('post')}>Remove {target.type.toLowerCase()}</Button>}
      </header>
      {(notice || navigationNotice) && <Callout className="admin-notice" intent="success" role="status">{notice || navigationNotice}</Callout>}
      <Card>
        {loading && <>
          <LoadingStatus label="Loading moderation item…" />
          <div aria-busy="true"><LoadingRows rows={3} /></div>
        </>}
        {error && <><p role="alert">{error}</p><Button onClick={() => setRevision(value => value + 1)}>Retry</Button></>}
        {!loading && !error && !target && <NonIdealState icon="search" title="Item not found" />}
        {target?.kind === 'user' && <UserDetails user={target} />}
        {target?.kind === 'post' && <>
          <div className="admin-post-meta">
            <Button icon="person" variant="minimal" onClick={() => onNavigate('/moderation/user/' + target.authorId)}>{target.author}</Button>
            <Text className={Classes.TEXT_MUTED}><time dateTime={target.time}>{new Date(target.time).toLocaleString()}</time></Text>
          </div>
          {target.content && <Text className="overview-details">{target.content}</Text>}
          {target.canRemove && <Button variant="minimal" icon="edit" onClick={() => setEditingPostId(target.id)}>Edit text</Button>}
          {target.gif && <PostGif gif={target.gif} />}
          <PostImageAttachments key={target.id} postId={target.id} imageIds={target.imageIds} canEdit={target.canRemove}
            onAccessLost={onAccessLost} onSaved={message => {
              setNotice(message)
              setRevision(value => value + 1)
            }} />
          {target.canRemove && target.imageIds.length > 0 &&
            <Button variant="minimal" intent="danger" icon="eraser" onClick={() => setConfirmRemoval('images')}>Remove images</Button>}
          {target.voiceUrl && <PostVoice url={target.voiceUrl} />}
          {target.pollTitle && <Callout icon="chart" title="Poll">{target.pollTitle}</Callout>}
          {target.quotedPostId && <Button variant="minimal" icon="citation"
            onClick={() => onNavigate('/moderation/post/' + target.quotedPostId)}>View quoted post</Button>}
          {target.parentId && <Button variant="minimal" icon="comment"
            onClick={() => onNavigate('/moderation/post/' + target.parentId)}>View parent post</Button>}
        </>}
      </Card>
      {target?.kind === 'user' && <UserPosts userId={target.id} onAccessLost={onAccessLost} onOpenPost={onOpenProfilePost} />}
      {target?.kind === 'post' && target.canRemove && target.id === editingPostId &&
        <PostTextEditor key={target.id} postId={target.id} content={target.content}
          onAccessLost={onAccessLost} onClose={() => setEditingPostId(null)} onSaved={() => {
            setEditingPostId(null)
            setRevision(value => value + 1)
            setNotice('Post text updated.')
          }} />}
      {target?.kind === 'user' && target.canEditBadges && target.id === badgeUserId &&
        <UserBadgesDialog key={target.id} user={target} onClose={() => setBadgeUserId(null)} onAccessLost={onAccessLost}
          onSaved={badges => {
            setCompleted(current => current && 'target' in current &&
              current.target.kind === 'user' && current.target.id === target.id
              ? { ...current, target: { ...current.target, badges } }
              : current)
          }} />}
      {target?.kind === 'user' && profileAction && <UserActionDialog user={target} action={profileAction}
        onClose={() => setProfileAction(null)} onAccessLost={onAccessLost} onSaved={() => {
          setProfileAction(null)
          setRevision(value => value + 1)
          setNotice('Profile updated.')
        }} />}
      {target?.kind === 'user' && accountAction && <AccountActionDialog user={target} action={accountAction}
        onClose={() => setAccountAction(null)} onAccessLost={onAccessLost} onSaved={() => {
          setAccountAction(null)
          if (accountAction === 'remove') onNavigate(returnTo ?? '/users')
          else {
            setRevision(value => value + 1)
            setNotice(target.handle + (accountAction === 'ban' ? ' banned.' : ' unbanned.'))
          }
        }} />}
      {target?.kind === 'post' && confirmRemoval && <Alert isOpen intent="danger" icon="trash"
        loading={removing} cancelButtonText="Cancel" confirmButtonText={confirmRemoval === 'images' ? 'Remove images' : `Remove ${target.type.toLowerCase()}`}
        onCancel={() => { setConfirmRemoval(null); setActionError('') }}
        onConfirm={() => void remove(target.id, confirmRemoval)}>
        <p>{confirmRemoval === 'images' ? `Remove the images from this ${target.type.toLowerCase()} by ${target.author}?`
          : `Permanently remove this ${target.type.toLowerCase()} by ${target.author} and all its replies?`}</p>
        {actionError && <Callout intent="danger" role="alert">{actionError}</Callout>}
      </Alert>}
    </section>
  )
}

function UserDetails({ user }: { user: Extract<ModerationDetail, { kind: 'user' }> }) {
  return <article className="admin-user-details">
    {user.bannerUrl && <ProfileBanner url={user.bannerUrl} crop={user.bannerCrop} />}
    <header className="admin-user-identity">
      <UserAvatar src={user.avatarUrl} size={64} />
      <div>
        <H4>{user.name || user.handle}</H4>
        {user.name && <Text className={Classes.TEXT_MUTED}>{user.handle}</Text>}
      </div>
      <Tag minimal>{user.role}</Tag>
      {user.bannedAt && <Tag minimal intent="danger">Banned</Tag>}
    </header>
    {user.bannedAt && <Callout intent="danger" title="Account banned">{user.banReason}</Callout>}
    <section aria-labelledby="admin-bio-heading">
      <H4 id="admin-bio-heading">Bio</H4>
      <Text className="overview-details">{user.bio || 'No bio provided.'}</Text>
    </section>
    <dl className="admin-user-facts">
      <div><dt>Pronouns</dt><dd><bdi>{user.pronouns || '—'}</bdi></dd></div>
      {user.github && <>
        <div><dt>GitHub</dt><dd>
          <a href={`https://github.com/${user.github.login}`} target="_blank" rel="noreferrer">@{user.github.login}</a>
        </dd></div>
        <div><dt>ysocialoss contributions</dt><dd>{user.github.contributionCount?.toLocaleString() ?? 'Pending'}</dd></div>
      </>}
      <div><dt>Followers</dt><dd>{user.followerCount.toLocaleString()}</dd></div>
      <div><dt>Following</dt><dd>{user.followingCount.toLocaleString()}</dd></div>
      <div><dt>Joined</dt><dd><time dateTime={user.joined}>{new Date(user.joined).toLocaleDateString()}</time></dd></div>
      <div><dt>Profile updated</dt><dd><time dateTime={user.updatedAt}>{new Date(user.updatedAt).toLocaleDateString()}</time></dd></div>
      <div><dt>Profile colour</dt><dd><span className="admin-user-colour" style={{ backgroundColor: user.colour }} />{user.colour}</dd></div>
      <div><dt>User ID</dt><dd><code>{user.id}</code></dd></div>
    </dl>
  </article>
}

function ProfileBanner({ url, crop }: {
  url: string
  crop: Extract<ModerationDetail, { kind: 'user' }>['bannerCrop']
}) {
  return <div className="admin-profile-banner">
    <img src={url} alt="" decoding="async" referrerPolicy="no-referrer" style={crop ? {
      width: `${100 / crop.width}%`,
      height: `${100 / crop.height}%`,
      left: `${(-100 * crop.x) / crop.width}%`,
      top: `${(-100 * crop.y) / crop.height}%`,
      objectFit: 'fill',
    } : undefined} />
  </div>
}
