import { useEffect, useState } from 'react'
import { Button, Callout, Card, Classes, FormGroup, H1, H3, HTMLSelect, HTMLTable, InputGroup, NonIdealState, Tag, TextArea } from '@blueprintjs/core'
import { z } from 'zod'
import { AdminAccessError, adminRequest } from './adminApi'
import { LoadingRows } from './LoadingState'

const apps = ['web', 'api', 'web-admin', 'android', 'mobile'] as const
const categories = ['new', 'improved', 'fixed', 'removed', 'technical'] as const
const entry = z.object({
  id: z.uuid(),
  app: z.enum(apps),
  category: z.enum(categories),
  title: z.string(),
  body: z.string(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  releaseTag: z.string().nullable(),
})
const changelog = z.object({ unreleased: z.array(entry), released: z.array(entry) })
type Entry = z.infer<typeof entry>
type Draft = Pick<Entry, 'app' | 'category' | 'title' | 'body'>
const emptyDraft: Draft = { app: 'web', category: 'new', title: '', body: '' }

const send = (path: string, method: string, body?: unknown) => adminRequest(path, undefined, {
  method,
  headers: body ? { 'Content-Type': 'application/json' } : undefined,
  body: body ? JSON.stringify(body) : undefined,
})

export default function Changelog({ onAccessLost }: { onAccessLost: () => void }) {
  const [data, setData] = useState<z.infer<typeof changelog> | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    adminRequest('/api/admin/changelog', controller.signal)
      .then(value => { if (!controller.signal.aborted) { setData(changelog.parse(value)); setError('') } })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setError(cause instanceof Error ? cause.message : 'Could not load the changelog.')
      })
    return () => controller.abort()
  }, [revision, onAccessLost])

  async function run(action: () => Promise<unknown>) {
    setSaving(true)
    setSaveError('')
    try {
      await action()
      setDraft(emptyDraft)
      setEditing(null)
      setRevision(value => value + 1)
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setSaveError(cause instanceof Error ? cause.message : 'Could not save the entry.')
    } finally {
      setSaving(false)
    }
  }

  const save = () => run(() => editing
    ? send('/api/admin/changelog/' + editing, 'PATCH', draft)
    : send('/api/admin/changelog', 'POST', draft))
  const remove = (id: string) => run(() => send('/api/admin/changelog/' + id, 'DELETE'))
  const edit = (item: Entry) => {
    setEditing(item.id)
    setDraft({ app: item.app, category: item.category, title: item.title, body: item.body })
  }

  return (
    <section className="overview">
      <header className="overview-heading"><H1>Changelog</H1></header>
      <Callout intent="primary" icon="info-sign">
        New entries stay unreleased and show as "coming soon" on staging. Promoting an app to production releases them.
      </Callout>

      <Card>
        <H3>{editing ? 'Edit entry' : 'New entry'}</H3>
        <FormGroup label="App" inline>
          <HTMLSelect value={draft.app} options={[...apps]}
            onChange={event => setDraft({ ...draft, app: event.currentTarget.value as Draft['app'] })} />
        </FormGroup>
        <FormGroup label="Category" inline>
          <HTMLSelect value={draft.category} options={[...categories]}
            onChange={event => setDraft({ ...draft, category: event.currentTarget.value as Draft['category'] })} />
        </FormGroup>
        <FormGroup label="Title" labelFor="changelog-title">
          <InputGroup id="changelog-title" maxLength={120} value={draft.title}
            onChange={event => setDraft({ ...draft, title: event.currentTarget.value })} />
        </FormGroup>
        <FormGroup label="Details (optional)" labelFor="changelog-body">
          <TextArea id="changelog-body" fill maxLength={4000} rows={4} value={draft.body}
            onChange={event => setDraft({ ...draft, body: event.currentTarget.value })} />
        </FormGroup>
        {saveError && <p role="alert" className={Classes.INTENT_DANGER}>{saveError}</p>}
        <Button intent="primary" loading={saving} disabled={!draft.title.trim()} onClick={save}>
          {editing ? 'Save changes' : 'Add entry'}
        </Button>
        {editing && <Button minimal onClick={() => { setEditing(null); setDraft(emptyDraft) }}>Cancel</Button>}
      </Card>

      {error && <Card><p role="alert">{error}</p><Button onClick={() => setRevision(value => value + 1)}>Retry</Button></Card>}
      {!data && !error && <LoadingRows />}
      {data && <>
        <H3>Unreleased</H3>
        {data.unreleased.length === 0
          ? <NonIdealState icon="clean" title="Nothing waiting for the next release" />
          : <EntryTable entries={data.unreleased} onEdit={edit} onRemove={remove} disabled={saving} />}
        <H3>Released</H3>
        {data.released.length === 0
          ? <NonIdealState icon="history" title="No releases yet" />
          : <EntryTable entries={data.released} />}
      </>}
    </section>
  )
}

function EntryTable({ entries, onEdit, onRemove, disabled }: {
  entries: Entry[]
  onEdit?: (entry: Entry) => void
  onRemove?: (id: string) => void
  disabled?: boolean
}) {
  return (
    <HTMLTable compact striped style={{ width: '100%' }}>
      <thead><tr><th>App</th><th>Category</th><th>Title</th><th>{onEdit ? 'Written' : 'Release'}</th>{onEdit && <th />}</tr></thead>
      <tbody>
        {entries.map(item => (
          <tr key={item.id}>
            <td><Tag minimal>{item.app}</Tag></td>
            <td>{item.category}</td>
            <td>{item.title}{item.body && <div className={Classes.TEXT_MUTED}>{item.body}</div>}</td>
            <td>{onEdit
              ? new Date(item.createdAt).toLocaleDateString()
              : `${item.releaseTag ?? ''} · ${item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : ''}`}</td>
            {onEdit && <td>
              <Button minimal small icon="edit" aria-label="Edit" disabled={disabled} onClick={() => onEdit(item)} />
              <Button minimal small icon="trash" intent="danger" aria-label="Delete" disabled={disabled} onClick={() => onRemove?.(item.id)} />
            </td>}
          </tr>
        ))}
      </tbody>
    </HTMLTable>
  )
}
