import type { CustomFieldId } from '@dataview/core/contracts'
import type {
  ItemId,
  ItemList,
  FieldList
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'

const emptyAppearanceIds = [] as readonly ItemId[]
const emptyFieldIds = [] as readonly CustomFieldId[]

const clampIndex = (value: number, max: number) => {
  if (max <= 0) {
    return 0
  }

  return Math.max(0, Math.min(value, max - 1))
}

const hasAppearance = (
  items: Pick<ItemList, 'has'>,
  itemId: ItemId
) => items.has(itemId)

const hasField = (
  fields: Pick<FieldList, 'has'>,
  fieldId: CustomFieldId
) => fields.has(fieldId)

const containsCell = (
  items: Pick<ItemList, 'has'>,
  fields: Pick<FieldList, 'has'>,
  cell: CellRef
) => hasAppearance(items, cell.itemId) && hasField(fields, cell.fieldId)

const appearanceIndex = (
  items: Pick<ItemList, 'indexOf'>,
  itemId: ItemId
) => items.indexOf(itemId)

const fieldIndex = (
  fields: Pick<FieldList, 'indexOf'>,
  fieldId: CustomFieldId
) => fields.indexOf(fieldId)

const appearanceAt = (
  items: Pick<ItemList, 'at'>,
  index: number
) => items.at(index)

const fieldAt = (
  fields: Pick<FieldList, 'at'>,
  index: number
) => fields.at(index)

const normalizeAppearanceIds = (
  items: Pick<ItemList, 'ids'>,
  ids: readonly ItemId[]
) => {
  const idSet = new Set(ids)
  return items.ids.filter(id => idSet.has(id))
}

const appearancesBetween = (
  items: Pick<ItemList, 'indexOf' | 'ids'>,
  startId: ItemId,
  endId: ItemId
) => {
  const start = items.indexOf(startId)
  const end = items.indexOf(endId)
  if (start === undefined || end === undefined) {
    return emptyAppearanceIds
  }

  return items.ids.slice(Math.min(start, end), Math.max(start, end) + 1)
}

const fieldsBetween = (
  fields: Pick<FieldList, 'indexOf' | 'ids'>,
  startId: CustomFieldId,
  endId: CustomFieldId
) => {
  const start = fields.indexOf(startId)
  const end = fields.indexOf(endId)
  if (start === undefined || end === undefined) {
    return emptyFieldIds
  }

  return fields.ids.slice(Math.min(start, end), Math.max(start, end) + 1)
}

const cellAt = (
  items: Pick<ItemList, 'at'>,
  fields: Pick<FieldList, 'at'>,
  nextAppearanceIndex: number,
  nextFieldIndex: number
): CellRef | undefined => {
  const itemId = appearanceAt(items, nextAppearanceIndex)
  const fieldId = fieldAt(fields, nextFieldIndex)
  return itemId && fieldId
    ? {
        itemId,
        fieldId
      }
    : undefined
}

const edgeCell = (
  items: Pick<ItemList, 'indexOf' | 'ids' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'at'>,
  itemId: ItemId,
  side: 'start' | 'end'
): CellRef | undefined => {
  const nextAppearanceIndex = appearanceIndex(items, itemId)
  if (nextAppearanceIndex === undefined || !fields.ids.length) {
    return undefined
  }

  return cellAt(
    items,
    fields,
    nextAppearanceIndex,
    side === 'start' ? 0 : fields.ids.length - 1
  )
}

const firstCell = (
  items: Pick<ItemList, 'ids' | 'has' | 'indexOf' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'at'>,
  itemId?: ItemId
): CellRef | undefined => {
  const nextAppearanceId = itemId && hasAppearance(items, itemId)
    ? itemId
    : appearanceAt(items, 0)
  return nextAppearanceId
    ? edgeCell(items, fields, nextAppearanceId, 'start')
    : undefined
}

const stepField = (
  items: Pick<ItemList, 'ids' | 'indexOf' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'indexOf' | 'at'>,
  cell: CellRef,
  options: {
    rowDelta: number
    columnDelta: number
    wrap?: boolean
  }
): CellRef | undefined => {
  const currentAppearanceIndex = appearanceIndex(items, cell.itemId)
  const currentFieldIndex = fieldIndex(fields, cell.fieldId)
  if (
    currentAppearanceIndex === undefined
    || currentFieldIndex === undefined
    || !items.ids.length
    || !fields.ids.length
  ) {
    return undefined
  }

  let nextAppearanceIndex = clampIndex(currentAppearanceIndex + options.rowDelta, items.ids.length)
  let nextFieldIndex = clampIndex(currentFieldIndex + options.columnDelta, fields.ids.length)

  if (options.wrap && options.rowDelta === 0) {
    const rawFieldIndex = currentFieldIndex + options.columnDelta
    if (rawFieldIndex < 0) {
      nextAppearanceIndex = clampIndex(currentAppearanceIndex - 1, items.ids.length)
      nextFieldIndex = nextAppearanceIndex === currentAppearanceIndex
        ? 0
        : fields.ids.length - 1
    } else if (rawFieldIndex >= fields.ids.length) {
      nextAppearanceIndex = clampIndex(currentAppearanceIndex + 1, items.ids.length)
      nextFieldIndex = nextAppearanceIndex === currentAppearanceIndex
        ? fields.ids.length - 1
        : 0
    } else {
      nextFieldIndex = rawFieldIndex
    }
  }

  return cellAt(
    items,
    fields,
    nextAppearanceIndex,
    nextFieldIndex
  )
}

export const grid = {
  clampIndex,
  hasAppearance,
  hasField,
  containsCell,
  appearanceIndex,
  fieldIndex,
  appearanceAt,
  fieldAt,
  normalizeAppearanceIds,
  appearancesBetween,
  fieldsBetween,
  cellAt,
  edgeCell,
  firstCell,
  stepField
} as const
