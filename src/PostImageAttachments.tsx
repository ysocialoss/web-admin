import { useState } from 'react'
import { Button, ButtonGroup, Callout, Dialog, DialogBody, DialogFooter, FormGroup } from '@blueprintjs/core'
import { AdminAccessError, adminRequest } from './adminApi'
import { PostImage } from './PostPreview'

type ImageAction =
  | { kind: 'add' }
  | { kind: 'replace' | 'remove'; imageId: string; position: number }

const actionLabels = { add: 'Add attachment', replace: 'Replace attachment', remove: 'Remove attachment' }
const successMessages = { add: 'Image added.', replace: 'Image replaced.', remove: 'Image removed.' }
const maxImageBytes = 8 * 1024 * 1024

export default function PostImageAttachments({ postId, imageIds, canEdit, onAccessLost, onSaved }: {
  postId: string
  imageIds: string[]
  canEdit: boolean
  onAccessLost: () => void
  onSaved: (message: string) => void
}) {
  const [action, setAction] = useState<ImageAction | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function open(next: ImageAction) {
    setFile(null)
    setError('')
    setAction(next)
  }

  async function save() {
    if (!action || saving) return
    const request = action.kind === 'remove' ? { method: 'DELETE' } : file && {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Post-Image-Name': encodeURIComponent(file.name),
      },
      body: file,
    }
    if (!request) return
    const path = '/api/admin/posts/' + postId + '/attachments/images' +
      (action.kind === 'add' ? '' : '/' + action.imageId)
    setSaving(true)
    setError('')
    try {
      await adminRequest(path, undefined, request)
      setAction(null)
      onSaved(successMessages[action.kind])
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setError(cause instanceof Error ? cause.message : 'Could not update the attachment.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    {imageIds.map((imageId, index) => <div key={imageId}>
      <PostImage url={`/api/admin/post-images/${imageId}`} alt={`Attached image ${index + 1}`} />
      {canEdit && <ButtonGroup>
        <Button variant="minimal" icon="edit" aria-label={`Replace image ${index + 1}`}
          onClick={() => open({ kind: 'replace', imageId, position: index + 1 })}>Replace attachment</Button>
        <Button variant="minimal" icon="eraser" intent="danger" aria-label={`Remove image ${index + 1}`}
          onClick={() => open({ kind: 'remove', imageId, position: index + 1 })}>Remove attachment</Button>
      </ButtonGroup>}
    </div>)}
    {canEdit && imageIds.length < 4 &&
      <Button variant="minimal" icon="paperclip" onClick={() => open({ kind: 'add' })}>Add attachment</Button>}
    {action && <Dialog isOpen title={actionLabels[action.kind]} isCloseButtonShown={!saving}
      canEscapeKeyClose={!saving} canOutsideClickClose={!saving} onClose={() => setAction(null)}>
      <form onSubmit={event => { event.preventDefault(); void save() }}>
        <DialogBody>
          {action.kind === 'remove'
            ? <p>Remove image {action.position} from this post?</p>
            : <FormGroup label={action.kind === 'replace' ? `New file for image ${action.position}` : 'Image file'}
                labelFor="admin-post-image" helperText="Static JPEG, PNG, or WebP. Up to 8 MB.">
                <input id="admin-post-image" type="file" accept="image/jpeg,image/png,image/webp"
                  disabled={saving} required onChange={event => {
                    const selected = event.currentTarget.files?.[0]
                    const tooLarge = selected && selected.size > maxImageBytes
                    setFile(tooLarge ? null : selected ?? null)
                    setError(tooLarge ? 'Choose an image no larger than 8 MB.' : '')
                  }} />
              </FormGroup>}
          {error && <Callout intent="danger" role="alert">{error}</Callout>}
        </DialogBody>
        <DialogFooter actions={<>
          <Button disabled={saving} onClick={() => setAction(null)}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={action.kind !== 'remove' && !file}
            intent={action.kind === 'remove' ? 'danger' : 'primary'}>{actionLabels[action.kind]}</Button>
        </>} />
      </form>
    </Dialog>}
  </>
}
