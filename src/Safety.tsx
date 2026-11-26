import { useEffect, useState } from 'react'
import { Button, Callout, Card, Classes, Dialog, DialogBody, DialogFooter, FormGroup, H1, HTMLTable, InputGroup, NonIdealState, Switch, Tag, TextArea } from '@blueprintjs/core'
import { z } from 'zod'
import { AdminAccessError, AdminRoleRequiredError, adminRequest } from './adminApi'
import { LoadingRows, LoadingStatus } from './LoadingState'

const incident = z.object({
  id: z.uuid(), userId: z.string().nullable(), handle: z.string(), surface: z.string(), provider: z.string(), matchId: z.string().nullable(),
  sha256: z.string(), mime: z.string(), size: z.number(), ip: z.string().nullable(), hold: z.boolean(),
  reportedBkaAt: z.string().nullable(), bkaRef: z.string().nullable(), reportedNcmecAt: z.string().nullable(), ncmecRef: z.string().nullable(),
  note: z.string().nullable(), createdAt: z.string(),
})
type Incident = z.infer<typeof incident>

export default function Safety({ onAccessLost }: { onAccessLost: () => void }) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ revision: number; incidents?: Incident[]; error?: string }>()
  const [editing, setEditing] = useState<Incident | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    adminRequest('/api/admin/safety/incidents', controller.signal)
      .then(value => setState({ revision, incidents: z.object({ incidents: z.array(incident) }).parse(value).incidents }))
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof AdminAccessError) onAccessLost()
        else setState({ revision, error: cause instanceof AdminRoleRequiredError ? 'Only admins can see safety incidents.'
          : cause instanceof Error ? cause.message : 'Could not load incidents.' })
      })
    return () => controller.abort()
  }, [revision, onAccessLost])
  const current = state?.revision === revision ? state : undefined
  return <section className="overview" aria-labelledby="safety-heading">
    <header className="overview-heading"><H1 id="safety-heading">Safety incidents</H1></header>
    <Callout intent="danger" icon="shield" className="admin-notice">
      Matches with known child sexual abuse material. No images are stored or shown here. Report every incident to the BKA
      (and to NCMEC if the PhotoDNA terms require it), record the reference, and follow the CSAM procedure in the compliance repo.
    </Callout>
    {!current && <Card><LoadingStatus label="Loading incidents…" /><LoadingRows rows={3} /></Card>}
    {current?.error && <Card><p role="alert">{current.error}</p></Card>}
    {current?.incidents && (current.incidents.length === 0 ? <NonIdealState icon="shield" title="No incidents" /> :
      <Card className="admin-panel"><div className="overview-table-scroll"><HTMLTable striped className="overview-table">
        <thead><tr><th>When</th><th>Account</th><th>Where</th><th>Match</th><th>Reported</th><th>Hold</th><th /></tr></thead>
        <tbody>{current.incidents.map(item => <tr key={item.id}>
          <td>{new Date(item.createdAt).toLocaleString()}</td>
          <td>@{item.handle || 'unknown'}<div className={Classes.TEXT_MUTED}>{item.ip ?? 'no IP'}</div></td>
          <td>{item.surface}<div className={Classes.TEXT_MUTED}>{item.mime}, {item.size} bytes</div></td>
          <td>{item.provider}{item.matchId && <div className={Classes.TEXT_MUTED}>{item.matchId}</div>}<div className={Classes.TEXT_MUTED}><code>{item.sha256.slice(0, 16)}…</code></div></td>
          <td>{item.bkaRef ? <Tag minimal intent="success">BKA {item.bkaRef}</Tag> : <Tag minimal intent="danger">BKA pending</Tag>}
            {item.ncmecRef && <> <Tag minimal>NCMEC {item.ncmecRef}</Tag></>}</td>
          <td>{item.hold ? 'Yes' : 'No'}</td>
          <td><Button variant="minimal" icon="edit" onClick={() => setEditing(item)}>Update</Button></td>
        </tr>)}</tbody>
      </HTMLTable></div></Card>)}
    {editing && <IncidentDialog incident={editing} onClose={() => setEditing(null)} onAccessLost={onAccessLost}
      onDone={() => { setEditing(null); setRevision(value => value + 1) }} />}
  </section>
}

function IncidentDialog({ incident, onClose, onDone, onAccessLost }: {
  incident: Incident; onClose: () => void; onDone: () => void; onAccessLost: () => void
}) {
  const [bkaRef, setBkaRef] = useState(incident.bkaRef ?? '')
  const [ncmecRef, setNcmecRef] = useState(incident.ncmecRef ?? '')
  const [hold, setHold] = useState(incident.hold)
  const [note, setNote] = useState(incident.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setSaving(true)
    setError('')
    try {
      await adminRequest('/api/admin/safety/incidents/' + incident.id, undefined, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hold, note, ...(bkaRef.trim() ? { bkaRef: bkaRef.trim() } : {}), ...(ncmecRef.trim() ? { ncmecRef: ncmecRef.trim() } : {}) }),
      })
      onDone()
    } catch (cause) {
      if (cause instanceof AdminAccessError) onAccessLost()
      else setError(cause instanceof Error ? cause.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }
  return <Dialog isOpen onClose={onClose} title="Update incident" icon="shield">
    <DialogBody>
      <FormGroup label="BKA or police reference" labelFor="bka-ref"><InputGroup id="bka-ref" value={bkaRef} maxLength={200} onChange={event => setBkaRef(event.currentTarget.value)} /></FormGroup>
      <FormGroup label="NCMEC report ID" labelFor="ncmec-ref"><InputGroup id="ncmec-ref" value={ncmecRef} maxLength={200} onChange={event => setNcmecRef(event.currentTarget.value)} /></FormGroup>
      <Switch checked={hold} label="Keep past the 12 month retention (open case)" onChange={event => setHold(event.currentTarget.checked)} />
      <FormGroup label="Internal note" labelFor="incident-note"><TextArea id="incident-note" fill rows={3} maxLength={2000} value={note} onChange={event => setNote(event.currentTarget.value)} /></FormGroup>
      {error && <Callout intent="danger" role="alert">{error}</Callout>}
    </DialogBody>
    <DialogFooter actions={<>
      <Button onClick={onClose} disabled={saving}>Cancel</Button>
      <Button intent="primary" loading={saving} onClick={() => void save()}>Save</Button>
    </>} />
  </Dialog>
}
