import type {
  Field,
  FilterRule
} from '@dataview/core/contracts'
import {
  applyFilterPreset,
  createDefaultFilterRule,
  setFilterRuleValue
} from '@dataview/core/filter'
import type { ViewQuery } from './contracts'
import { cloneFilterRule, cloneViewQuery } from './shared'

export const findViewFilterIndex = (
  query: ViewQuery,
  fieldId: string
) => query.filter.rules.findIndex(rule => rule.fieldId === fieldId)

export const addViewFilter = (
  query: ViewQuery,
  field: Field
) => {
  if (findViewFilterIndex(query, field.id) !== -1) {
    return query
  }

  const next = cloneViewQuery(query)
  next.filter.rules.push(createDefaultFilterRule(field))
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

export const setViewFilterPreset = (
  query: ViewQuery,
  index: number,
  field: Field | undefined,
  presetId: string
): ViewQuery => {
  const currentRule = query.filter.rules[index]
  if (!currentRule) {
    return query
  }

  const next = cloneViewQuery(query)
  next.filter.rules[index] = applyFilterPreset(field, currentRule, presetId)
  return next
}

export const setViewFilterValue = (
  query: ViewQuery,
  index: number,
  field: Field | undefined,
  value: FilterRule['value']
): ViewQuery => {
  const currentRule = query.filter.rules[index]
  if (!currentRule) {
    return query
  }

  const next = cloneViewQuery(query)
  next.filter.rules[index] = setFilterRuleValue(field, currentRule, value)
  return next
}

export const setViewFilterMode = (
  query: ViewQuery,
  mode: ViewQuery['filter']['mode']
): ViewQuery => {
  if (query.filter.mode === mode) {
    return query
  }

  const next = cloneViewQuery(query)
  next.filter.mode = mode
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
