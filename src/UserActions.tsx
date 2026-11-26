import { useState } from 'react'
import { Alert, Button, Callout, Dialog, DialogBody, DialogFooter, FormGroup, HTMLSelect, InputGroup, Menu, MenuDivider, MenuItem, TextArea } from '@blueprintjs/core'
import { AdminAccessError, moderateAccount, replaceUserProfileImage, updateUserProfile, updateUserProfiles } from './adminApi'
import type { AccountAction, BulkProfileAction, ManagedUser, ProfileChange } from './adminApi'
import { PronounsField } from './PronounsField'
import { GroundFields } from './GroundDialog'
import { emptyGround, groundReady, requestGround, type Ground } from './ground'

type Action = ProfileChange['action']
type ImageAction = 'replaceAvatar' | 'replaceBanner'
export type UserProfileAction = Action | ImageAction
type SavedProfile = Pick<ManagedUser, 'id'> & Partial<ManagedUser>

export function UserActions({ user, onAction, onAccountAction, onBadges }: {
  user: Pick<ManagedUser, 'handle' | 'bannedAt' | 'canModerateAccount'>
  onAction: (action: UserProfileAction) => void
  onAccountAction: (action: AccountAction) => void
  onBadges?: () => void
}) {
  return <Menu aria-label={`Actions for ${user.handle}`}>
    <MenuItem text="Clear Bio" icon="eraser" onClick={() => onAction('clearBio')} />
    <MenuItem text="Clear Avatar" icon="media" onClick={() => onAction('clearAvatar')} />
    <MenuItem text="Clear Banner" icon="media" onClick={() => onAction('clearBanner')} />
    <MenuItem text="Replace Avatar" icon="upload" onClick={() => onAction('replaceAvatar')} />
    <MenuItem text="Replace Banner" icon="upload" onClick={() => onAction('replaceBanner')} />
    <MenuDivider />
    <MenuItem text="Change Username" icon="edit" onClick={() => onAction('changeUsername')} />
    <MenuItem text="Change Name" icon="edit" onClick={() => onAction('changeName')} />
    <MenuItem text="Change Bio" icon="edit" onClick={() => onAction('changeBio')} />
    <MenuItem text="Change Pronouns" icon="edit" onClick={() => onAction('changePronouns')} />
    {onBadges && <MenuItem text="Manage Badges" icon="badge" onClick={onBadges} />}
    {user.canModerateAccount && <>
      <MenuDivider />
      {user.bannedAt
        ? <MenuItem text="Unban User" icon="unlock" onClick={() => onAccountAction('unban')} />
        : <MenuItem text="Ban User" icon="ban-circle" intent="danger" onClick={() => onAccountAction('ban')} />}
      <MenuItem text="Remove User" icon="trash" intent="danger" onClick={() => onAccountAction('remove')} />
    </>}
  </Menu>
}

const accountActions = {
  ban: { label: 'Ban User', description: 'Makes the account read-only and hides its posts. The user sees the reason, time, and moderator. The reason also appears on their public profile.' },
  unban: { label: 'Unban User', description: 'Restores their posts and account access. They still need approval if their account was on the waitlist.' },
  remove: { label: 'Remove User', description: 'Permanently deletes the profile, its posts, and all replies below those posts, including replies from other users. The same CNS account can sign up again and will need approval.' },
}
const banReasons = ['Spam', 'Harassment or abuse', 'Impersonation', 'Hateful conduct']

