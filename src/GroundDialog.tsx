import { useEffect, useState } from 'react'
import { Button, Dialog, DialogBody, DialogFooter, FormGroup, HTMLSelect, Radio, RadioGroup, TextArea } from '@blueprintjs/core'
import { emptyGround, groundReady, legalCategories, onGroundRequest, termsClauses, type Ground } from './ground'

export function GroundFields({ value, onChange }: { value: Ground; onChange: (ground: Ground) => void }) {
  return (
    <>
      <FormGroup label="Ground" helperText="Shown to the user in the statement of reasons (Art. 17 DSA).">
        <RadioGroup inline selectedValue={value.type}
          onChange={(event) => onChange({ type: event.currentTarget.value as Ground['type'], ref: '', facts: value.facts })}>
          <Radio label="Terms of use" value="terms" />
          <Radio label="Illegal content" value="illegal" />
        </RadioGroup>
        <HTMLSelect fill value={value.ref} onChange={(event) => onChange({ ...value, ref: event.currentTarget.value })}>
          <option value="">Choose…</option>
          {(value.type === 'terms' ? termsClauses.map((clause) => ({ id: clause.id, title: `${clause.id} ${clause.title}` })) : legalCategories)
            .map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
        </HTMLSelect>
      </FormGroup>
      <FormGroup label="Facts" helperText="What the content or account did, in plain words. The user reads this.">
        <TextArea fill rows={3} maxLength={2000} value={value.facts} onChange={(event) => onChange({ ...value, facts: event.currentTarget.value })} />
      </FormGroup>
    </>
  )
}

export default function GroundDialogHost() {
  const [pending, setPending] = useState<{ title: string; suggested?: string; resolve: (ground: Ground | null) => void } | null>(null)
  const [ground, setGround] = useState<Ground>(emptyGround)
  useEffect(() => {
    onGroundRequest((next) => {
      setGround({ ...emptyGround, ref: next?.suggested ?? '' })
      setPending(next)
    })
    return () => onGroundRequest(null)
  }, [])
  function close(result: Ground | null) {
    pending?.resolve(result)
    setPending(null)
  }
  return (
    <Dialog isOpen={pending !== null} title={pending?.title ?? ''} onClose={() => close(null)}>
      <DialogBody>
        <GroundFields value={ground} onChange={setGround} />
      </DialogBody>
      <DialogFooter actions={<>
        <Button onClick={() => close(null)}>Cancel</Button>
        <Button intent="danger" disabled={!groundReady(ground)} onClick={() => close({ ...ground, facts: ground.facts.trim() })}>Confirm</Button>
      </>} />
    </Dialog>
  )
}
