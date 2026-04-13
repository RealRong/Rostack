import {
  useCallback,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { cloneDragGhostNode } from '#react/dom/dragGhost.tsx'
import type { ItemId } from '@dataview/engine'
import {
  rowDragIds,
  rowSelectionTarget,
  rowBeforeId,
  sameRowHint,
  showRowHint,
  type TableRowReorderHint
} from '@dataview/table'
import {
  useDataView,
  useDataViewValue
} from '#react/dataview/index.ts'
import { useStoreValue } from '@shared/react'
import { usePointerDragSession } from '#react/interaction/usePointerDragSession.ts'
import { useTableContext } from '#react/views/table/context.tsx'

export interface RowReorderOverlayModel {
  active: boolean
  node: HTMLElement | null
  extraCount: number
  pointerRef: ReturnType<typeof usePointerDragSession<ItemId, ItemId, TableRowReorderHint>>['pointerRef']
  overlayOffsetRef: ReturnType<typeof usePointerDragSession<ItemId, ItemId, TableRowReorderHint>>['overlayOffsetRef']
}

export interface RowReorderApi {
  active: boolean
  dragIdSet: ReadonlySet<ItemId>
  hint: TableRowReorderHint | null
  overlay: RowReorderOverlayModel
  startDrag: (input: {
    rowId: ItemId
    event: ReactPointerEvent<HTMLButtonElement>
  }) => void
}

export const useRowReorder = (): RowReorderApi => {
  const table = useTableContext()
  const dataView = useDataView()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table row reorder requires an active current view.')
  }

  const layout = table.layout
  const capabilities = useStoreValue(table.capabilities)
  const currentSelection = useDataViewValue(
    dataView => dataView.selection.store
  )
  const rowIds = currentView.items.ids
  const rowIdSet = useMemo(
    () => new Set(rowIds),
    [rowIds]
  )
  const itemMap = useMemo(
    () => new Map(rowIds.map(rowId => [rowId, rowId] as const)),
    [rowIds]
  )
  const selectionTargetRef = useRef<ItemId | null>(null)
  const previewNodeRef = useRef<HTMLElement | null>(null)

  const resolveDragIds = useCallback((activeId: ItemId) => {
    return rowDragIds({
      activeId,
      selectedRowIds: currentSelection.ids,
      visibleRowIdSet: rowIdSet
    })
  }, [currentSelection.ids, rowIdSet])

  const rowRect = useCallback((rowId: ItemId) => (
    table.dom.row(rowId)?.getBoundingClientRect() ?? null
  ), [table.dom])

  const drag = usePointerDragSession<ItemId, ItemId, TableRowReorderHint>({
    containerRef: layout.containerRef,
    canDrag: capabilities.canRowDrag,
    autoPan: true,
    itemMap,
    getDragIds: resolveDragIds,
    getOverlay: ({ id, event }) => {
      const rect = rowRect(id)
      return rect
        ? {
            ownerDocument: event.currentTarget.ownerDocument,
            overlayOffset: {
              x: event.clientX - rect.left,
              y: event.clientY - rect.top
            },
            overlaySize: {
              width: rect.width || table.dom.container()?.clientWidth || 0,
              height: rect.height || layout.rowHeight
            }
          }
        : {
            ownerDocument: event.currentTarget.ownerDocument,
            overlayOffset: {
              x: 18,
              y: 18
            },
            overlaySize: {
              width: table.dom.container()?.clientWidth || 0,
              height: layout.rowHeight
            }
          }
    },
    resolveTarget: (pointer, dragIds) => {
      const nextHint = table.rowHit.gapAtPoint({
        rowIds,
        point: pointer
      })
      return showRowHint(nextHint, rowIds, dragIds)
        ? nextHint ?? undefined
        : undefined
    },
    sameTarget: sameRowHint,
    onDrop: (dragIds, target) => {
      if (!dragIds.length) {
        return
      }

      const beforeId = rowBeforeId(target)
      const sectionKey = (
        beforeId
          ? currentView.items.get(beforeId)?.sectionKey
          : currentView.items.get(dragIds[0])?.sectionKey
      ) ?? currentView.sections.all[0]?.key
      if (!sectionKey) {
        return
      }

      dataView.engine.active.items.move(dragIds, {
        section: sectionKey,
        ...(beforeId ? { before: beforeId } : {})
      })
    },
    onPointerMove: pointer => {
      table.hover.clear(pointer)
    },
    onFinish: input => {
      table.hover.clear()
      table.rowRail.set(null)
      previewNodeRef.current = null
      if (!input.cancelled && selectionTargetRef.current) {
        dataView.selection.set([selectionTargetRef.current], {
          anchor: selectionTargetRef.current,
          focus: selectionTargetRef.current
        })
        table.gridSelection.clear()
      }
      selectionTargetRef.current = null
      table.focus()
    }
  })

  const startDrag = useCallback((input: {
    rowId: ItemId
    event: ReactPointerEvent<HTMLButtonElement>
  }) => {
    if (!capabilities.canRowDrag) {
      return
    }

    const dragIds = resolveDragIds(input.rowId)
    selectionTargetRef.current = rowSelectionTarget({
      activeId: input.rowId,
      dragIds,
      selectedRowIds: currentSelection.ids
    })
    previewNodeRef.current = cloneDragGhostNode(
      input.event.currentTarget.closest<HTMLElement>('[data-table-target="row"]')
      ?? table.dom.row(input.rowId)
    )

    table.hover.clear({
      x: input.event.clientX,
      y: input.event.clientY
    })
    table.rowRail.set(null)
    drag.onPointerDown(input.rowId, input.event)
  }, [capabilities.canRowDrag, currentSelection.ids, drag, resolveDragIds, table.dom, table.hover, table.rowRail])

  return useMemo(() => ({
    active: drag.dragIds.length > 0,
    dragIdSet: drag.dragIdSet,
    hint: drag.overTarget ?? null,
    startDrag,
    overlay: {
      active: drag.dragIds.length > 0,
      node: previewNodeRef.current,
      extraCount: Math.max(0, drag.dragIds.length - 1),
      pointerRef: drag.pointerRef,
      overlayOffsetRef: drag.overlayOffsetRef
    }
  }), [
    drag.dragIdSet,
    drag.dragIds,
    drag.dragIds.length,
    drag.overlayOffsetRef,
    drag.overTarget,
    drag.pointerRef,
    startDrag,
  ])
}
