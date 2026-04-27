import type {
  Field,
  FieldId,
  FilterRule,
  SortRule
} from '@dataview/core/types'

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

const sortRuleFieldId = (
  rule: Pick<SortRule, 'fieldId'>
): FieldId | undefined => typeof rule.fieldId === 'string'
  ? rule.fieldId
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
  rules: readonly SortRule[]
): readonly FieldId[] => rules.flatMap(rule => {
  const fieldId = sortRuleFieldId(rule)
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
  rules: readonly SortRule[]
) => filterFields(
  fields,
  collectUsedFieldIds(rules, sortRuleFieldId)
)

const availableSorterFieldsAt = (
  fields: readonly Field[],
  rules: readonly SortRule[],
  ruleId: SortRule['id']
) => {
  const currentFieldId = rules.find(rule => rule.id === ruleId)?.fieldId

  return filterFields(
    fields,
    collectUsedFieldIds(rules, sortRuleFieldId, {
      excludeIndex: rules.findIndex(rule => rule.id === ruleId)
    }),
    currentFieldId
  )
}

export const queryFieldOptions = {
  filterId,
  sortRuleFieldId,
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
