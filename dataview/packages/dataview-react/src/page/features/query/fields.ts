import type {
  Field,
  FieldId,
  FilterRule,
  Sorter
} from '@dataview/core/contracts'

const collectUsedFieldIds = <T,>(
  entries: readonly T[],
  readFieldId: (entry: T) => FieldId | undefined,
  options?: {
    excludeIndex?: number
  }
) => {
  const usedFieldIds = new Set<FieldId>()

  entries.forEach((entry, index) => {
    if (index === options?.excludeIndex) {
      return
    }

    const fieldId = readFieldId(entry)
    if (fieldId) {
      usedFieldIds.add(fieldId)
    }
  })

  return usedFieldIds
}

const filterFields = (
  fields: readonly Field[],
  usedFieldIds: ReadonlySet<FieldId>,
  includeFieldId?: FieldId
) => fields.filter(field => field.id === includeFieldId || !usedFieldIds.has(field.id))

export const getFilterFieldId = (
  rule: Pick<FilterRule, 'fieldId'>
): FieldId | undefined => typeof rule.fieldId === 'string'
  ? rule.fieldId
  : undefined

export const getSorterFieldId = (
  sorter: Pick<Sorter, 'field'>
): FieldId | undefined => typeof sorter.field === 'string'
  ? sorter.field
  : undefined

export const getAvailableFilterFields = (
  fields: readonly Field[],
  rules: readonly FilterRule[]
) => filterFields(
  fields,
  collectUsedFieldIds(rules, getFilterFieldId)
)

export const getAvailableSorterFields = (
  fields: readonly Field[],
  sorters: readonly Sorter[]
) => filterFields(
  fields,
  collectUsedFieldIds(sorters, getSorterFieldId)
)

export const getAvailableSorterFieldsForIndex = (
  fields: readonly Field[],
  sorters: readonly Sorter[],
  index: number
) => {
  const currentFieldId = getSorterFieldId(sorters[index] ?? {
    field: undefined
  })

  return filterFields(
    fields,
    collectUsedFieldIds(sorters, getSorterFieldId, {
      excludeIndex: index
    }),
    currentFieldId
  )
}

export const findSorterField = (
  fields: readonly Field[],
  sorter: Pick<Sorter, 'field'>
) => {
  const fieldId = getSorterFieldId(sorter)
  return fieldId
    ? fields.find(field => field.id === fieldId)
    : undefined
}
