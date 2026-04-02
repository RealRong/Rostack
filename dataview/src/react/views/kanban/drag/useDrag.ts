import { useCallback, type RefObject } from 'react'
import { pointIn } from '@dataview/dom/geometry'
import {
  usePointerDragSession,
  type PointerPosition
} from '@dataview/react/interaction/usePointerDragSession'
import type { AppearanceId } from '@dataview/react/currentView'
import type { DropTarget } from './ids'
import { dropTargetFromPoint } from './hitTest'
import type { BoardLayout } from './layout'

interface Options {
  containerRef: RefObject<HTMLElement | null>
  canDrag: boolean
  itemMap: ReadonlyMap<AppearanceId, AppearanceId>
  getDragIds: (activeId: AppearanceId) => readonly AppearanceId[]
  onDrop: (cardIds: readonly AppearanceId[], target: DropTarget) => void
  getLayout: () => BoardLayout | null
  onDraggingChange?: (dragging: boolean) => void
}

const sameTarget = (
  left?: DropTarget,
  right?: DropTarget
) => (
  left?.sectionKey === right?.sectionKey
  && left?.beforeAppearanceId === right?.beforeAppearanceId
)

export const useDrag = (options: Options) => {
  const resolveTarget = useCallback((pointer: PointerPosition | null) => {
    const container = options.containerRef.current
    if (!container || !pointer) {
      return undefined
    }

    const point = pointIn(container, pointer)
    return dropTargetFromPoint(options.getLayout(), point)
  }, [options.containerRef, options.getLayout])

  const session = usePointerDragSession<AppearanceId, AppearanceId, DropTarget>({
    containerRef: options.containerRef,
    canDrag: options.canDrag,
    autoPan: true,
    itemMap: options.itemMap,
    getDragIds: options.getDragIds,
    resolveTarget: pointer => resolveTarget(pointer),
    sameTarget,
    onDrop: options.onDrop,
    onDraggingChange: options.onDraggingChange
  })

  return {
    activeId: session.activeId,
    dragIds: session.dragIds,
    dragIdSet: session.dragIdSet,
    overTarget: session.overTarget,
    overlayOffsetRef: session.overlayOffsetRef,
    overlaySize: session.overlaySize,
    pointerRef: session.pointerRef,
    shouldIgnoreClick: session.shouldIgnoreClick,
    onPointerDown: session.onPointerDown
  }
}
