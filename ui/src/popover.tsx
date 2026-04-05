import {
  FloatingFocusManager,
  FloatingPortal,
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
  BLOCKING_SURFACE_ATTR,
  BLOCKING_SURFACE_BACKDROP_ATTR
} from './blocking-surface'
import {
  createContext,
  cloneElement,
  isValidElement,
  useContext,
  useCallback,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref
} from 'react'
import {
  useBlockingSurface,
  useBlockingSurfaceController
} from './blocking-surface'
import {
  OverlayLayerProvider,
  useLayer,
  useOptionalOverlay,
  useOverlayKey,
  useOverlayPointer
} from './overlay'
import { closestTarget } from './dom'
import { cn } from './utils'

const POPOVER_TRANSITION_MS = 200
const POPOVER_SCOPE_ATTR = 'data-popover-scope-id'

export type PopoverOffset = Parameters<typeof middlewareOffset>[0]

const PopoverScopeContext = createContext<string | undefined>(undefined)
const PopoverContainerContext = createContext<Element | null | undefined>(undefined)

const resolvePopoverPortalRoot = (container: Element | null | undefined) => (
  typeof HTMLElement !== 'undefined' && container instanceof HTMLElement
    ? container
    : undefined
)

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

const toTriggerRef = (trigger: ReactElement): Ref<Element> | undefined => {
  const value = trigger as ReactElement & {
    ref?: Ref<Element>
  }
  return value.ref
}

export interface PopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  trigger: ReactElement
  children?: ReactNode
  placement?: Placement
  offset?: PopoverOffset
  modal?: boolean
  matchTriggerWidth?: boolean
  initialFocus?: number | MutableRefObject<HTMLElement | null>
  className?: string
  contentClassName?: string
  closeOnInteractOutside?: boolean
  closeOnEscape?: boolean
  surface?: 'passive' | 'scoped' | 'blocking'
  backdrop?: 'none' | 'transparent' | 'dim'
  dismissOnBackdropPress?: boolean
  animated?: boolean
  scopeId?: string
  container?: Element | null
  registerLayer?: boolean
}

export const PopoverScope = (props: {
  id: string
  children?: ReactNode
}) => (
  <PopoverScopeContext.Provider value={props.id}>
    {props.children}
  </PopoverScopeContext.Provider>
)

export const PopoverContainerProvider = (props: {
  container?: Element | null
  children?: ReactNode
}) => (
  <PopoverContainerContext.Provider value={props.container}>
    {props.children}
  </PopoverContainerContext.Provider>
)

