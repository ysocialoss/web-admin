import { useEffect, useState } from 'react'
import { Button, Callout, Dialog, DialogBody, DialogFooter, FormGroup, HTMLSelect, InputGroup } from '@blueprintjs/core'
import { AdminAccessError, loadBadgeOptions, updateUserBadges } from './adminApi'
import type { BadgeChange, ManagedUser, UserBadge } from './adminApi'

export function UserBadgesDialog({ user, onClose, onSaved, onAccessLost }: {
  user: Pick<ManagedUser, 'id' | 'handle' | 'badges'>
  onClose: () => void
  onSaved: (badges: UserBadge[]) => void
  onAccessLost: () => void
}) {
  const [options, setOptions] = useState<Awaited<ReturnType<typeof loadBadgeOptions>>>()
  const [iconInput, setIconInput] = useState('')
  const [tooltipInput, setTooltipInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    loadBadgeOptions(controller.signal)
      .then(value => { if (!controller.signal.aborted) setOptions(value) })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setLoadError('Could not load badge options.')
      })
    return () => controller.abort()
  }, [onAccessLost])

  const icon = iconInput.trim().toLowerCase()
  const tooltip = tooltipInput.trim()
  const validIcon = options?.icons.includes(icon)
  const preset = options?.presets.find(item => item.icon === icon && item.tooltip === tooltip)
  const duplicate = user.badges.some(badge => badge.icon === icon && badge.tooltip === tooltip)

  async function save(change: BadgeChange) {
    if (saving) return
    setSaving(true)
    setSaveError('')
    try {
      onSaved(await updateUserBadges(user.id, change))
      if (change.action === 'add') {
        setIconInput('')
        setTooltipInput('')
      }
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setSaveError(cause instanceof Error ? cause.message : 'Could not save badges.')
    } finally {
      setSaving(false)
    }
  }

  return <Dialog isOpen title={`Manage badges for ${user.handle}`} icon="badge"
    onClose={() => { if (!saving) onClose() }}
    isCloseButtonShown={!saving} canEscapeKeyClose={!saving} canOutsideClickClose={!saving}>
    <form onSubmit={event => {
      event.preventDefault()
      if (validIcon && tooltip && !duplicate) void save({ action: 'add', icon, tooltip })
    }}>
      <DialogBody>
        {user.badges.length > 0 ? <ul className="admin-badge-list" aria-label="Assigned badges">
          {user.badges.map(badge => <li key={badge.id}>
            <BadgeIcon icon={badge.icon} />
            <span className="admin-badge-label">{badge.tooltip}</span>
            <Button type="button" variant="minimal" icon="cross" disabled={saving}
              aria-label={`Remove badge: ${badge.tooltip}`}
              onClick={() => void save({ action: 'remove', id: badge.id })} />
          </li>)}
        </ul> : <p>No assigned badges.</p>}
        {options ? <>
          <FormGroup label="Preset" labelFor="badge-preset">
            <HTMLSelect id="badge-preset" fill value={preset?.label ?? ''} disabled={saving}
              options={[{ label: 'Custom badge', value: '' }, ...options.presets.map(item => item.label)]}
              onChange={event => {
                const label = event.currentTarget.value
                const selected = options.presets.find(item => item.label === label)
                setIconInput(selected?.icon ?? '')
                setTooltipInput(selected?.tooltip ?? '')
              }} />
          </FormGroup>
          <FormGroup label="Lucide icon" labelFor="badge-icon"
            helperText={icon && !validIcon ? 'Choose an icon from the suggestions.' : undefined}>
            <InputGroup id="badge-icon" list="badge-icon-options" value={iconInput} disabled={saving}
              placeholder="Search by icon name" onChange={event => setIconInput(event.currentTarget.value)}
              leftElement={validIcon ? <span className="admin-badge-preview"><BadgeIcon icon={icon} /></span> : undefined} />
            <datalist id="badge-icon-options">{options.icons.map(name => <option key={name} value={name} />)}</datalist>
          </FormGroup>
          <FormGroup label="Tooltip" labelFor="badge-tooltip"
            helperText={duplicate ? 'This badge is already assigned.' : undefined}>
            <InputGroup id="badge-tooltip" value={tooltipInput} maxLength={120} disabled={saving}
              onChange={event => setTooltipInput(event.currentTarget.value)} />
          </FormGroup>
        </> : !loadError && <p role="status">Loading badge options…</p>}
        {(loadError || saveError) && <Callout intent="danger" role="alert">{saveError || loadError}</Callout>}
      </DialogBody>
      <DialogFooter actions={<>
        <Button type="button" disabled={saving} onClick={onClose}>Done</Button>
        <Button type="submit" intent="primary" disabled={saving || !validIcon || !tooltip || duplicate}>Add badge</Button>
      </>} />
    </form>
  </Dialog>
}

function BadgeIcon({ icon }: { icon: string }) {
  return <span aria-hidden="true" className="admin-badge-icon"
    style={{ maskImage: `url("/api/profiles/badge-icons/${icon}")` }} />
}
