import { useCallback, useState } from 'react'
import { Popover } from '../popover'
import { Base } from './base'
import type { DropdownProps } from './types'

export const Dropdown = (props: DropdownProps) => {
  const {
    items,
    autoFocus,
    submenuOpenPolicy,
    open: controlledOpen,
    onOpenChange,
    defaultOpen,
    ...popoverProps
  } = props
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = useCallback((nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen)
    }

    onOpenChange?.(nextOpen)
  }, [controlledOpen, onOpenChange])

  return (
    <Popover
      {...popoverProps}
      open={open}
      onOpenChange={setOpen}
      defaultOpen={undefined}
      kind="menu"
      padding="menu"
    >
      <Base
        items={items}
        open={open}
        onClose={() => setOpen(false)}
        autoFocus={autoFocus}
        submenuOpenPolicy={submenuOpenPolicy}
      />
    </Popover>
  )
}

