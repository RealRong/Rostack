import type {
  GroupProperty,
  GroupFilterRule
} from '@/core/contracts'
import { createDefaultPropertyFilterRule } from '@/core/property'
import type { GroupViewQuery } from './contracts'
import { cloneFilterRule, cloneViewQuery } from './shared'

export const findViewFilterIndex = (
  query: GroupViewQuery,
  propertyId: string
) => query.filter.rules.findIndex(rule => (
  typeof rule.property === 'string' && rule.property === propertyId
))

export const addViewFilter = (
  query: GroupViewQuery,
  property: Pick<GroupProperty, 'id' | 'kind'>
) => {
  if (findViewFilterIndex(query, property.id) !== -1) {
    return query
  }

  const next = cloneViewQuery(query)
  next.filter.rules.push(createDefaultPropertyFilterRule(property))
  return next
}

export const setViewFilter = (
  query: GroupViewQuery,
  index: number,
  rule: GroupFilterRule
): GroupViewQuery => {
  if (!query.filter.rules[index]) {
    return query
  }

  const next = cloneViewQuery(query)
  next.filter.rules[index] = cloneFilterRule(rule)
  return next
}

export const removeViewFilter = (
  query: GroupViewQuery,
  index: number
): GroupViewQuery => {
  if (index < 0 || index >= query.filter.rules.length) {
    return query
  }

  const next = cloneViewQuery(query)
  next.filter.rules.splice(index, 1)
  return next
}
