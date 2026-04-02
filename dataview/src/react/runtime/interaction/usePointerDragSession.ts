import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react'
import { disableUserSelect } from '@/react/dom/selection'
import {
  resolveDefaultAutoPanTargets,
  useAutoPan
} from './autoPan'

const DEFAULT_ACTIVATION_DISTANCE = 4
const DEFAULT_SUPPRESS_CLICK_MS = 180

export interface PointerPosition {
  x: number
  y: number
}

export interface OverlaySize {
  width: number
  height: number
}

interface PendingSession<TId extends string> {
  recordId: TId
  pointerId: number
  start: PointerPosition
  overlayOffset: PointerPosition
  overlaySize: OverlaySize
  ownerDocument: Document
}

export interface PointerDragSessionOptions<TId extends string, TItem, TTarget> {
  containerRef: RefObject<HTMLElement | null>
  canDrag: boolean
  itemMap: ReadonlyMap<TId, TItem>
  getDragIds: (activeRecordId: TId) => readonly TId[]
  getOverlay?: (input: {
    id: TId
    event: ReactPointerEvent<HTMLElement>
  }) => {
    ownerDocument?: Document
    overlayOffset?: PointerPosition
    overlaySize?: OverlaySize
  } | undefined
  resolveTarget: (pointer: PointerPosition | null, dragIds: readonly TId[]) => TTarget | undefined
  sameTarget: (left?: TTarget, right?: TTarget) => boolean
  onDrop: (recordIds: readonly TId[], target: TTarget) => void
  onDraggingChange?: (dragging: boolean) => void
  onPointerMove?: (pointer: PointerPosition, dragIds: readonly TId[]) => void
  onFinish?: (input: {
    cancelled: boolean
    dropped: boolean
    activeId: TId
    dragIds: readonly TId[]
    target?: TTarget
  }) => void
  activationDistance?: number
  autoPan?: boolean
  suppressClickMs?: number
}

export interface PointerDragSession<TId extends string, TItem, TTarget> {
  activeId: TId | undefined
  activeItem: TItem | undefined
  dragIds: readonly TId[]
  dragIdSet: ReadonlySet<TId>
  overTarget: TTarget | undefined
  overlaySize: OverlaySize
  overlayOffsetRef: MutableRefObject<PointerPosition>
  pointerRef: MutableRefObject<PointerPosition | null>
  refreshTarget: () => void
  shouldIgnoreClick: () => boolean
  onPointerDown: (recordId: TId, event: ReactPointerEvent<HTMLElement>) => void
}

const dragDistance = (
  start: PointerPosition,
  current: PointerPosition
) => Math.hypot(current.x - start.x, current.y - start.y)