export function AccountActionDialog({ user, action, onClose, onSaved, onAccessLost }: {
  user: Pick<ManagedUser, 'id' | 'handle'>
  action: AccountAction
  onClose: () => void
  onSaved: () => void
  onAccessLost: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preset, setPreset] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [ground, setGround] = useState<Ground>(emptyGround)
  const reason = preset === 'custom' ? customReason.trim() : preset
  const { label, description } = accountActions[action]
  async function submit() {
    setSaving(true)
    setError('')
    try {
      await moderateAccount(user.id, action === 'ban' ? { action, reason, ground: { ...ground, facts: ground.facts.trim() } } : { action })
      onSaved()
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setError(cause instanceof Error ? cause.message : 'Could not update this account.')
    } finally {
      setSaving(false)
    }
  }
  if (action === 'ban') return <Dialog isOpen title={`Ban ${user.handle}`} icon="ban-circle" onClose={() => { if (!saving) onClose() }}
    isCloseButtonShown={!saving} canEscapeKeyClose={!saving} canOutsideClickClose={!saving}>
    <form onSubmit={event => { event.preventDefault(); if (reason && groundReady(ground) && !saving) void submit() }}>
      <DialogBody>
        <p>{description}</p>
        <FormGroup label="Ban reason" labelFor="ban-reason">
          <HTMLSelect id="ban-reason" fill value={preset} disabled={saving} onChange={event => setPreset(event.currentTarget.value)}
            options={[{ label: 'Choose a reason', value: '' }, ...banReasons, { label: 'Write a reason', value: 'custom' }]} />
        </FormGroup>
        {preset === 'custom' && <FormGroup label="Custom reason" labelFor="ban-custom-reason" helperText={`${customReason.length} / 280`}>
          <TextArea id="ban-custom-reason" fill rows={4} maxLength={280} value={customReason} disabled={saving}
            onChange={event => setCustomReason(event.currentTarget.value)} />
        </FormGroup>}
        <GroundFields value={ground} onChange={setGround} />
        {error && <Callout intent="danger" role="alert">{error}</Callout>}
      </DialogBody>
      <DialogFooter actions={<>
        <Button disabled={saving} onClick={onClose}>Cancel</Button>
        <Button type="submit" intent="danger" loading={saving} disabled={!reason || !groundReady(ground) || saving}>Ban User</Button>
      </>} />
    </form>
  </Dialog>
  return <Alert isOpen icon={action === 'remove' ? 'trash' : 'unlock'}
    intent={action === 'unban' ? 'primary' : 'danger'} loading={saving} confirmButtonText={label} cancelButtonText="Cancel"
    onCancel={onClose} onConfirm={() => void submit()}>
    <p><strong>{label} {user.handle}?</strong></p>
    <p>{description}</p>
    {error && <Callout intent="danger" role="alert">{error}</Callout>}
  </Alert>
}

const titles = {
  clearBio: 'Clear Bio',
  clearAvatar: 'Clear Avatar',
  clearBanner: 'Clear Banner',
  changeUsername: 'Change Username',
  changeName: 'Change Name',
  changeBio: 'Change Bio',
  changePronouns: 'Change Pronouns',
} satisfies Record<Action, string>

const confirmText = {
  clearBio: 'Clear the bio',
  clearAvatar: 'Clear the current avatar',
  clearBanner: 'Clear the banner',
}

export function UserActionDialog({ user, action, onClose, onSaved, onAccessLost }: {
  user: Pick<ManagedUser, 'id' | 'handle' | 'name' | 'bio' | 'pronouns'>
  action: UserProfileAction
  onClose: () => void
  onSaved: (user: SavedProfile) => void
  onAccessLost: () => void
}) {
  if (action === 'replaceAvatar' || action === 'replaceBanner') {
    return <ProfileImageDialog key={user.id + action} user={user} kind={action === 'replaceAvatar' ? 'avatar' : 'banner'}
      onClose={onClose} onSaved={onSaved} onAccessLost={onAccessLost} />
  }
  const initialValue = action === 'changeUsername' ? user.handle.slice(1)
    : action === 'changeBio' ? user.bio
    : action === 'changePronouns' ? user.pronouns : user.name
  return <ProfileActionDialog action={action} initialValue={initialValue} target={user.handle}
    onClose={onClose} onAccessLost={onAccessLost} onSave={async value => {
      const change = action === 'changeName' || action === 'changeBio' || action === 'changeUsername' || action === 'changePronouns'
        ? { action, value } : { action }
      const ground = action === 'changePronouns' ? undefined : await requestGround(`Why ${titles[action].toLowerCase()}?`)
      if (action !== 'changePronouns' && !ground) throw new Error('A ground is required for this change.')
      onSaved(await updateUserProfile(user.id, change, ground ?? undefined))
    }} />
}

