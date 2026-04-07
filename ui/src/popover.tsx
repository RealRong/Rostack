import {
  FloatingFocusManager,
  FloatingPortal,
  type ClientRectObject,
  type VirtualElement,
  autoUpdate,
  flip,
  offset as middlewareOffset,
  shift,
  size as middlewareSize,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useMergeRefs,
  useRole,
  useTransitionStyles,
  type Placement
} from '@floating-ui/react'
import {
  createContext,
  cloneElement,
  isValidElement,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref
} from 'react'
import {
  OVERLAY_LAYER_ATTR,
  OVERLAY_BLOCKING_ATTR,
  OVERLAY_BLOCKING_BACKDROP_ATTR,
  OverlayLayerProvider,
  useLayer,
  useOptionalOverlay,
  type OverlayBackdrop,
  type OverlayLayerKind,
  type OverlayLayerMode
} from './overlay'
import { cn } from './utils'

const POPOVER_TRANSITION_MS = 200

export type PopoverOffset = Parameters<typeof middlewareOffset>[0]
export type PopoverSurfaceSize = 'sm' | 'md' | 'lg' | 'xl'
export type PopoverSurfacePadding = 'none' | 'menu' | 'panel'

export type PopoverAnchorPoint = {
  x: number
  y: number
}

export type PopoverAnchorRect = {
  x: number
  y: number
  width: number
  height: number
}

export type PopoverAnchorReference = Pick<VirtualElement, 'getBoundingClientRect'>
  & Partial<Pick<VirtualElement, 'contextElement'>>

export type PopoverAnchor =
  | Element
  | PopoverAnchorPoint
  | PopoverAnchorRect
  | PopoverAnchorReference

const PopoverEnvironmentContext = createContext<{
  container?: Element | null
  floatingProps?: HTMLAttributes<HTMLDivElement>
  contentProps?: HTMLAttributes<HTMLDivElement>
} | null>(null)

const resolvePopoverPortalRoot = (container: Element | null | undefined) => (
  typeof HTMLElement !== 'undefined' && container instanceof HTMLElement
    ? container
    : undefined
)

const hasFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
)

const isElementAnchor = (value: unknown): value is Element => (
  typeof Element !== 'undefined'
  && value instanceof Element
)

const isReferenceAnchor = (value: unknown): value is PopoverAnchorReference => (
  Boolean(value)
  && typeof value === 'object'
  && !isElementAnchor(value)
  && typeof (value as PopoverAnchorReference).getBoundingClientRect === 'function'
)

const isRectAnchor = (value: unknown): value is PopoverAnchorRect => (
  Boolean(value)
  && typeof value === 'object'
  && hasFiniteNumber((value as PopoverAnchorRect).x)
  && hasFiniteNumber((value as PopoverAnchorRect).y)
  && hasFiniteNumber((value as PopoverAnchorRect).width)
  && hasFiniteNumber((value as PopoverAnchorRect).height)
)

const isPointAnchor = (value: unknown): value is PopoverAnchorPoint => (
  Boolean(value)
  && typeof value === 'object'
  && hasFiniteNumber((value as PopoverAnchorPoint).x)
  && hasFiniteNumber((value as PopoverAnchorPoint).y)
  && !hasFiniteNumber((value as PopoverAnchorRect).width)
  && !hasFiniteNumber((value as PopoverAnchorRect).height)
)

const toClientRectObject = (
  anchor: PopoverAnchorPoint | PopoverAnchorRect
): ClientRectObject => {
  const width = isRectAnchor(anchor)
    ? anchor.width
    : 0
  const height = isRectAnchor(anchor)
    ? anchor.height
    : 0

  return {
    x: anchor.x,
    y: anchor.y,
    top: anchor.y,
    left: anchor.x,
    right: anchor.x + width,
    bottom: anchor.y + height,
    width,
    height
  }
}

const resolveAnchorReference = (
  anchor: PopoverAnchor | undefined,
  contextElement: Element | null | undefined
): Element | PopoverAnchorReference | null => {
  if (!anchor) {
    return null
  }

  if (isElementAnchor(anchor) || isReferenceAnchor(anchor)) {
    return anchor
  }

  if (isRectAnchor(anchor) || isPointAnchor(anchor)) {
    return {
      contextElement: contextElement ?? undefined,
      getBoundingClientRect: () => toClientRectObject(anchor)
    }
  }

  return null
}

