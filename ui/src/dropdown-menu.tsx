import { useCallback, useState } from 'react'
import { Popover, type PopoverProps } from './popover'
import {
  Menu,
  type MenuItem,
  type MenuSubmenuOpenPolicy
} from './menu'

export interface DropdownMenuProps extends Omit<PopoverProps, 'children'> {
  items: readonly MenuItem[]
  autoFocus?: boolean
  submenuOpenPolicy?: MenuSubmenuOpenPolicy
}

export const DropdownMenu = (props: DropdownMenuProps) => {
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
    >
      <Menu
        items={items}
        open={open}
        onClose={() => setOpen(false)}
        autoFocus={autoFocus}
        submenuOpenPolicy={submenuOpenPolicy}
      />
    </Popover>
  )
}
