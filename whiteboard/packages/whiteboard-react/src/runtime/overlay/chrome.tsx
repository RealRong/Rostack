import {
  Popover,
  type PopoverProps
} from '@ui'
import {
  type HTMLAttributes,
} from 'react'

const WHITEBOARD_CHROME_FLOATING_PROPS: HTMLAttributes<HTMLDivElement> = {
  onContextMenu: (event) => {
    event.preventDefault()
    event.stopPropagation()
  }
}

export const WhiteboardPopover = (
  props: Omit<PopoverProps, 'floatingProps'>
) => (
  <Popover
    {...props}
    floatingProps={WHITEBOARD_CHROME_FLOATING_PROPS}
  />
)
