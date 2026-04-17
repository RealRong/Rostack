import {
  useCallback,
  useRef,
  type RefObject,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { ItemId } from '@dataview/engine'
import { pointIn } from '@shared/dom'
import {
  usePointerDragSession,
  type PointerPosition
} from '@dataview/react/interaction/usePointerDragSession'
import type { GalleryDropTarget } from '@dataview/react/views/gallery/reorder/hitTest'
import { dropTargetFromPoint } from '@dataview/react/views/gallery/reorder/hitTest'
import type { GalleryLayoutCache } from '@dataview/react/views/gallery/virtual'

const INDICATOR_EPSILON = 0.5

interface Options {
  containerRef: RefObject<HTMLElement | null>
  canDrag: boolean
  itemMap: ReadonlyMap<ItemId, ItemId>
  getDragIds: (activeId: ItemId) => readonly ItemId[]
  onDrop: (cardIds: readonly ItemId[], target: GalleryDropTarget) => void
  getLayout: () => GalleryLayoutCache | null
  onDraggingChange?: (dragging: boolean) => void
}

const sameTarget = (
  left?: GalleryDropTarget,
  right?: GalleryDropTarget
) => (
  left?.sectionKey === right?.sectionKey
  && left?.anchorId === right?.anchorId
  && left?.side === right?.side
  && left?.beforeItemId === right?.beforeItemId
  && Math.abs((left?.indicator.left ?? 0) - (right?.indicator.left ?? 0)) <= INDICATOR_EPSILON
  && Math.abs((left?.indicator.top ?? 0) - (right?.indicator.top ?? 0)) <= INDICATOR_EPSILON
  && Math.abs((left?.indicator.height ?? 0) - (right?.indicator.height ?? 0)) <= INDICATOR_EPSILON
)

export const useCardReorder = (options: Options) => {
  const sourceRef = useRef<HTMLElement | null>(null)
  const resolveTarget = useCallback((pointer: PointerPosition | null, dragIds: readonly ItemId[]) => {
    const container = options.containerRef.current
    if (!container || !pointer) {
      return undefined
    }

    const point = pointIn(container, pointer)
    return dropTargetFromPoint(options.getLayout(), point, dragIds)
  }, [options.containerRef, options.getLayout])

  const session = usePointerDragSession<ItemId, ItemId, GalleryDropTarget>({
    containerRef: options.containerRef,
    canDrag: options.canDrag,
    autoPan: true,
    itemMap: options.itemMap,
    getDragIds: options.getDragIds,
    resolveTarget,
    sameTarget,
    onDrop: options.onDrop,
    onDraggingChange: options.onDraggingChange,
    onFinish: () => {
      sourceRef.current = null
    }
  })

  const onPointerDown = useCallback((recordId: ItemId, event: ReactPointerEvent<HTMLElement>) => {
    sourceRef.current = event.currentTarget
    session.onPointerDown(recordId, event)
  }, [session])

  return {
    activeId: session.activeId,
    overlaySize: session.overlaySize,
    dragIds: session.dragIds,
    dragIdSet: session.dragIdSet,
    overTarget: session.overTarget,
    overlayOffsetRef: session.overlayOffsetRef,
    pointerRef: session.pointerRef,
    sourceRef,
    shouldIgnoreClick: session.shouldIgnoreClick,
    onPointerDown
  }
}
