import { useCallback, useState } from 'react'
import { Popover } from '#ui/popover.tsx'
import { Base } from '#ui/menu/base.tsx'
import type { DropdownProps } from '#ui/menu/types.ts'

export const Dropdown = (props: DropdownProps) => {
  const {
    items,
    autoFocus,
    selectionAppearance,
    submenuOpenPolicy,
    open: controlledOpen,
    onOpenChange,
    defaultOpen,
    trigger,
    initialFocus,
    size,
    className,
    contentClassName,
    floatingProps,
    contentProps,
    ...rootProps
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
      {...rootProps}
      open={open}
      onOpenChange={setOpen}
      defaultOpen={undefined}
      kind="menu"
    >
      <Popover.Trigger>
        {trigger}
      </Popover.Trigger>
      <Popover.Content
        initialFocus={initialFocus}
        size={size}
        className={className}
        contentClassName={contentClassName}
        floatingProps={floatingProps}
        contentProps={contentProps}
        padding="menu"
      >
        <Base
          items={items}
          open={open}
          onClose={() => setOpen(false)}
          autoFocus={autoFocus}
          selectionAppearance={selectionAppearance}
          submenuOpenPolicy={submenuOpenPolicy}
        />
      </Popover.Content>
    </Popover>
  )
}
