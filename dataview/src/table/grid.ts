import type { CustomFieldId } from '@dataview/core/contracts'
import type {
  AppearanceId,
  AppearanceList,
  FieldList
} from '@dataview/engine/project'
import type {
  CellRef
} from '@dataview/engine/viewmodel'

const emptyAppearanceIds = [] as readonly AppearanceId[]
const emptyFieldIds = [] as readonly CustomFieldId[]

const clampIndex = (value: number, max: number) => {
  if (max <= 0) {
    return 0
  }

  return Math.max(0, Math.min(value, max - 1))
}

const hasAppearance = (
  appearances: Pick<AppearanceList, 'has'>,
  appearanceId: AppearanceId
) => appearances.has(appearanceId)

const hasField = (
  fields: Pick<FieldList, 'has'>,
  fieldId: CustomFieldId
) => fields.has(fieldId)

const containsCell = (
  appearances: Pick<AppearanceList, 'has'>,
  fields: Pick<FieldList, 'has'>,
  cell: CellRef
) => hasAppearance(appearances, cell.appearanceId) && hasField(fields, cell.fieldId)

const appearanceIndex = (
  appearances: Pick<AppearanceList, 'indexOf'>,
  appearanceId: AppearanceId
) => appearances.indexOf(appearanceId)

const fieldIndex = (
  fields: Pick<FieldList, 'indexOf'>,
  fieldId: CustomFieldId
) => fields.indexOf(fieldId)

const appearanceAt = (
  appearances: Pick<AppearanceList, 'at'>,
  index: number
) => appearances.at(index)

const fieldAt = (
  fields: Pick<FieldList, 'at'>,
  index: number
) => fields.at(index)

const normalizeAppearanceIds = (
  appearances: Pick<AppearanceList, 'ids'>,
  ids: readonly AppearanceId[]
) => {
  const idSet = new Set(ids)
  return appearances.ids.filter(id => idSet.has(id))
}

const appearancesBetween = (
  appearances: Pick<AppearanceList, 'indexOf' | 'ids'>,
  startId: AppearanceId,
  endId: AppearanceId
) => {
  const start = appearances.indexOf(startId)
  const end = appearances.indexOf(endId)
  if (start === undefined || end === undefined) {
    return emptyAppearanceIds
  }

  return appearances.ids.slice(Math.min(start, end), Math.max(start, end) + 1)
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
  appearances: Pick<AppearanceList, 'at'>,
  fields: Pick<FieldList, 'at'>,
  nextAppearanceIndex: number,
  nextFieldIndex: number
): CellRef | undefined => {
  const appearanceId = appearanceAt(appearances, nextAppearanceIndex)
  const fieldId = fieldAt(fields, nextFieldIndex)
  return appearanceId && fieldId
    ? {
        appearanceId,
        fieldId
      }
    : undefined
}

const edgeCell = (
  appearances: Pick<AppearanceList, 'indexOf' | 'ids' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'at'>,
  appearanceId: AppearanceId,
  side: 'start' | 'end'
): CellRef | undefined => {
  const nextAppearanceIndex = appearanceIndex(appearances, appearanceId)
  if (nextAppearanceIndex === undefined || !fields.ids.length) {
    return undefined
  }

  return cellAt(
    appearances,
    fields,
    nextAppearanceIndex,
    side === 'start' ? 0 : fields.ids.length - 1
  )
}

const firstCell = (
  appearances: Pick<AppearanceList, 'ids' | 'has' | 'indexOf' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'at'>,
  appearanceId?: AppearanceId
): CellRef | undefined => {
  const nextAppearanceId = appearanceId && hasAppearance(appearances, appearanceId)
    ? appearanceId
    : appearanceAt(appearances, 0)
  return nextAppearanceId
    ? edgeCell(appearances, fields, nextAppearanceId, 'start')
    : undefined
}

const stepField = (
  appearances: Pick<AppearanceList, 'ids' | 'indexOf' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'indexOf' | 'at'>,
  cell: CellRef,
  options: {
    rowDelta: number
    columnDelta: number
    wrap?: boolean
  }
): CellRef | undefined => {
  const currentAppearanceIndex = appearanceIndex(appearances, cell.appearanceId)
  const currentFieldIndex = fieldIndex(fields, cell.fieldId)
  if (
    currentAppearanceIndex === undefined
    || currentFieldIndex === undefined
    || !appearances.ids.length
    || !fields.ids.length
  ) {
    return undefined
  }

  let nextAppearanceIndex = clampIndex(currentAppearanceIndex + options.rowDelta, appearances.ids.length)
  let nextFieldIndex = clampIndex(currentFieldIndex + options.columnDelta, fields.ids.length)

  if (options.wrap && options.rowDelta === 0) {
    const rawFieldIndex = currentFieldIndex + options.columnDelta
    if (rawFieldIndex < 0) {
      nextAppearanceIndex = clampIndex(currentAppearanceIndex - 1, appearances.ids.length)
      nextFieldIndex = nextAppearanceIndex === currentAppearanceIndex
        ? 0
        : fields.ids.length - 1
    } else if (rawFieldIndex >= fields.ids.length) {
      nextAppearanceIndex = clampIndex(currentAppearanceIndex + 1, appearances.ids.length)
      nextFieldIndex = nextAppearanceIndex === currentAppearanceIndex
        ? fields.ids.length - 1
        : 0
    } else {
      nextFieldIndex = rawFieldIndex
    }
  }

  return cellAt(
    appearances,
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
