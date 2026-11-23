import { useState } from 'react'
import { Button, Callout, Dialog, DialogBody, DialogFooter, FormGroup, TextArea } from '@blueprintjs/core'
import { AdminAccessError, adminRequest } from './adminApi'

export default function PostTextEditor({ postId, content, onClose, onAccessLost, onSaved }: {
  postId: string
  content: string
  onClose: () => void
  onAccessLost: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState(content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const text = draft.trim()
  const length = Array.from(text).length

  async function save() {
    if (saving || text === content || length > 2000) return
    setSaving(true)
    setError('')
    try {
      await adminRequest('/api/admin/posts/' + postId, undefined, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      onSaved()
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setError(cause instanceof Error ? cause.message : 'Could not save the post text.')
    } finally {
      setSaving(false)
    }
  }

  return <Dialog isOpen title="Edit text" isCloseButtonShown={!saving}
    canEscapeKeyClose={!saving} canOutsideClickClose={!saving} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <DialogBody>
        <FormGroup label="Post text" labelFor="admin-post-text" helperText={`${length} / 2,000 characters`}
          intent={length > 2000 ? 'danger' : 'none'}>
          <TextArea id="admin-post-text" fill rows={6} disabled={saving} value={draft}
            onChange={event => setDraft(event.currentTarget.value)} />
        </FormGroup>
        {error && <Callout intent="danger" role="alert">{error}</Callout>}
      </DialogBody>
      <DialogFooter actions={<>
        <Button disabled={saving} onClick={onClose}>Cancel</Button>
        <Button type="submit" intent="primary" loading={saving} disabled={text === content || length > 2000}>Save text</Button>
      </>} />
    </form>
  </Dialog>
}
