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

const filterId = (
  rule: Pick<FilterRule, 'fieldId'>
): FieldId | undefined => typeof rule.fieldId === 'string'
  ? rule.fieldId
  : undefined

const sorterId = (
  sorter: Pick<Sorter, 'field'>
): FieldId | undefined => typeof sorter.field === 'string'
  ? sorter.field
  : undefined

const usedFilterIds = (
  rules: readonly FilterRule[]
): readonly FieldId[] => rules.flatMap(rule => {
  const fieldId = filterId(rule)
  return fieldId
    ? [fieldId]
    : []
})

const usedSortIds = (
  sorters: readonly Sorter[]
): readonly FieldId[] => sorters.flatMap(sorter => {
  const fieldId = sorterId(sorter)
  return fieldId
    ? [fieldId]
    : []
})

const availableFilterFields = (
  fields: readonly Field[],
  rules: readonly FilterRule[]
) => filterFields(
  fields,
  collectUsedFieldIds(rules, filterId)
)

const availableSorterFields = (
  fields: readonly Field[],
  sorters: readonly Sorter[]
) => filterFields(
  fields,
  collectUsedFieldIds(sorters, sorterId)
)

const availableSorterFieldsAt = (
  fields: readonly Field[],
  sorters: readonly Sorter[],
  index: number
) => {
  const currentFieldId = sorterId(sorters[index] ?? {
    field: undefined
  })

  return filterFields(
    fields,
    collectUsedFieldIds(sorters, sorterId, {
      excludeIndex: index
    }),
    currentFieldId
  )
}

export const queryFieldOptions = {
  filterId,
  sorterId,
  used: {
    filterIds: usedFilterIds,
    sortIds: usedSortIds
  },
  available: {
    filter: availableFilterFields,
    sort: availableSorterFields,
    sortAt: availableSorterFieldsAt
  }
} as const
