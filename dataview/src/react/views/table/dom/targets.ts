import type { CustomFieldId } from '@dataview/core/contracts'
import type { Point } from '@shared/dom'
import { targetElement } from '@shared/dom'
import {
  type AppearanceList,
  type FieldList
} from '@dataview/engine/projection/view'
import {
  grid,
} from '@dataview/table'
import type {
  AppearanceId,
  CellRef
} from '@dataview/engine/projection/view'

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
        appearanceId: element.dataset.rowId as AppearanceId,
        fieldId: element.dataset.fieldId as CustomFieldId
      }
    : null
)

const resolveCellId = (
  appearances: Pick<AppearanceList, 'has'>,
  fields: Pick<FieldList, 'has'>,
  cell: CellRef | null
): CellRef | null => {
  if (!cell || !grid.containsCell(appearances, fields, cell)) {
    return null
  }

  return {
    appearanceId: cell.appearanceId,
    fieldId: cell.fieldId
  }
}

export const hasTableTarget = (
  target: EventTarget | null
): boolean => Boolean(closestTableTargetElement(target))

const cellFromElement = (
  element: Element | null,
  appearances: Pick<AppearanceList, 'has'>,
  fields: Pick<FieldList, 'has'>
): CellRef | null => resolveCellId(
  appearances,
  fields,
  cellIdFromElement(element instanceof HTMLElement ? element : null)
)

export const cellFromTarget = (
  target: EventTarget | null,
  appearances: Pick<AppearanceList, 'has'>,
  fields: Pick<FieldList, 'has'>,
  kind?: 'cell' | 'fill-handle'
): CellRef | null => cellFromElement(
  closestTableTargetElement(target, kind),
  appearances,
  fields
)

export const cellFromPoint = (
  point: Point | null,
  appearances: Pick<AppearanceList, 'has'>,
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
    appearances,
    fields
  )
}
