import {
  Popover,
  type PopoverContentProps,
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

export interface WhiteboardPopoverProps extends Omit<PopoverProps, 'children'>, Pick<
PopoverContentProps,
  | 'children'
  | 'className'
  | 'contentClassName'
  | 'contentProps'
  | 'floatingProps'
  | 'initialFocus'
  | 'padding'
  | 'size'
> {}

export const WhiteboardPopover = (
  props: WhiteboardPopoverProps
) => {
  const {
    children,
    className,
    contentClassName,
    contentProps,
    floatingProps,
    initialFocus,
    padding,
    size,
    ...rootProps
  } = props

  return (
    <Popover {...rootProps}>
      <Popover.Content
        initialFocus={initialFocus}
        size={size}
        padding={padding}
        className={className}
        contentClassName={contentClassName}
        contentProps={contentProps}
        floatingProps={{
          ...floatingProps,
          onContextMenu: event => {
            floatingProps?.onContextMenu?.(event)
            WHITEBOARD_CHROME_FLOATING_PROPS.onContextMenu?.(event)
          }
        }}
      >
        {children}
      </Popover.Content>
    </Popover>
  )
}
