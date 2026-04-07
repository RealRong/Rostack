import type { ReactElement } from 'react'
import { Popover } from '@ui/popover'
import type { MenuItem } from '@ui/menu'
import { OptionEditorPanel } from './OptionEditorPanel'

export interface OptionLike {
  id: string
  name: string
  color?: string
}

export interface OptionEditorPopoverProps {
  option: OptionLike
  open: boolean
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => boolean | void
  onColorChange: (color: string) => void
  onDelete?: () => void
  extraItems?: readonly MenuItem[]
  trigger: ReactElement
}

export const OptionEditorPopover = (props: OptionEditorPopoverProps) => {
  return (
    <Popover
      open={props.open}
      onOpenChange={props.onOpenChange}
      trigger={props.trigger}
      placement="bottom-start"
      offset={10}
      initialFocus={-1}
      size="md"
      padding="panel"
    >
      <OptionEditorPanel
        option={props.option}
        onRename={props.onRename}
        onColorChange={props.onColorChange}
        onDelete={props.onDelete}
        extraItems={props.extraItems}
        onRequestClose={() => props.onOpenChange(false)}
      />
    </Popover>
  )
}
