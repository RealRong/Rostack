import type {
  Field,
  FieldId,
  FilterRule
} from '@dataview/core/contracts'

export const getFilterFieldId = (
  rule: Pick<FilterRule, 'field'>
): FieldId | undefined => {
  if (typeof rule.field !== 'string') {
    return undefined
  }

  return rule.field
}

const getFilterFieldIds = (
  rules: readonly FilterRule[]
): Set<FieldId> => {
  const fieldIds = new Set<FieldId>()

  rules.forEach(rule => {
    const fieldId = getFilterFieldId(rule)
    if (fieldId) {
      fieldIds.add(fieldId)
    }
  })

  return fieldIds
}

export const getAvailableFilterFields = (
  fields: readonly Field[],
  rules: readonly FilterRule[]
) => {
  const usedFieldIds = getFilterFieldIds(rules)
  return fields.filter(field => !usedFieldIds.has(field.id))
}
