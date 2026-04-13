import {
  Popover,
  type PopoverContentProps,
  type PopoverProps
} from '@shared/ui'

export interface WhiteboardPopoverProps extends Omit<PopoverProps, 'children'> {
  children?: PopoverContentProps['children']
  className?: PopoverContentProps['className']
  contentClassName?: PopoverContentProps['contentClassName']
  contentProps?: PopoverContentProps['contentProps']
  floatingProps?: PopoverContentProps['floatingProps']
  initialFocus?: PopoverContentProps['initialFocus']
  padding?: PopoverContentProps['padding']
  size?: PopoverContentProps['size']
}

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
          onPointerDownCapture: event => {
            floatingProps?.onPointerDownCapture?.(event)
            if (!event.defaultPrevented) {
              event.stopPropagation()
            }
          },
          onContextMenu: event => {
            floatingProps?.onContextMenu?.(event)
            if (!event.defaultPrevented) {
              event.stopPropagation()
            }
          }
        }}
      >
        {children}
      </Popover.Content>
    </Popover>
  )
}
