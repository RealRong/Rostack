import type {
  CustomFieldId
} from '@dataview/core/contracts'
import {
  sameOrder
} from '@shared/equality'
import type { AppearanceId } from '@dataview/engine/project'

export interface TableRowReorderHint {
  beforeId: AppearanceId | null
  top: number
}

const moveItem = <T>(
  items: readonly T[],
  from: number,
  to: number
): readonly T[] => {
  const next = items.slice()
  const [item] = next.splice(from, 1)
  if (item === undefined) {
    return items
  }

  next.splice(to, 0, item)
  return next
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

  const nextOrder = moveItem(input.columnIds, from, to)
  const nextIndex = nextOrder.indexOf(input.sourceId)
  return nextOrder[nextIndex + 1] ?? null
}

export const rowDragIds = (input: {
  activeId: AppearanceId
  selectedRowIds: readonly AppearanceId[]
  visibleRowIdSet: ReadonlySet<AppearanceId>
}): readonly AppearanceId[] => {
  const visibleSelectedIds = input.selectedRowIds
    .filter(rowId => input.visibleRowIdSet.has(rowId))
  const dragIds = visibleSelectedIds.includes(input.activeId)
    ? visibleSelectedIds
    : [input.activeId]
  const uniqueDragIds = Array.from(new Set(dragIds))
  return uniqueDragIds.length
    ? uniqueDragIds
    : [input.activeId]
}

export const rowSelectionTarget = (input: {
  activeId: AppearanceId
  dragIds: readonly AppearanceId[]
  selectedRowIds: readonly AppearanceId[]
}): AppearanceId | null => (
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

export const reorderRows = (
  current: readonly AppearanceId[],
  moving: readonly AppearanceId[],
  beforeId?: AppearanceId | null
) => {
  const movingIds = Array.from(new Set(moving))
  if (!movingIds.length) {
    return [...current]
  }

  const movingIdSet = new Set(movingIds)
  const remaining = current.filter(rowId => !movingIdSet.has(rowId))

  if (!beforeId) {
    return [...remaining, ...movingIds]
  }

  const insertIndex = remaining.indexOf(beforeId)
  if (insertIndex === -1) {
    return [...remaining, ...movingIds]
  }

  return [
    ...remaining.slice(0, insertIndex),
    ...movingIds,
    ...remaining.slice(insertIndex)
  ]
}

export const rowBeforeId = (
  hint: TableRowReorderHint
) => hint.beforeId

export const showRowHint = (
  hint: TableRowReorderHint | null,
  rowIds: readonly AppearanceId[],
  dragIds: readonly AppearanceId[]
) => {
  if (!hint || !dragIds.length) {
    return false
  }

  const nextRowIds = reorderRows(
    rowIds,
    dragIds,
    rowBeforeId(hint)
  )

  return !sameOrder(nextRowIds, rowIds)
}
