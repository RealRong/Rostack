import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent
} from 'react'
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
} from '@dataview/react/dataview'
import { useStoreValue } from '@shared/react'
import { usePointerDragSession } from '@dataview/react/interaction/usePointerDragSession'
import { useTableContext } from '@dataview/react/views/table/context'

export interface RowReorderApi {
  active: boolean
  dragIdSet: ReadonlySet<ItemId>
  hint: TableRowReorderHint | null
  startDrag: (input: {
    rowId: ItemId
    event: ReactPointerEvent<HTMLButtonElement>
  }) => void
}

export const useRowReorder = (): RowReorderApi => {
  const dataView = useDataView()
  const table = useTableContext()
  const grid = useStoreValue(dataView.model.table.grid)
  if (!grid) {
    throw new Error('Table row reorder requires an active table grid.')
  }

  const layout = table.layout
  const canRowDrag = useStoreValue(table.can.rowDrag)
  const rowSelection = useStoreValue(table.selection.rows.state.store)
  const rowIds = grid.items.ids
  const selectedRowIds = useMemo(
    () => table.selection.rows.enumerate.materialize(),
    [rowSelection, table.selection.rows]
  )
  const rowIdSet = useMemo(
    () => new Set(rowIds),
    [rowIds]
  )
  const itemMap = useMemo(
    () => new Map(rowIds.map(rowId => [rowId, rowId] as const)),
    [rowIds]
  )
  const selectionTargetRef = useRef<ItemId | null>(null)
  const sourceNodeRef = useRef<HTMLElement | null>(null)

  const resolveDragIds = useCallback((activeId: ItemId) => {
    return rowDragIds({
      activeId,
      selectedRowIds,
      visibleRowIdSet: rowIdSet
    })
  }, [rowIdSet, selectedRowIds])

  const rowRect = useCallback((rowId: ItemId) => (
    table.dom.row(rowId)?.getBoundingClientRect() ?? null
  ), [table.dom])

  const drag = usePointerDragSession<ItemId, ItemId, TableRowReorderHint>({
    containerRef: layout.containerRef,
    canDrag: canRowDrag,
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
          ? grid.items.read.section(beforeId)
          : grid.items.read.section(dragIds[0]!)
      ) ?? grid.sections.all[0]?.key
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
      table.rail.set(null)
      sourceNodeRef.current = null
      if (!input.cancelled && selectionTargetRef.current) {
        table.selection.rows.command.ids.replace([selectionTargetRef.current], {
          anchor: selectionTargetRef.current,
          focus: selectionTargetRef.current
        })
      }
      selectionTargetRef.current = null
      table.focus()
    }
  })

  const startDrag = useCallback((input: {
    rowId: ItemId
    event: ReactPointerEvent<HTMLButtonElement>
  }) => {
    if (!canRowDrag) {
      return
    }

    const dragIds = resolveDragIds(input.rowId)
    selectionTargetRef.current = rowSelectionTarget({
      activeId: input.rowId,
      dragIds,
      selectedRowIds
    })
    sourceNodeRef.current = (
      input.event.currentTarget.closest<HTMLElement>('[data-table-target="row"]')
      ?? table.dom.row(input.rowId)
    )

    table.hover.clear({
      x: input.event.clientX,
      y: input.event.clientY
    })
    table.rail.set(null)
    drag.onPointerDown(input.rowId, input.event)
  }, [canRowDrag, drag, resolveDragIds, selectedRowIds, table.dom, table.hover, table.rail])

  useEffect(() => {
    if (!drag.dragIds.length) {
      dataView.react.drag.clear()
      return
    }

    dataView.react.drag.set({
      active: true,
      kind: 'row',
      source: sourceNodeRef.current,
      pointerRef: drag.pointerRef,
      offsetRef: drag.overlayOffsetRef,
      size: drag.overlaySize,
      extraCount: Math.max(0, drag.dragIds.length - 1),
      scrubSelectors: ['[data-table-target="row-rail"]']
    })

    return () => {
      dataView.react.drag.clear()
    }
  }, [
    dataView.react.drag,
    drag.dragIds,
    drag.overlayOffsetRef,
    drag.overlaySize,
    drag.pointerRef
  ])

  return useMemo(() => ({
    active: drag.dragIds.length > 0,
    dragIdSet: drag.dragIdSet,
    hint: drag.overTarget ?? null,
    startDrag
  }), [
    drag.dragIdSet,
    drag.dragIds,
    drag.dragIds.length,
    drag.overTarget,
    startDrag
  ])
}
