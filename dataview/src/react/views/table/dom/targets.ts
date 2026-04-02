import type { PropertyId } from '@dataview/core/contracts'
import type { Point } from '@dataview/dom/geometry'
import { targetElement } from '@dataview/dom/interactive'
import {
  type AppearanceList,
  type PropertyList
} from '@dataview/engine/projection/view'
import {
  grid,
} from '@dataview/table'
import type {
  AppearanceId,
  FieldId
} from '@dataview/react/currentView'

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
): FieldId | null => (
  element?.dataset.rowId && element.dataset.propertyId
    ? {
        appearanceId: element.dataset.rowId as AppearanceId,
        propertyId: element.dataset.propertyId as PropertyId
      }
    : null
)

const resolveCellId = (
  appearances: Pick<AppearanceList, 'has'>,
  properties: Pick<PropertyList, 'has'>,
  cell: FieldId | null
): FieldId | null => {
  if (!cell || !grid.containsCell(appearances, properties, cell)) {
    return null
  }

  return {
    appearanceId: cell.appearanceId,
    propertyId: cell.propertyId
  }
}

export const hasTableTarget = (
  target: EventTarget | null
): boolean => Boolean(closestTableTargetElement(target))

const cellFromElement = (
  element: Element | null,
  appearances: Pick<AppearanceList, 'has'>,
  properties: Pick<PropertyList, 'has'>
): FieldId | null => resolveCellId(
  appearances,
  properties,
  cellIdFromElement(element instanceof HTMLElement ? element : null)
)

export const cellFromTarget = (
  target: EventTarget | null,
  appearances: Pick<AppearanceList, 'has'>,
  properties: Pick<PropertyList, 'has'>,
  kind?: 'cell' | 'fill-handle'
): FieldId | null => cellFromElement(
  closestTableTargetElement(target, kind),
  appearances,
  properties
)

export const cellFromPoint = (
  point: Point | null,
  appearances: Pick<AppearanceList, 'has'>,
  properties: Pick<PropertyList, 'has'>,
  kind?: 'cell' | 'fill-handle'
): FieldId | null => {
  if (!point || typeof document === 'undefined') {
    return null
  }

  return cellFromElement(
    closestTableTargetElement(
      document.elementFromPoint(point.x, point.y),
      kind
    ),
    appearances,
    properties
  )
}