export const Popover = (props: PopoverProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(props.defaultOpen ?? false)
  const inheritedScopeId = useContext(PopoverScopeContext)
  const inheritedContainer = useContext(PopoverContainerContext)
  const blockingSurfaceController = useBlockingSurfaceController()
  const overlay = useOptionalOverlay()
  const registerLayer = props.registerLayer !== false
  const scopeId = props.scopeId ?? inheritedScopeId
  const container = props.container === undefined
    ? inheritedContainer
    : props.container
  const portalRoot = resolvePopoverPortalRoot(container)
  const open = props.open ?? uncontrolledOpen
  const surface = props.surface ?? 'passive'
  const backdrop = props.backdrop ?? 'none'
  const setOpen = useCallback((nextOpen: boolean) => {
    if (props.open === undefined) {
      setUncontrolledOpen(nextOpen)
    }

    props.onOpenChange?.(nextOpen)
  }, [props.onOpenChange, props.open])
  const dismissBlockingSurface = useCallback(() => {
    setOpen(false)
  }, [setOpen])
  const layer = useLayer({
    open: open && registerLayer,
    kind: 'popover',
    modal: props.modal,
    blocking: surface === 'blocking',
    onClose: () => setOpen(false)
  })

  useBlockingSurface({
    open: open && surface === 'blocking' && Boolean(blockingSurfaceController),
    source: 'popover',
    backdrop: backdrop === 'dim' ? 'dim' : 'transparent',
    dismissOnBackdropPress: props.dismissOnBackdropPress ?? true,
    onDismiss: dismissBlockingSurface
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

  const click = useClick(floating.context)
  const dismiss = useDismiss(floating.context, {
    outsidePress: overlay && registerLayer
      ? false
      : props.closeOnInteractOutside === false
        ? false
        : event => {
            if (
              scopeId
              && closestTarget(event.target, `[${POPOVER_SCOPE_ATTR}="${scopeId}"]`)
            ) {
              return false
            }

            return true
          },
    escapeKey: overlay && registerLayer
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

  if (!isValidElement(props.trigger)) {
    throw new Error('Popover trigger must be a valid React element.')
  }

  const triggerRef = toTriggerRef(props.trigger)
  const referenceRef = useMergeRefs([
    floating.refs.setReference,
    triggerRef
  ])
  const triggerProps = props.trigger.props as Record<string, unknown>
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

  const trigger = cloneElement(
    props.trigger,
    getReferenceProps({
      ...triggerProps,
      ...(scopeId
        ? { [POPOVER_SCOPE_ATTR]: scopeId }
        : {}),
      ref: referenceRef
    })
  )

  useOverlayKey({
    layerId: layer.id,
    when: () => (
      Boolean(overlay)
      && registerLayer
      && open
      && props.closeOnEscape !== false
      && layer.isTop()
    ),
    onKeyDown: event => {
      if (event.defaultPrevented || event.isComposing || event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      layer.close('escape')
      return true
    }
  })

  useOverlayPointer({
    layerId: layer.id,
    when: () => (
      Boolean(overlay)
      && registerLayer
      && open
      && props.closeOnInteractOutside !== false
      && layer.isTop()
    ),
    onPointerDown: event => {
      const target = event.target instanceof Element
        ? event.target
        : null
      if (!target) {
        return
      }

      if (
        scopeId
        && closestTarget(target, `[${POPOVER_SCOPE_ATTR}="${scopeId}"]`)
      ) {
        return
      }

      const referenceElement = floating.refs.reference.current
      const floatingElement = floating.refs.floating.current
      if (
        floatingElement instanceof Element
        && floatingElement.contains(target)
      ) {
        return
      }

      if (
        referenceElement instanceof Element
        && referenceElement.contains(target)
      ) {
        return
      }

      layer.close('outside')
    }
  })

  const floatingContent = (
    <div
      ref={floating.refs.setFloating}
      style={floating.floatingStyles}
      className={cn('z-50', props.className)}
      data-popover-scope-id={scopeId}
      {...(surface === 'blocking'
        ? { [BLOCKING_SURFACE_ATTR]: '' }
        : {})}
      aria-hidden={!open}
      {...getFloatingProps({
        onPointerDown: event => {
          event.stopPropagation()
        },
        onMouseDown: event => {
          event.stopPropagation()
        },
        onClick: event => {
          event.stopPropagation()
        }
      })}
    >
      <div
        data-align={align}
        data-side={side}
        data-popover-scope-id={scopeId}
        style={{
          ...transitionStyles
        }}
        className={cn(
          'min-w-[280px] rounded-xl bg-floating p-4 text-fg shadow-popover transition-[opacity,transform] duration-200 ease-out will-change-[opacity,transform]',
          props.contentClassName
        )}
      >
        {registerLayer ? (
          <OverlayLayerProvider layerId={layer.id}>
            {props.children}
          </OverlayLayerProvider>
        ) : props.children}
      </div>
    </div>
  )

  const dismissBackdrop = (
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (props.dismissOnBackdropPress ?? true) {
      if (overlay && registerLayer) {
        layer.close('backdrop')
        return
      }

      setOpen(false)
    }
  }

  const renderLocalBackdrop = surface === 'blocking'
    && !blockingSurfaceController
    && backdrop !== 'none'

  return (
    <>
      {trigger}
      {visible ? (
        <FloatingPortal root={portalRoot}>
          <FloatingFocusManager
            context={floating.context}
            modal={props.modal ?? false}
            initialFocus={props.initialFocus ?? 0}
            disabled={!open}
          >
            <PopoverContainerProvider container={container}>
              <>
                {renderLocalBackdrop ? (
                  <div
                    aria-hidden="true"
                    className={cn(
                      'fixed inset-0 z-40',
                      backdrop === 'dim' ? 'bg-overlay' : 'bg-transparent'
                    )}
                    {...{
                      [BLOCKING_SURFACE_ATTR]: '',
                      [BLOCKING_SURFACE_BACKDROP_ATTR]: ''
                    }}
                    onPointerDown={dismissBackdrop}
                    onMouseDown={dismissBackdrop}
                    onClick={event => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                  />
                ) : null}
                {floatingContent}
              </>
            </PopoverContainerProvider>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  )
}