const callAll = (
  ...handlers: Array<((event: any) => void) | undefined>
) => (event: any) => {
  for (const handler of handlers) {
    handler?.(event)
  }
}

const getPopoverTransformOrigin = (placement: Placement): string => {
  const [side, align = 'center'] = placement.split('-') as [string, string?]

  if (side === 'top') {
    if (align === 'start') return '0% 100%'
    if (align === 'end') return '100% 100%'
    return '50% 100%'
  }

  if (side === 'right') {
    if (align === 'start') return '0% 0%'
    if (align === 'end') return '0% 100%'
    return '0% 50%'
  }

  if (side === 'left') {
    if (align === 'start') return '100% 0%'
    if (align === 'end') return '100% 100%'
    return '100% 50%'
  }

  if (align === 'start') return '0% 0%'
  if (align === 'end') return '100% 0%'
  return '50% 0%'
}

const POPOVER_SURFACE_SIZE_CLASS_NAMES: Record<PopoverSurfaceSize, string> = {
  sm: 'w-[180px]',
  md: 'w-[220px]',
  lg: 'w-[240px]',
  xl: 'w-[280px]'
}

const POPOVER_SURFACE_PADDING_CLASS_NAMES: Record<PopoverSurfacePadding, string> = {
  none: 'p-0',
  menu: 'p-1.5',
  panel: 'p-1.5'
}

const EXPLICIT_POPOVER_WIDTH_CLASS_PATTERN = /\b(?:w-|min-w-|max-w-)/

export const resolvePopoverSurfaceSizeClassName = (size: PopoverSurfaceSize) => (
  POPOVER_SURFACE_SIZE_CLASS_NAMES[size]
)

export const resolvePopoverSurfacePaddingClassName = (padding: PopoverSurfacePadding) => (
  POPOVER_SURFACE_PADDING_CLASS_NAMES[padding]
)

const hasExplicitPopoverWidthClassName = (className: string | undefined) => (
  Boolean(className && EXPLICIT_POPOVER_WIDTH_CLASS_PATTERN.test(className))
)

const toTriggerRef = (trigger: ReactElement): Ref<Element> | undefined => {
  const value = trigger as ReactElement & {
    ref?: Ref<Element>
  }
  return value.ref
}

const resolvePopoverMode = (props: {
  mode?: OverlayLayerMode
  modal?: boolean
  surface?: 'passive' | 'scoped' | 'blocking'
}): OverlayLayerMode => {
  if (props.mode) {
    return props.mode
  }

  if (props.surface === 'blocking') {
    return 'blocking'
  }

  if (props.modal) {
    return 'modal'
  }

  return 'floating'
}

export interface PopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  trigger?: ReactElement
  anchor?: PopoverAnchor
  children?: ReactNode
  placement?: Placement
  offset?: PopoverOffset
  modal?: boolean
  mode?: OverlayLayerMode
  kind?: OverlayLayerKind
  matchTriggerWidth?: boolean
  initialFocus?: number | MutableRefObject<HTMLElement | null>
  size?: PopoverSurfaceSize
  padding?: PopoverSurfacePadding
  className?: string
  contentClassName?: string
  closeOnInteractOutside?: boolean
  closeOnEscape?: boolean
  surface?: 'passive' | 'scoped' | 'blocking'
  backdrop?: OverlayBackdrop
  dismissOnBackdropPress?: boolean
  animated?: boolean
  container?: Element | null
  floatingProps?: HTMLAttributes<HTMLDivElement>
  contentProps?: HTMLAttributes<HTMLDivElement>
}

