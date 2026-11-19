import type { ReactNode } from 'react'
import { Button, ContextMenu, Menu, MenuItem } from '@blueprintjs/core'
import type { IconName } from '@blueprintjs/icons'

export interface ContentAction {
  label: string
  icon: IconName
  intent?: 'danger'
  run: () => void
}

export default function ContentMenu({ label, children, actions, onActivate }: {
  label: string
  children: ReactNode
  actions: ContentAction[]
  onActivate?: () => void
}) {
  return (
    <ContextMenu content={
      <Menu aria-label={`${label} actions`}>
        {actions.map((action) => (
          <MenuItem key={action.label} icon={action.icon} text={action.label} intent={action.intent} onClick={action.run} />
        ))}
      </Menu>
    }>
      {({ className, ref, onContextMenu, popover, contentProps }) => (
        <>
          <Button
            ref={ref}
            className={className}
            variant="minimal"
            alignText="left"
            aria-label={onActivate ? label : `${label} actions`}
            aria-haspopup="menu"
            aria-expanded={contentProps.isOpen}
            onContextMenu={onContextMenu}
            onKeyDown={(event) => {
              if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
              event.preventDefault()
              const bounds = event.currentTarget.getBoundingClientRect()
              event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true, cancelable: true, clientX: bounds.left, clientY: bounds.bottom,
              }))
            }}
            onClick={(event) => {
              if (onActivate) {
                onActivate()
              } else if (event.detail === 0) {
                const bounds = event.currentTarget.getBoundingClientRect()
                event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
                  bubbles: true, cancelable: true, clientX: bounds.left, clientY: bounds.bottom,
                }))
              } else {
                onContextMenu(event)
              }
            }}
          >
            {children}
          </Button>
          {popover}
        </>
      )}
    </ContextMenu>
  )
}
