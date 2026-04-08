import type { ReactElement } from 'react'
import {
  Popover,
  type PopoverOffset
} from '@ui/popover'
import type { Placement } from '@floating-ui/react'
import { OptionEditorPanel } from './OptionEditorPanel'

export interface OptionLike {
  id: string
  name: string
  color?: string
}

export interface OptionEditorPopoverProps {
  fieldId: string
  option: OptionLike
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
  placement?: Placement
  offset?: PopoverOffset
  trigger: ReactElement
}

export const OptionEditorPopover = (props: OptionEditorPopoverProps) => {
  return (
    <Popover
      open={props.open}
      onOpenChange={props.onOpenChange}
      placement={props.placement ?? 'right'}
      offset={props.offset ?? 10}
    >
      <Popover.Trigger>
        {props.trigger}
      </Popover.Trigger>
      <Popover.Content
        initialFocus={-1}
        size="md"
        padding="panel"
      >
        <OptionEditorPanel
          fieldId={props.fieldId}
          option={props.option}
          onDeleted={props.onDeleted}
          onRequestClose={() => props.onOpenChange(false)}
        />
      </Popover.Content>
    </Popover>
  )
}
