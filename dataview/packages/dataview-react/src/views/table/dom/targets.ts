import type { CustomFieldId } from '@dataview/core/contracts'
import type { Point } from '@shared/dom'
import { targetElement } from '@shared/dom'
import {
  type ItemList,
  type FieldList
} from '@dataview/engine'
import {
  grid,
} from '@dataview/table'
import type {
  ItemId
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'

export type TableTargetKind =
  | 'cell'
  | 'fill-handle'
  | 'row'
  | 'row-rail'
  | 'group-row'
  | 'column'

const isTableTargetKind = (value: string | undefined): value is TableTargetKind => (
  value === 'cell'
  || value === 'fill-handle'
  || value === 'row'
  || value === 'row-rail'
  || value === 'group-row'
  || value === 'column'
)

const targetKindOf = (element: Element | null): TableTargetKind | undefined => {
  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  const kind = element.dataset.tableTarget
  return isTableTargetKind(kind)
    ? kind
    : undefined
}

export const closestTableTargetElement = (
  target: EventTarget | null,
  kind?: TableTargetKind
): HTMLElement | null => {
  let current = targetElement(target)
  while (current instanceof HTMLElement) {
    const targetKind = targetKindOf(current)
    if (targetKind && (!kind || targetKind === kind)) {
      return current
    }

    current = current.parentElement
  }

  return null
}

const cellIdFromElement = (
  element: HTMLElement | null
): CellRef | null => (
  element?.dataset.rowId && element.dataset.fieldId
    ? {
        itemId: element.dataset.rowId as ItemId,
        fieldId: element.dataset.fieldId as CustomFieldId
      }
    : null
)

const resolveCellId = (
  items: Pick<ItemList, 'has'>,
  fields: Pick<FieldList, 'has'>,
  cell: CellRef | null
): CellRef | null => {
  if (!cell || !grid.containsCell(items, fields, cell)) {
    return null
  }

  return {
    itemId: cell.itemId,
    fieldId: cell.fieldId
  }
}

export const hasTableTarget = (
  target: EventTarget | null
): boolean => Boolean(closestTableTargetElement(target))

const cellFromElement = (
  element: Element | null,
  items: Pick<ItemList, 'has'>,
  fields: Pick<FieldList, 'has'>
): CellRef | null => resolveCellId(
  items,
  fields,
  cellIdFromElement(element instanceof HTMLElement ? element : null)
)

export const cellFromTarget = (
  target: EventTarget | null,
  items: Pick<ItemList, 'has'>,
  fields: Pick<FieldList, 'has'>,
  kind?: 'cell' | 'fill-handle'
): CellRef | null => cellFromElement(
  closestTableTargetElement(target, kind),
  items,
  fields
)

export const cellFromPoint = (
  point: Point | null,
  items: Pick<ItemList, 'has'>,
  fields: Pick<FieldList, 'has'>,
  kind?: 'cell' | 'fill-handle'
): CellRef | null => {
  if (!point || typeof document === 'undefined') {
    return null
  }

  return cellFromElement(
    closestTableTargetElement(
      document.elementFromPoint(point.x, point.y),
      kind
    ),
    items,
    fields
  )
}
