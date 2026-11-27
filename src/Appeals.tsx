import { useEffect, useState } from 'react'
import { Button, Callout, Card, Classes, Dialog, DialogBody, DialogFooter, FormGroup, H1, NonIdealState, SegmentedControl, Tag, TextArea } from '@blueprintjs/core'
import { z } from 'zod'
import { AdminAccessError, adminRequest } from './adminApi'
import { LoadingRows, LoadingStatus } from './LoadingState'
import { legalCategories, termsClauses } from './ground'

const appeal = z.object({
  id: z.uuid(), text: z.string(), status: z.enum(['open', 'upheld', 'reversed']), staffNote: z.string().nullable(),
  resolvedByHandle: z.string().nullable(), resolvedAt: z.string().nullable(), createdAt: z.string(), userHandle: z.string(),
  decision: z.object({
    id: z.uuid(), action: z.string(), targetType: z.string(), targetKey: z.string().nullable(), excerpt: z.string(),
    groundType: z.enum(['terms', 'illegal']), groundRef: z.string(), facts: z.string(),
    decidedByHandle: z.string().nullable(), decidedById: z.string().nullable(), automatedDecision: z.boolean(), createdAt: z.string(),
  }),
})
type Appeal = z.infer<typeof appeal>
const statuses = ['open', 'upheld', 'reversed', 'all'] as const

function groundLabel(decision: Appeal['decision']) {
  if (decision.groundType === 'terms') return `Terms ${decision.groundRef} ${termsClauses.find(clause => clause.id === decision.groundRef)?.title ?? ''}`
  return legalCategories.find(category => category.id === decision.groundRef)?.title ?? decision.groundRef
}

export default function Appeals({ onAccessLost, onOpenUser }: { onAccessLost: () => void; onOpenUser: (id: string) => void }) {
  const [status, setStatus] = useState<(typeof statuses)[number]>('open')
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ key: string; appeals?: Appeal[]; error?: string }>()
  const [resolving, setResolving] = useState<Appeal | null>(null)
  const [notice, setNotice] = useState('')
  const key = status + revision
  useEffect(() => {
    const controller = new AbortController()
    adminRequest('/api/admin/appeals?status=' + status, controller.signal)
      .then(value => setState({ key, appeals: z.object({ appeals: z.array(appeal) }).parse(value).appeals }))
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setState({ key, error: cause instanceof Error ? cause.message : 'Could not load appeals.' })
      })
    return () => controller.abort()
  }, [status, key, onAccessLost])
  const current = state?.key === key ? state : undefined
  return <section className="overview" aria-labelledby="appeals-heading">
    <header className="overview-heading">
      <H1 id="appeals-heading">Appeals</H1>
      <SegmentedControl value={status} onValueChange={value => setStatus(value as typeof status)}
        options={statuses.map(value => ({ label: value[0].toUpperCase() + value.slice(1), value }))} />
    </header>
    <p className={Classes.TEXT_MUTED}>Users can appeal moderation decisions for six months. Where possible, someone other than the original moderator decides.</p>
    {notice && <Callout className="admin-notice" intent="success" role="status">{notice}</Callout>}
    {!current && <Card><LoadingStatus label="Loading appeals…" /><LoadingRows rows={3} /></Card>}
    {current?.error && <Card><p role="alert">{current.error}</p><Button onClick={() => setRevision(value => value + 1)}>Retry</Button></Card>}
    {current?.appeals && (current.appeals.length === 0
      ? <NonIdealState icon="take-action" title="No appeals" />
      : current.appeals.map(item => <Card key={item.id} className="admin-panel">
          <header className="admin-toolbar">
            <h2 className={Classes.HEADING}>@{item.userHandle} appeals: {item.decision.action.replaceAll('_', ' ')}</h2>
            <Tag minimal intent={item.status === 'open' ? 'warning' : item.status === 'reversed' ? 'success' : 'none'}>{item.status}</Tag>
          </header>
          <dl className="admin-user-facts">
            <div><dt>Ground</dt><dd>{groundLabel(item.decision)}</dd></div>
            <div><dt>Facts</dt><dd>{item.decision.facts}</dd></div>
            {item.decision.excerpt && <div><dt>Content</dt><dd>{item.decision.excerpt}</dd></div>}
            <div><dt>Decided</dt><dd>{item.decision.automatedDecision ? 'Automatically' : '@' + (item.decision.decidedByHandle ?? 'staff')}, {new Date(item.decision.createdAt).toLocaleString()}</dd></div>
            <div><dt>Appeal</dt><dd>{item.text}</dd></div>
            {item.staffNote && <div><dt>Answer</dt><dd>{item.staffNote} (@{item.resolvedByHandle})</dd></div>}
          </dl>
          {item.decision.targetType === 'user' && item.decision.targetKey &&
            <Button variant="minimal" icon="person" onClick={() => onOpenUser(item.decision.targetKey!)}>Open user</Button>}
          {item.status === 'open' && <Button intent="primary" onClick={() => setResolving(item)}>Decide</Button>}
        </Card>))}
    {resolving && <ResolveAppeal appeal={resolving} onClose={() => setResolving(null)} onAccessLost={onAccessLost}
      onDone={message => { setResolving(null); setNotice(message); setRevision(value => value + 1) }} />}
  </section>
}

function ResolveAppeal({ appeal, onClose, onDone, onAccessLost }: {
  appeal: Appeal; onClose: () => void; onDone: (message: string) => void; onAccessLost: () => void
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState<'upheld' | 'reversed' | null>(null)
  const [error, setError] = useState('')
  async function decide(outcome: 'upheld' | 'reversed') {
    setSaving(outcome)
    setError('')
    try {
      await adminRequest('/api/admin/appeals/' + appeal.id + '/resolve', undefined, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome, note: note.trim() }),
      })
      onDone(outcome === 'reversed' ? 'Decision reversed.' : 'Decision upheld.')
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setError(cause instanceof Error ? cause.message : 'Could not save the decision.')
    } finally {
      setSaving(null)
    }
  }
  return <Dialog isOpen onClose={onClose} title={`Appeal by @${appeal.userHandle}`} icon="take-action">
    <DialogBody>
      <p>Reversing restores hidden posts and lifts bans. Removed content cannot be restored.</p>
      <FormGroup label="Answer to the user" labelFor="appeal-note" helperText="The user sees this.">
        <TextArea id="appeal-note" fill rows={4} maxLength={2000} value={note} onChange={event => setNote(event.currentTarget.value)} />
      </FormGroup>
      {error && <Callout intent="danger" role="alert">{error}</Callout>}
    </DialogBody>
    <DialogFooter actions={<>
      <Button onClick={onClose} disabled={saving !== null}>Cancel</Button>
      <Button loading={saving === 'upheld'} disabled={!note.trim() || saving !== null} onClick={() => void decide('upheld')}>Uphold</Button>
      <Button intent="success" loading={saving === 'reversed'} disabled={!note.trim() || saving !== null} onClick={() => void decide('reversed')}>Reverse</Button>
    </>} />
  </Dialog>
}
