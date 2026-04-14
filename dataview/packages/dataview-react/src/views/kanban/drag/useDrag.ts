import { useCallback, type RefObject } from 'react'
import { pointIn } from '@shared/dom'
import {
  usePointerDragSession,
  type PointerPosition
} from '@dataview/react/interaction/usePointerDragSession'
import type { ItemId } from '@dataview/engine'
import type { DropTarget } from '@dataview/react/views/kanban/drag/ids'
import { dropTargetFromPoint } from '@dataview/react/views/kanban/drag/hitTest'
import type { BoardLayout } from '@dataview/react/views/kanban/drag/layout'

interface Options {
  containerRef: RefObject<HTMLElement | null>
  canDrag: boolean
  itemMap: ReadonlyMap<ItemId, ItemId>
  getDragIds: (activeId: ItemId) => readonly ItemId[]
  onDrop: (cardIds: readonly ItemId[], target: DropTarget) => void
  getLayout: () => BoardLayout | null
  onDraggingChange?: (dragging: boolean) => void
}

const sameTarget = (
  left?: DropTarget,
  right?: DropTarget
) => (
  left?.sectionKey === right?.sectionKey
  && left?.beforeItemId === right?.beforeItemId
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

  const session = usePointerDragSession<ItemId, ItemId, DropTarget>({
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
