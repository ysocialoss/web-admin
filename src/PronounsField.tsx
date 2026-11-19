import { useEffect, useId, useState } from 'react'
import { FormGroup, InputGroup } from '@blueprintjs/core'
import { loadPronounRecommendations } from './adminApi'

export function PronounsField({ value, disabled, onChange }: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [options, setOptions] = useState<Awaited<ReturnType<typeof loadPronounRecommendations>>>()
  const [expanded, setExpanded] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const id = useId()

  useEffect(() => {
    const controller = new AbortController()
    void loadPronounRecommendations(controller.signal).then(
      setOptions,
      () => {}, // The custom text field works without the catalog.
    )
    return () => controller.abort()
  }, [])

  const locale = new Intl.Locale(navigator.language || 'en')
  const script = locale.script ? `${locale.language}-${locale.script}` : locale.language
  const preferred = [
    ...(options?.languages[script] ?? options?.languages[locale.language] ?? []),
    ...(options?.general ?? []),
  ]
  const query = value.trim().toLocaleLowerCase()
  const suggestions = query
    ? [...new Set([...preferred, ...Object.values(options?.languages ?? {}).flat()])]
    : preferred
  const matches = suggestions.filter(suggestion => suggestion.toLocaleLowerCase().includes(query)).slice(0, 12)
  const open = expanded && !disabled && matches.length > 0
  const listId = `${id}-suggestions`

  function close() {
    setExpanded(false)
    setHighlighted(-1)
  }

  function choose(suggestion: string) {
    onChange(suggestion)
    close()
  }

  return <FormGroup label="Pronouns" labelFor={id}
    helperText={<span id={`${id}-hint`}>Shown on the public profile. Leave blank to clear.</span>}>
    <div className="admin-pronouns-input">
      <InputGroup id={id} role="combobox" aria-autocomplete="list" aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
        aria-describedby={`${id}-hint`}
        autoComplete="off" dir="auto" value={value} disabled={disabled} maxLength={options?.maxLength ?? 80}
        onClick={() => setExpanded(true)} onBlur={close}
        onChange={event => {
          onChange(event.currentTarget.value)
          setExpanded(true)
          setHighlighted(-1)
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length > 0) {
            event.preventDefault()
            setExpanded(true)
            const next = event.key === 'ArrowDown'
              ? (highlighted + 1) % matches.length
              : highlighted <= 0 ? matches.length - 1 : highlighted - 1
            setHighlighted(next)
            document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' })
          } else if (open && event.key === 'Enter' && highlighted >= 0) {
            event.preventDefault()
            choose(matches[highlighted])
          } else if (open && event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            close()
          }
        }} />
      {open && <div id={listId} className="admin-pronoun-suggestions" role="listbox" aria-label="Pronoun suggestions">
        {matches.map((suggestion, index) => <div key={suggestion} id={`${listId}-${index}`} role="option"
          aria-selected={highlighted === index} onPointerMove={() => setHighlighted(index)}
          onMouseDown={event => event.preventDefault()}
          onClick={() => choose(suggestion)}><bdi>{suggestion}</bdi></div>)}
      </div>}
    </div>
  </FormGroup>
}
