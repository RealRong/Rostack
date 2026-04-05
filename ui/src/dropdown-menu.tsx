import { useCallback, useState } from 'react'
import { Popover, type PopoverProps } from './popover'
import {
  Menu,
  type MenuItem,
  type MenuProps,
  type MenuSubmenuOpenPolicy
} from './menu'

export interface DropdownMenuProps extends Omit<PopoverProps, 'children'> {
  items: readonly MenuItem[]
  autoFocus?: boolean
  submenuOpenPolicy?: MenuSubmenuOpenPolicy
  menuScopeId?: MenuProps['scopeId']
}

export const DropdownMenu = (props: DropdownMenuProps) => {
  const {
    items,
    autoFocus,
    submenuOpenPolicy,
    menuScopeId,
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
      registerLayer={false}
      closeOnEscape={false}
    >
      <Menu
        items={items}
        open={open}
        onClose={() => setOpen(false)}
        autoFocus={autoFocus}
        scopeId={menuScopeId}
        submenuOpenPolicy={submenuOpenPolicy}
      />
    </Popover>
  )
}
