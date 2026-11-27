import { useEffect, useState } from 'react'
import { Button, Card, Classes, H1, HTMLTable, NonIdealState, Tag } from '@blueprintjs/core'
import { z } from 'zod'
import { AdminAccessError, AdminRoleRequiredError, adminRequest } from './adminApi'
import { LoadingRows, LoadingStatus } from './LoadingState'

const message = z.object({
  id: z.uuid(), name: z.string().nullable(), email: z.string().nullable(), message: z.string(),
  handledAt: z.string().nullable(), handledByHandle: z.string().nullable(), createdAt: z.string(),
})
type ContactMessage = z.infer<typeof message>

export default function Contact({ onAccessLost }: { onAccessLost: () => void }) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ revision: number; messages?: ContactMessage[]; error?: string }>()
  const [busyId, setBusyId] = useState('')
  const [actionError, setActionError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    adminRequest('/api/admin/contact', controller.signal)
      .then(value => setState({ revision, messages: z.object({ messages: z.array(message) }).parse(value).messages }))
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setState({ revision, error: cause instanceof AdminRoleRequiredError ? 'Only admins can read contact messages.'
          : cause instanceof Error ? cause.message : 'Could not load messages.' })
      })
    return () => controller.abort()
  }, [revision, onAccessLost])
  const current = state?.revision === revision ? state : undefined

  async function change(item: ContactMessage, method: 'PATCH' | 'DELETE') {
    setBusyId(item.id)
    setActionError('')
    try {
      await adminRequest('/api/admin/contact/' + item.id, undefined, {
        method, ...(method === 'PATCH' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handled: !item.handledAt }) } : {}),
      })
      setRevision(value => value + 1)
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setActionError(cause instanceof Error ? cause.message : 'Could not save.')
    } finally {
      setBusyId('')
    }
  }

  return <section className="overview" aria-labelledby="contact-heading">
    <header className="overview-heading"><H1 id="contact-heading">Contact messages</H1></header>
    <p className={Classes.TEXT_MUTED}>
      Sent through the contact form on the imprint page. Answer them promptly: the form is the second way to reach us
      besides the email address. Handled messages are deleted after 3 months, unhandled ones after 12 months.
    </p>
    {actionError && <Card role="alert">{actionError}</Card>}
    {!current && <Card><LoadingStatus label="Loading messages…" /><LoadingRows rows={3} /></Card>}
    {current?.error && <Card><p role="alert">{current.error}</p></Card>}
    {current?.messages && (current.messages.length === 0 ? <NonIdealState icon="envelope" title="No messages" /> :
      <Card className="admin-panel"><div className="overview-table-scroll"><HTMLTable striped className="overview-table">
        <thead><tr><th>When</th><th>From</th><th>Message</th><th>Status</th><th /></tr></thead>
        <tbody>{current.messages.map(item => <tr key={item.id}>
          <td>{new Date(item.createdAt).toLocaleString()}</td>
          <td>{item.name ?? 'Anonymous'}<div className={Classes.TEXT_MUTED}>{item.email
            ? <a href={'mailto:' + item.email}>{item.email}</a> : 'no reply address'}</div></td>
          <td style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.message}</td>
          <td>{item.handledAt
            ? <Tag minimal intent="success">Handled{item.handledByHandle ? ' by @' + item.handledByHandle : ''}</Tag>
            : <Tag minimal intent="warning">Open</Tag>}</td>
          <td>
            <Button variant="minimal" icon={item.handledAt ? 'undo' : 'tick'} loading={busyId === item.id}
              onClick={() => void change(item, 'PATCH')}>{item.handledAt ? 'Reopen' : 'Mark handled'}</Button>
            <Button variant="minimal" icon="trash" intent="danger" disabled={busyId === item.id}
              onClick={() => void change(item, 'DELETE')}>Delete</Button>
          </td>
        </tr>)}</tbody>
      </HTMLTable></div></Card>)}
  </section>
}