export const usePointerDragSession = <TId extends string, TItem, TTarget>(
  options: PointerDragSessionOptions<TId, TItem, TTarget>
): PointerDragSession<TId, TItem, TTarget> => {
  const activationDistance = options.activationDistance ?? DEFAULT_ACTIVATION_DISTANCE
  const autoPan = options.autoPan ?? false
  const suppressClickMs = options.suppressClickMs ?? DEFAULT_SUPPRESS_CLICK_MS

  const [activeId, setActiveId] = useState<TId | undefined>(undefined)
  const [dragIds, setDragIds] = useState<readonly TId[]>([])
  const [overTarget, setOverTarget] = useState<TTarget | undefined>(undefined)
  const [overlaySize, setOverlaySize] = useState<OverlaySize>({
    width: 0,
    height: 0
  })
  const overTargetRef = useRef<TTarget | undefined>(undefined)
  const pendingRef = useRef<PendingSession<TId> | null>(null)
  const dragIdsRef = useRef<readonly TId[]>([])
  const pointerRef = useRef<PointerPosition | null>(null)
  const overlayOffsetRef = useRef<PointerPosition>({
    x: 0,
    y: 0
  })
  const suppressClickUntilRef = useRef(0)
  const cleanupRef = useRef<(() => void) | null>(null)
  const restoreSelectionRef = useRef<(() => void) | null>(null)
  const draggingRef = useRef(false)

  const activeItem = useMemo(
    () => activeId ? options.itemMap.get(activeId) : undefined,
    [activeId, options.itemMap]
  )
  const dragIdSet = useMemo(
    () => new Set<TId>(dragIds),
    [dragIds]
  )

  const setResolvedTarget = useCallback((target: TTarget | undefined) => {
    overTargetRef.current = target
    setOverTarget(previous => options.sameTarget(previous, target) ? previous : target)
  }, [options])

  const suppressClick = useCallback(() => {
    suppressClickUntilRef.current = Date.now() + suppressClickMs
  }, [suppressClickMs])

  const teardownPointerSession = useCallback(() => {
    const cleanup = cleanupRef.current
    cleanupRef.current = null
    cleanup?.()
  }, [])

  const restoreSelection = useCallback(() => {
    const restore = restoreSelectionRef.current
    restoreSelectionRef.current = null
    restore?.()
  }, [])

  const clear = useCallback(() => {
    teardownPointerSession()
    restoreSelection()
    pendingRef.current = null
    pointerRef.current = null
    dragIdsRef.current = []
    overlayOffsetRef.current = { x: 0, y: 0 }
    setActiveId(undefined)
    setDragIds([])
    setOverlaySize({
      width: 0,
      height: 0
    })
    setResolvedTarget(undefined)
    if (draggingRef.current) {
      draggingRef.current = false
      options.onDraggingChange?.(false)
    }
  }, [options, restoreSelection, setResolvedTarget, teardownPointerSession])

  const refreshTarget = useCallback(() => {
    if (!draggingRef.current) {
      return
    }

    const pointer = pointerRef.current
    setResolvedTarget(options.resolveTarget(pointer, dragIdsRef.current))
    if (pointer) {
      options.onPointerMove?.(pointer, dragIdsRef.current)
    }
  }, [options, setResolvedTarget])
  const resolveAutoPanTargets = useCallback(
    () => autoPan
      ? resolveDefaultAutoPanTargets(options.containerRef.current)
      : null,
    [autoPan, options.containerRef]
  )
  const autoPanState = useAutoPan({
    active: activeId !== undefined && autoPan,
    pointerRef,
    resolveTargets: resolveAutoPanTargets,
    onPan: refreshTarget
  })

  const activate = useCallback((session: PendingSession<TId>) => {
    if (!options.canDrag) {
      return false
    }

    const nextDragIds = options.getDragIds(session.recordId)
    if (!nextDragIds.length) {
      return false
    }

    draggingRef.current = true
    dragIdsRef.current = nextDragIds
    overlayOffsetRef.current = session.overlayOffset
    setActiveId(session.recordId)
    setDragIds(nextDragIds)
    setOverlaySize(session.overlaySize)
    setResolvedTarget(options.resolveTarget(pointerRef.current, nextDragIds))
    options.onDraggingChange?.(true)

    return true
  }, [options, setResolvedTarget])

  const finish = useCallback((input: {
    cancelled: boolean
    pointerId?: number
  }) => {
    const pending = pendingRef.current
    if (!pending) {
      return
    }

    if (input.pointerId !== undefined && pending.pointerId !== input.pointerId) {
      return
    }

    const nextDragIds = dragIdsRef.current
    const target = draggingRef.current
      ? options.resolveTarget(pointerRef.current, nextDragIds) ?? overTargetRef.current
      : undefined
    const shouldDrop = (
      !input.cancelled
      && draggingRef.current
      && options.canDrag
      && nextDragIds.length > 0
      && Boolean(target)
    )

    if (draggingRef.current) {
      suppressClick()
    }

    clear()

    if (shouldDrop && target) {
      options.onDrop(nextDragIds, target)
    }

    options.onFinish?.({
      cancelled: input.cancelled,
      dropped: shouldDrop,
      activeId: pending.recordId,
      dragIds: nextDragIds,
      target
    })
  }, [clear, options, suppressClick])

  useEffect(() => {
    if (!activeId) {
      return
    }

    const handleScroll = () => {
      refreshTarget()
    }

    autoPanState.watchTargets.forEach(target => {
      target.addEventListener?.('scroll', handleScroll, { passive: true })
    })

    return () => {
      autoPanState.watchTargets.forEach(target => {
        target.removeEventListener?.('scroll', handleScroll)
      })
    }
  }, [activeId, autoPanState.watchTargets, refreshTarget])

  useEffect(() => () => {
    teardownPointerSession()
    restoreSelection()
  }, [restoreSelection, teardownPointerSession])

  const onPointerDown = useCallback((
    recordId: TId,
    event: ReactPointerEvent<HTMLElement>
  ) => {
    if (event.button !== 0 || !event.isPrimary || !options.canDrag) {
      return
    }

    clear()

    const currentPointer = {
      x: event.clientX,
      y: event.clientY
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const overlay = options.getOverlay?.({
      id: recordId,
      event
    })
    const nextPending: PendingSession<TId> = {
      recordId,
      pointerId: event.pointerId,
      start: currentPointer,
      overlayOffset: overlay?.overlayOffset ?? {
        x: currentPointer.x - rect.left,
        y: currentPointer.y - rect.top
      },
      overlaySize: overlay?.overlaySize ?? {
        width: rect.width || event.currentTarget.clientWidth,
        height: rect.height || event.currentTarget.clientHeight
      },
      ownerDocument: overlay?.ownerDocument ?? event.currentTarget.ownerDocument
    }

    pointerRef.current = currentPointer
    pendingRef.current = nextPending
    nextPending.ownerDocument.getSelection()?.removeAllRanges()
    restoreSelectionRef.current = disableUserSelect(nextPending.ownerDocument)

    const ownerWindow = nextPending.ownerDocument.defaultView ?? window

    const handlePointerMove = (nextEvent: PointerEvent) => {
      const pending = pendingRef.current
      if (!pending || pending.pointerId !== nextEvent.pointerId) {
        return
      }

      pointerRef.current = {
        x: nextEvent.clientX,
        y: nextEvent.clientY
      }
      const nextPointer = pointerRef.current

      if (!draggingRef.current) {
        if (dragDistance(pending.start, nextPointer) < activationDistance) {
          return
        }

        if (!activate(pending)) {
          finish({
            cancelled: true,
            pointerId: nextEvent.pointerId
          })
          return
        }
      }

      if (nextEvent.cancelable) {
        nextEvent.preventDefault()
      }

      setResolvedTarget(options.resolveTarget(nextPointer, dragIdsRef.current))
      options.onPointerMove?.(nextPointer, dragIdsRef.current)
    }

    const handlePointerEnd = (nextEvent: PointerEvent) => {
      finish({
        cancelled: nextEvent.type === 'pointercancel',
        pointerId: nextEvent.pointerId
      })
    }

    const handleBlur = () => {
      finish({
        cancelled: true
      })
    }

    ownerWindow.addEventListener('pointermove', handlePointerMove, true)
    ownerWindow.addEventListener('pointerup', handlePointerEnd, true)
    ownerWindow.addEventListener('pointercancel', handlePointerEnd, true)
    ownerWindow.addEventListener('blur', handleBlur)

    cleanupRef.current = () => {
      ownerWindow.removeEventListener('pointermove', handlePointerMove, true)
      ownerWindow.removeEventListener('pointerup', handlePointerEnd, true)
      ownerWindow.removeEventListener('pointercancel', handlePointerEnd, true)
      ownerWindow.removeEventListener('blur', handleBlur)
    }
  }, [activationDistance, activate, clear, finish, options, setResolvedTarget])

  return {
    activeId,
    activeItem,
    dragIds,
    dragIdSet,
    overTarget,
    overlaySize,
    overlayOffsetRef,
    pointerRef,
    refreshTarget,
    shouldIgnoreClick: () => Date.now() < suppressClickUntilRef.current,
    onPointerDown
  }
}