function ProfileImageDialog({ user, kind, onClose, onSaved, onAccessLost }: {
  user: Pick<ManagedUser, 'id' | 'handle'>
  kind: 'avatar' | 'banner'
  onClose: () => void
  onSaved: (user: SavedProfile) => void
  onAccessLost: () => void
}) {
  const [file, setFile] = useState<File>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const avatar = kind === 'avatar'
  const maxMiB = avatar ? 2 : 10
  const accept = avatar ? 'image/png' : 'image/png,image/jpeg,image/webp,image/gif,image/avif'

  async function submit() {
    if (!file || saving) return
    setSaving(true)
    setError('')
    try {
      const url = await replaceUserProfileImage(user.id, kind, file)
      onSaved(avatar ? { id: user.id, avatarUrl: url } : { id: user.id })
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setError(cause instanceof Error ? cause.message : `Could not replace the ${kind}.`)
    } finally {
      setSaving(false)
    }
  }

  return <Dialog isOpen title={`Replace ${kind} for ${user.handle}`} onClose={() => { if (!saving) onClose() }}
    isCloseButtonShown={!saving} canEscapeKeyClose={!saving} canOutsideClickClose={!saving}>
    <form onSubmit={event => { event.preventDefault(); void submit() }}>
      <DialogBody>
        <FormGroup label="Image file" labelFor="admin-profile-image"
          helperText={avatar ? 'PNG up to 2 MB.' : 'PNG, JPEG, WebP, GIF, or AVIF up to 10 MB. The image is cropped to 3:1 from the center.'}>
          <input id="admin-profile-image" type="file" accept={accept} disabled={saving}
            onChange={event => {
              const selected = event.currentTarget.files?.[0]
              const tooLarge = selected && selected.size > maxMiB * 1024 * 1024
              setFile(tooLarge ? undefined : selected)
              setError(tooLarge ? `Choose an image up to ${maxMiB} MB.` : '')
            }} />
        </FormGroup>
        {error && <Callout intent="danger" role="alert">{error}</Callout>}
      </DialogBody>
      <DialogFooter actions={<>
        <Button disabled={saving} onClick={onClose}>Cancel</Button>
        <Button type="submit" intent="primary" loading={saving} disabled={!file || saving}>Replace {kind}</Button>
      </>} />
    </form>
  </Dialog>
}

export function BulkProfileActionDialog({ action, ids, onSaved, onClose, onAccessLost }: {
  action: BulkProfileAction
  ids: string[]
  onSaved: (users: Awaited<ReturnType<typeof updateUserProfiles>>) => void
  onClose: () => void
  onAccessLost: () => void
}) {
  return <ProfileActionDialog action={action} initialValue="" target={`${ids.length} selected ${ids.length === 1 ? 'user' : 'users'}`}
    bulk onClose={onClose} onAccessLost={onAccessLost}
    onSave={async value => onSaved(await updateUserProfiles(ids, action, value))} />
}

function ProfileActionDialog({ action, initialValue, target, bulk = false, onClose, onSave, onAccessLost }: {
  action: Action
  initialValue: string
  target: string
  bulk?: boolean
  onClose: () => void
  onSave: (value: string) => Promise<void>
  onAccessLost: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const username = action === 'changeUsername'
  const bio = action === 'changeBio'
  const pronouns = action === 'changePronouns'
  const editing = username || bio || pronouns || action === 'changeName'
  const valid = username ? /^[a-z0-9_]{3,32}$/.test(value)
    : pronouns ? value.length <= 80
    : value.trim().length > 0 && (!bio || value.length <= 160)
  const unchanged = value.trim() === initialValue

  async function submit() {
    if (saving || (editing && (!valid || unchanged))) return
    setSaving(true)
    setError('')
    try {
      await onSave(value.trim())
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setError(cause instanceof Error ? cause.message : 'Could not update the profile.')
    } finally {
      setSaving(false)
    }
  }

  return <Dialog isOpen title={titles[action]} onClose={() => { if (!saving) onClose() }}
    isCloseButtonShown={!saving} canEscapeKeyClose={!saving} canOutsideClickClose={!saving}>
    <form onSubmit={event => { event.preventDefault(); void submit() }}>
      <DialogBody>
        {bulk && <p>Set the same {bio ? 'bio' : 'display name'} for {target}.</p>}
        {pronouns ? <PronounsField value={value} disabled={saving} onChange={setValue} /> : editing ? <FormGroup
          label={username ? 'Username' : bio ? 'Bio' : 'Display name'}
          labelFor="admin-profile-value"
          helperText={username ? 'Use 3 to 32 lowercase letters, numbers, or underscores.'
            : bio ? `${value.length} / 160` : undefined}
        >
          {bio
            ? <TextArea id="admin-profile-value" fill rows={4} value={value} disabled={saving} maxLength={160}
                onChange={event => setValue(event.currentTarget.value)} />
            : <InputGroup id="admin-profile-value" value={value} disabled={saving} maxLength={username ? 32 : 80}
                onChange={event => setValue(event.currentTarget.value)} />}
        </FormGroup> : <p>{confirmText[action]} for {target}?</p>}
        {error && <p role="alert">{error}</p>}
      </DialogBody>
      <DialogFooter actions={<>
        <Button disabled={saving} onClick={onClose}>Cancel</Button>
        <Button type="submit" intent={editing ? 'primary' : 'danger'} loading={saving}
          disabled={saving || (editing && (!valid || unchanged))}>{bulk ? 'Apply changes' : editing ? 'Save' : titles[action]}</Button>
      </>} />
    </form>
  </Dialog>
}
