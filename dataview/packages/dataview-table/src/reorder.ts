import type {
  CustomFieldId
} from '@dataview/core/types'
import {
  collection,
  equal,
  order
} from '@shared/core'
import type { ItemId } from '@dataview/engine'

export interface TableRowReorderHint {
  beforeId: ItemId | null
  top: number
}

export const columnBeforeId = (input: {
  columnIds: readonly CustomFieldId[]
  sourceId: CustomFieldId
  overId: CustomFieldId
}): CustomFieldId | null | undefined => {
  if (input.sourceId === input.overId) {
    return undefined
  }

  const from = input.columnIds.indexOf(input.sourceId)
  const to = input.columnIds.indexOf(input.overId)
  if (from === -1 || to === -1 || from === to) {
    return undefined
  }

  const nextOrder = order.moveItem(input.columnIds, input.sourceId, {
    before: input.overId
  })
  const nextIndex = nextOrder.indexOf(input.sourceId)
  return nextOrder[nextIndex + 1] ?? null
}

export const rowDragIds = (input: {
  activeId: ItemId
  selectedRowIds: readonly ItemId[]
  visibleRowIdSet: ReadonlySet<ItemId>
}): readonly ItemId[] => {
  const visibleSelectedIds = input.selectedRowIds
    .filter(rowId => input.visibleRowIdSet.has(rowId))
  const dragIds = visibleSelectedIds.includes(input.activeId)
    ? visibleSelectedIds
    : [input.activeId]
  const uniqueDragIds = collection.unique(dragIds)
  return uniqueDragIds.length
    ? uniqueDragIds
    : [input.activeId]
}

export const rowSelectionTarget = (input: {
  activeId: ItemId
  dragIds: readonly ItemId[]
  selectedRowIds: readonly ItemId[]
}): ItemId | null => (
  input.dragIds.length === 1
  && input.dragIds[0] === input.activeId
  && !input.selectedRowIds.includes(input.activeId)
)
  ? input.activeId
  : null

export const sameRowHint = (
  left?: TableRowReorderHint,
  right?: TableRowReorderHint
) => (
  left?.beforeId === right?.beforeId
  && left?.top === right?.top
)

export const reorderRows = (input: {
  rowIds: readonly ItemId[]
  movingIds: readonly ItemId[]
  before?: ItemId | null
}) => {
  const movingIds = collection.unique(input.movingIds)
  if (!movingIds.length) {
    return [...input.rowIds]
  }

  return order.moveBlock(input.rowIds, movingIds, {
    before: input.before ?? undefined
  })
}

export const showRowHint = (input: {
  hint: TableRowReorderHint | null
  rowIds: readonly ItemId[]
  dragIds: readonly ItemId[]
}) => {
  if (!input.hint || !input.dragIds.length) {
    return false
  }

  const nextRowIds = reorderRows({
    rowIds: input.rowIds,
    movingIds: input.dragIds,
    before: input.hint.beforeId
  })

  return !equal.sameOrder(nextRowIds, input.rowIds)
}