export const Popover = (props: PopoverProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(props.defaultOpen ?? false)
  const inheritedEnvironment = useContext(PopoverEnvironmentContext)
  const overlay = useOptionalOverlay()
  const open = props.open ?? uncontrolledOpen
  const mode = resolvePopoverMode(props)
  const backdrop = props.backdrop ?? (
    mode === 'blocking'
      ? 'transparent'
      : 'none'
  )
  const container = props.container === undefined
    ? (inheritedEnvironment?.container ?? overlay?.portalRoot ?? null)
    : props.container
  const floatingProps = props.floatingProps ?? inheritedEnvironment?.floatingProps
  const contentProps = props.contentProps ?? inheritedEnvironment?.contentProps
  const portalRoot = resolvePopoverPortalRoot(container)
  const setOpen = useCallback((nextOpen: boolean) => {
    if (props.open === undefined) {
      setUncontrolledOpen(nextOpen)
    }

    props.onOpenChange?.(nextOpen)
  }, [props.onOpenChange, props.open])
  const layer = useLayer({
    open,
    kind: props.kind ?? 'popover',
    portalRoot: container,
    mode,
    closeOnEscape: props.closeOnEscape ?? true,
    closeOnOutside: props.closeOnInteractOutside ?? true,
    closeOnBackdrop: props.dismissOnBackdropPress ?? true,
    backdrop,
    onClose: () => setOpen(false)
  })

  const middleware = useMemo(() => {
    const items = [
      middlewareOffset(props.offset ?? 8),
      flip({
        padding: 8
      }),
      shift({
        padding: 8
      })
    ]

    if (props.matchTriggerWidth) {
      items.push(middlewareSize({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            width: `${Math.round(rects.reference.width)}px`
          })
        }
      }))
    }

    return items
  }, [props.matchTriggerWidth, props.offset])

  const floating = useFloating({
    open,
    onOpenChange: setOpen,
    placement: props.placement ?? 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware
  })
  const anchorReference = useMemo(
    () => resolveAnchorReference(props.anchor, container),
    [container, props.anchor]
  )
  const setReference = useCallback((node: Element | null) => {
    floating.refs.setReference(node)
    if (!anchorReference) {
      floating.refs.setPositionReference(node)
    }
  }, [anchorReference, floating.refs])

  useLayoutEffect(() => {
    if (!anchorReference) {
      return
    }

    floating.refs.setPositionReference(anchorReference)
  }, [anchorReference, floating.refs])

  useLayoutEffect(() => {
    if (!open || !isElementAnchor(anchorReference)) {
      return
    }

    const element = anchorReference
    const previous = element.getAttribute(OVERLAY_LAYER_ATTR)
    element.setAttribute(OVERLAY_LAYER_ATTR, layer.id)

    return () => {
      if (previous === null) {
        element.removeAttribute(OVERLAY_LAYER_ATTR)
        return
      }

      element.setAttribute(OVERLAY_LAYER_ATTR, previous)
    }
  }, [anchorReference, layer.id, open])

  const click = useClick(floating.context, {
    enabled: Boolean(props.trigger)
  })
  const dismiss = useDismiss(floating.context, {
    outsidePress: overlay
      ? false
      : (props.closeOnInteractOutside ?? true),
    escapeKey: overlay
      ? false
      : (props.closeOnEscape ?? true)
  })
  const role = useRole(floating.context, {
    role: 'dialog'
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role
  ])

  if (!props.trigger && !props.anchor) {
    throw new Error('Popover requires either a trigger or an anchor.')
  }

  const trigger = (() => {
    if (!props.trigger) {
      return null
    }

    if (!isValidElement(props.trigger)) {
      throw new Error('Popover trigger must be a valid React element.')
    }

    const triggerRef = toTriggerRef(props.trigger)
    const referenceRef = useMergeRefs([
      setReference,
      triggerRef
    ])
    const triggerProps = props.trigger.props as Record<string, unknown>

    return cloneElement(
      props.trigger,
      getReferenceProps({
        ...triggerProps,
        ...(open
          ? { [OVERLAY_LAYER_ATTR]: layer.id }
          : {}),
        ref: referenceRef
      })
    )
  })()

  const [side, align = 'center'] = floating.placement.split('-') as [string, string?]
  const transition = useTransitionStyles(floating.context, {
    duration: POPOVER_TRANSITION_MS,
    initial: ({ placement }) => ({
      opacity: 0,
      pointerEvents: 'none',
      transform: 'scaleX(0.96) scaleY(0.96)',
      transformOrigin: getPopoverTransformOrigin(placement)
    }),
    open: ({ placement }) => ({
      opacity: 1,
      pointerEvents: 'auto',
      transform: 'scaleX(1) scaleY(1)',
      transformOrigin: getPopoverTransformOrigin(placement)
    }),
    close: ({ placement }) => ({
      opacity: 0,
      pointerEvents: 'none',
      transform: 'scaleX(0.96) scaleY(0.96)',
      transformOrigin: getPopoverTransformOrigin(placement)
    })
  })
  const visible = props.animated === false ? open : transition.isMounted
  const transitionStyles = props.animated === false ? undefined : transition.styles
  const hasExplicitWidthClassName = hasExplicitPopoverWidthClassName(
    cn(contentProps?.className, props.contentClassName)
  )
  const surfaceSizeClassName = props.size
    ? resolvePopoverSurfaceSizeClassName(props.size)
    : hasExplicitWidthClassName
      ? undefined
      : 'min-w-[280px]'
  const surfacePaddingClassName = resolvePopoverSurfacePaddingClassName(props.padding ?? 'none')
  const localBackdropVisible = !overlay
    && mode === 'blocking'
    && backdrop !== 'none'

  const dismissLocalBackdrop = (
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (props.dismissOnBackdropPress ?? true) {
      setOpen(false)
    }
  }

  const floatingContent = (
    <div
      ref={floating.refs.setFloating}
      {...floatingProps}
      style={{
        ...floatingProps?.style,
        ...floating.floatingStyles
      }}
      className={cn('z-50', floatingProps?.className, props.className)}
      {...{
        [OVERLAY_LAYER_ATTR]: layer.id
      }}
      {...(mode === 'blocking'
        ? { [OVERLAY_BLOCKING_ATTR]: '' }
        : {})}
      aria-hidden={!open}
      {...getFloatingProps({
        onPointerDown: event => {
          callAll(
            floatingProps?.onPointerDown,
            () => {
              event.stopPropagation()
            }
          )(event)
        },
        onMouseDown: event => {
          callAll(
            floatingProps?.onMouseDown,
            () => {
              event.stopPropagation()
            }
          )(event)
        },
        onClick: event => {
          callAll(
            floatingProps?.onClick,
            () => {
              event.stopPropagation()
            }
          )(event)
        }
      })}
    >
      <div
        {...contentProps}
        data-align={align}
        data-side={side}
        style={{
          ...contentProps?.style,
          ...transitionStyles
        }}
        className={cn(
          'rounded-xl bg-floating text-fg shadow-popover transition-[opacity,transform] duration-200 ease-out will-change-[opacity,transform]',
          contentProps?.className,
          props.contentClassName,
          surfaceSizeClassName,
          surfacePaddingClassName
        )}
      >
        <OverlayLayerProvider layerId={layer.id}>
          <PopoverEnvironmentContext.Provider value={{
            container,
            floatingProps,
            contentProps
          }}>
            {props.children}
          </PopoverEnvironmentContext.Provider>
        </OverlayLayerProvider>
      </div>
    </div>
  )

  return (
    <>
      {trigger}
      {visible ? (
        <FloatingPortal root={portalRoot}>
          {props.initialFocus ? <FloatingFocusManager
            context={floating.context}
            modal={mode !== 'floating'}
            initialFocus={props.initialFocus ?? 0}
            disabled={!open}
          >
            <>
              {localBackdropVisible ? (
                <div
                  aria-hidden="true"
                  className={cn(
                    'fixed inset-0 z-40',
                    backdrop === 'dim' ? 'bg-overlay' : 'bg-transparent'
                  )}
                  {...{
                    [OVERLAY_BLOCKING_ATTR]: '',
                    [OVERLAY_BLOCKING_BACKDROP_ATTR]: ''
                  }}
                  onPointerDown={dismissLocalBackdrop}
                  onMouseDown={dismissLocalBackdrop}
                  onContextMenu={event => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={event => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                />
              ) : null}
              {floatingContent}
            </>
          </FloatingFocusManager> : <>
            {localBackdropVisible ? (
              <div
                aria-hidden="true"
                className={cn(
                  'fixed inset-0 z-40',
                  backdrop === 'dim' ? 'bg-overlay' : 'bg-transparent'
                )}
                {...{
                  [OVERLAY_BLOCKING_ATTR]: '',
                  [OVERLAY_BLOCKING_BACKDROP_ATTR]: ''
                }}
                onPointerDown={dismissLocalBackdrop}
                onMouseDown={dismissLocalBackdrop}
                onContextMenu={event => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={event => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
              />
            ) : null}
            {floatingContent}
          </>}
        </FloatingPortal>
      ) : null}
    </>
  )
}
