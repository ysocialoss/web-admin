import { useEffect, useState } from 'react'
import { Button, Card, Checkbox, ContextMenu, H1, HTMLTable, InputGroup, Menu, MenuItem, PopoverNext, Tag } from '@blueprintjs/core'
import { AdminAccessError, adminRequest, roles, updateUserRoles, userList } from './adminApi'
import UserAvatar from './UserAvatar'
import { LoadingRows, LoadingStatus } from './LoadingState'
import { AccountActionDialog, BulkProfileActionDialog, UserActions, UserActionDialog } from './UserActions'
import { UserBadgesDialog } from './UserBadgesDialog'
import type { AccountAction, BulkProfileAction, ManagedUser, ProfileChange } from './adminApi'

type UsersPage = ReturnType<typeof userList.parse>
type Role = ManagedUser['role']

export default function Users({ onAccessLost, onOpenUser }: { onAccessLost: () => void; onOpenUser: (id: string) => void }) {
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<UsersPage | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [bulkRole, setBulkRole] = useState<Role | null>(null)
  const [saving, setSaving] = useState<'bulk' | { userId: string } | null>(null)
  const [profileAction, setProfileAction] = useState<{ user: ManagedUser; action: ProfileChange['action'] } | null>(null)
  const [bulkProfileAction, setBulkProfileAction] = useState<BulkProfileAction | null>(null)
  const [accountAction, setAccountAction] = useState<{ user: ManagedUser; action: AccountAction } | null>(null)
  const [badgeUserId, setBadgeUserId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function loadUsers() {
      const params = new URLSearchParams({ q: query.trim(), page: String(page) })
      try {
        const users = userList.parse(await adminRequest('/api/admin/users?' + params, controller.signal))
        if (!controller.signal.aborted) setResult(users)
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setError(cause instanceof Error ? cause.message : 'Could not load users.')
      }
    }
    void loadUsers()
    return () => controller.abort()
  }, [query, page, revision, onAccessLost])

  function load(nextPage: number) {
    setResult(null)
    setError('')
    setSelected([])
    setBulkRole(null)
    setNotice(null)
    setPage(nextPage)
    setRevision(value => value + 1)
  }

  async function save(ids: string[], role: Role, source: 'bulk' | { userId: string }) {
    setSaving(source)
    setNotice(null)
    try {
      const updated = await updateUserRoles(ids, role)
      const byId = new Map(updated.map(user => [user.id, user]))
      setResult(current => current && {
        ...current,
        users: current.users.map(user => {
          const saved = byId.get(user.id)
          return saved ? { ...user, role: saved.role } : user
        }),
      })
      setSelected(current => current.filter(id => !byId.has(id)))
      if (ids.length === selected.length && selected.every(id => byId.has(id))) setBulkRole(null)
      setNotice({ kind: 'success', text: updated.length === 1 ? 'Role saved.' : `Roles saved for ${updated.length} users.` })
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'Could not save roles.' })
    } finally {
      setSaving(null)
    }
  }

  const selectable = result?.canEditProfiles ? result.users.map(user => user.id) : []
  const roleTargets = result?.users.filter(user => user.canEditRole && selected.includes(user.id)).map(user => user.id) ?? []
  const allSelected = selectable.length > 0 && selected.length === selectable.length
  const badgeUser = result?.users.find(user => user.id === badgeUserId)

  return <section className="overview" aria-labelledby="users-heading">
    <header className="overview-heading"><H1 id="users-heading">Users</H1></header>
    <Card>
      <form role="search" onSubmit={event => {
        event.preventDefault()
        if (saving) return
        setQuery(searchInput.trim())
        load(1)
      }}>
        <InputGroup
          type="search"
          leftIcon="search"
          aria-label="Search users by name or handle"
          placeholder="Search by name or handle"
          maxLength={255}
          value={searchInput}
          disabled={saving !== null}
          onChange={event => setSearchInput(event.currentTarget.value)}
        />
      </form>
      {error && <p role="alert">{error} <Button onClick={() => load(page)}>Retry</Button></p>}
      {!result && !error && <div className="admin-users-results">
        <LoadingStatus label={query ? 'Searching users…' : page > 1 ? `Loading page ${page}…` : 'Loading users…'} />
        <div aria-busy="true"><LoadingRows rows={5} /></div>
      </div>}
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
      {result && <div className="admin-users-results">
        {selected.length > 0 && <div className="overview-heading" role="group" aria-label="Bulk user actions">
          <span>{selected.length} selected</span>{' '}
          <Button icon="edit" disabled={saving !== null} onClick={() => setBulkProfileAction('changeName')}>Change Name</Button>
          <Button icon="edit" disabled={saving !== null} onClick={() => setBulkProfileAction('changeBio')}>Change Bio</Button>
          {roleTargets.length > 0 && <>
            <RoleSelect role={bulkRole} label="Role for selected users" disabled={saving !== null} onChange={setBulkRole} />
            <Button intent="primary" loading={saving === 'bulk'} disabled={saving !== null || !bulkRole} onClick={() => {
              if (bulkRole) void save(roleTargets, bulkRole, 'bulk')
            }}>{roleTargets.length === selected.length ? 'Apply role' : `Apply role to ${roleTargets.length} eligible`}</Button>
          </>}
          <Button variant="minimal" disabled={saving !== null} onClick={() => { setSelected([]); setBulkRole(null) }}>Clear selection</Button>
        </div>}
        {result.users.length === 0 ? <p>No users found.</p> : <div className="overview-table-scroll">
          <HTMLTable striped className="overview-table">
            <thead><tr>
              {selectable.length > 0 && <th scope="col">
                <Checkbox aria-label="Select all users on this page" checked={allSelected}
                  indeterminate={selected.length > 0 && !allSelected} disabled={saving !== null}
                  onChange={() => setSelected(allSelected ? [] : selectable)} />
              </th>}
              <th scope="col">User</th><th scope="col">Bio</th><th scope="col">Joined</th><th scope="col">Role</th>
              {result.canEditProfiles && <th scope="col">Actions</th>}
            </tr></thead>
            <tbody>
              {result.users.map(user => {
                const actionMenu = result.canEditProfiles ? <UserActions user={user} onAction={action => {
                  setNotice(null)
                  setProfileAction({ user, action })
                }} onAccountAction={action => { setNotice(null); setAccountAction({ user, action }) }}
                  onBadges={() => setBadgeUserId(user.id)} /> : undefined

                return <ContextMenu key={user.id} content={actionMenu} disabled={!result.canEditProfiles || saving !== null}>
                  {({ ref, className, onContextMenu, popover }) => <tr ref={ref} className={className} onContextMenu={onContextMenu}>
                    {selectable.length > 0 && <td>
                      <Checkbox aria-label={`Select ${user.handle}`}
                        checked={selected.includes(user.id)} disabled={saving !== null}
                        onChange={event => {
                          const checked = event.currentTarget.checked
                          setSelected(current => checked ? [...current, user.id] : current.filter(id => id !== user.id))
                        }} />
                    </td>}
                    <td>
                      <Button variant="minimal" alignText="left" className="admin-user-link"
                        icon={<UserAvatar src={user.avatarUrl} />} onClick={() => onOpenUser(user.id)}>
                        <strong>{user.name || user.handle}</strong>
                        {user.name && <span>{user.handle}</span>}
                      </Button>
                      {user.bannedAt && <Tag minimal intent="danger">Banned</Tag>}
                    </td>
                    <td className="admin-user-bio"><div>{user.bio || '—'}</div></td>
                    <td><time dateTime={user.joined}>{new Date(user.joined).toLocaleDateString()}</time></td>
                    <td>{user.canEditRole
                      ? <UserRole key={user.role} user={user} disabled={saving !== null}
                          saving={saving !== 'bulk' && saving?.userId === user.id}
                          onSave={role => void save([user.id], role, { userId: user.id })} />
                      : <Tag minimal>{user.role}</Tag>}</td>
                    {result.canEditProfiles && <td>
                      <PopoverNext placement="bottom-end" disabled={saving !== null} content={actionMenu}>
                        <Button variant="minimal" small icon="more" disabled={saving !== null} aria-label={`Actions for ${user.handle}`} />
                      </PopoverNext>
                      {popover}
                    </td>}
                  </tr>}
                </ContextMenu>
              })}
            </tbody>
          </HTMLTable>
        </div>}
        <div role="group" aria-label="Users pagination">
          <Button disabled={saving !== null || page === 1} onClick={() => load(page - 1)}>Previous</Button>{' '}
          <span>Page {page}</span>{' '}
          <Button disabled={saving !== null || !result.hasNextPage} onClick={() => load(page + 1)}>Next</Button>
        </div>
      </div>}
    </Card>
    {badgeUser && result?.canEditProfiles && <UserBadgesDialog key={badgeUser.id} user={badgeUser}
      onClose={() => setBadgeUserId(null)} onAccessLost={onAccessLost} onSaved={badges => {
        setResult(current => current && {
          ...current,
          users: current.users.map(user => user.id === badgeUser.id ? { ...user, badges } : user),
        })
      }} />}
    {profileAction && <UserActionDialog {...profileAction} onClose={() => setProfileAction(null)} onAccessLost={onAccessLost}
      onSaved={updated => {
        setResult(current => current && { ...current, users: current.users.map(user => user.id === updated.id ? updated : user) })
        setProfileAction(null)
        setNotice({ kind: 'success', text: 'Profile updated.' })
      }} />}
    {bulkProfileAction && <BulkProfileActionDialog action={bulkProfileAction} ids={selected}
      onClose={() => setBulkProfileAction(null)} onAccessLost={onAccessLost} onSaved={updated => {
        const byId = new Map(updated.map(user => [user.id, user]))
        setResult(current => current && {
          ...current,
          users: current.users.map(user => {
            const saved = byId.get(user.id)
            return saved ? { ...user, ...saved } : user
          }),
        })
        setBulkProfileAction(null)
        setNotice({ kind: 'success', text: updated.length === 0 ? 'No profiles changed.'
          : updated.length === 1 ? 'Profile updated.' : `Updated ${updated.length} profiles.` })
      }} />}
    {accountAction && <AccountActionDialog {...accountAction} onAccessLost={onAccessLost}
      onClose={() => setAccountAction(null)} onSaved={() => {
        const { user, action } = accountAction
        setAccountAction(null)
        if (action === 'remove') {
          setSelected(current => current.filter(id => id !== user.id))
          if (result?.users.length === 1 && page > 1) load(page - 1)
          else setRevision(current => current + 1)
        } else setRevision(current => current + 1)
        setNotice({ kind: 'success', text: user.handle + (action === 'ban' ? ' banned.' : action === 'unban' ? ' unbanned.' : ' removed.') })
      }} />}
  </section>
}

function UserRole({ user, disabled, saving, onSave }: { user: ManagedUser; disabled: boolean; saving: boolean; onSave: (role: Role) => void }) {
  const [role, setRole] = useState(user.role)
  return <>
    <RoleSelect role={role} label={`Role for ${user.handle}`} disabled={disabled} onChange={setRole} />{' '}
    <Button small aria-label={`Save role for ${user.handle}`} loading={saving} disabled={disabled || role === user.role} onClick={() => onSave(role)}>Save</Button>
  </>
}

function RoleSelect({ role, label, disabled, onChange }: {
  role: Role | null
  label: string
  disabled: boolean
  onChange: (role: Role) => void
}) {
  return <PopoverNext placement="bottom-start" disabled={disabled} content={
    <Menu role="listbox" aria-label={label}>
      {roles.options.map(option => <MenuItem key={option} text={option} selected={option === role}
        roleStructure="listoption" onClick={() => onChange(option)} />)}
    </Menu>
  }>
    <Button small aria-label={`${label}${role ? ', ' + role : ''}`} disabled={disabled} endIcon="chevron-down">
      {role ?? 'Choose role'}
    </Button>
  </PopoverNext>
}
