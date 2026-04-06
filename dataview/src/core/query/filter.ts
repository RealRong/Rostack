import type {
  Field,
  FilterRule
} from '@dataview/core/contracts'
import { createDefaultFieldFilterRule } from '@dataview/core/field'
import type { ViewQuery } from './contracts'
import { cloneFilterRule, cloneViewQuery } from './shared'

export const findViewFilterIndex = (
  query: ViewQuery,
  fieldId: string
) => query.filter.rules.findIndex(rule => (
  typeof rule.field === 'string' && rule.field === fieldId
))

export const addViewFilter = (
  query: ViewQuery,
  field: Field
) => {
  if (findViewFilterIndex(query, field.id) !== -1) {
    return query
  }

  const next = cloneViewQuery(query)
  next.filter.rules.push(createDefaultFieldFilterRule(field))
  return next
}

export const setViewFilter = (
  query: ViewQuery,
  index: number,
  rule: FilterRule
): ViewQuery => {
  if (!query.filter.rules[index]) {
    return query
  }

  const next = cloneViewQuery(query)
  next.filter.rules[index] = cloneFilterRule(rule)
  return next
}

export const removeViewFilter = (
  query: ViewQuery,
  index: number
): ViewQuery => {
  if (index < 0 || index >= query.filter.rules.length) {
    return query
  }

  const next = cloneViewQuery(query)
  next.filter.rules.splice(index, 1)
  return next
}
