import type {
  Field,
  Filter,
  FilterRule
} from '#dataview-core/contracts'
import {
  applyFilterPreset,
  cloneFilterRule,
  createDefaultFilterRule,
  setFilterRuleValue
} from '#dataview-core/filter/spec'

export const sameFilterRule = (
  left: FilterRule,
  right: FilterRule
) => (
  left.fieldId === right.fieldId
  && left.presetId === right.presetId
  && JSON.stringify(left.value) === JSON.stringify(right.value)
)

export const cloneFilter = (
  filter: Filter
): Filter => ({
  mode: filter.mode,
  rules: filter.rules.map(cloneFilterRule)
})

export const sameFilter = (
  left: Filter,
  right: Filter
) => (
  left.mode === right.mode
  && left.rules.length === right.rules.length
  && left.rules.every((rule, index) => {
    const nextRule = right.rules[index]
    return Boolean(nextRule && sameFilterRule(rule, nextRule))
  })
)

export const normalizeFilter = (
  filter: unknown
): Filter => {
  const source = typeof filter === 'object' && filter !== null
    ? filter as {
        mode?: unknown
        rules?: unknown
      }
    : undefined

  return {
    mode: source?.mode === 'or' ? 'or' : 'and',
    rules: Array.isArray(source?.rules)
      ? source.rules
          .filter((rule): rule is {
            fieldId?: unknown
            presetId?: unknown
            value?: unknown
          } => typeof rule === 'object' && rule !== null)
          .map(rule => ({
            fieldId: typeof rule.fieldId === 'string'
              ? rule.fieldId
              : '',
            presetId: typeof rule.presetId === 'string'
              ? rule.presetId
              : '',
            ...(Object.prototype.hasOwnProperty.call(rule, 'value')
              ? { value: structuredClone(rule.value) as FilterRule['value'] }
              : {})
          }))
      : []
  }
}

export const findFilterIndex = (
  filter: Filter,
  fieldId: string
) => filter.rules.findIndex(rule => rule.fieldId === fieldId)

export const addFilterRule = (
  filter: Filter,
  field: Field
): Filter => {
  if (findFilterIndex(filter, field.id) !== -1) {
    return cloneFilter(filter)
  }

  const next = cloneFilter(filter)
  next.rules.push(createDefaultFilterRule(field))
  return next
}

export const replaceFilterRule = (
  filter: Filter,
  index: number,
  rule: FilterRule
): Filter => {
  if (!filter.rules[index]) {
    return cloneFilter(filter)
  }

  const next = cloneFilter(filter)
  next.rules[index] = cloneFilterRule(rule)
  return next
}

export const setFilterPreset = (
  filter: Filter,
  index: number,
  field: Field | undefined,
  presetId: string
): Filter => {
  const currentRule = filter.rules[index]
  if (!currentRule) {
    return cloneFilter(filter)
  }

  const next = cloneFilter(filter)
  next.rules[index] = applyFilterPreset(field, currentRule, presetId)
  return next
}

export const setFilterValue = (
  filter: Filter,
  index: number,
  field: Field | undefined,
  value: FilterRule['value']
): Filter => {
  const currentRule = filter.rules[index]
  if (!currentRule) {
    return cloneFilter(filter)
  }

  const next = cloneFilter(filter)
  next.rules[index] = setFilterRuleValue(field, currentRule, value)
  return next
}

export const setFilterMode = (
  filter: Filter,
  mode: Filter['mode']
): Filter => {
  if (filter.mode === mode) {
    return cloneFilter(filter)
  }

  return {
    ...cloneFilter(filter),
    mode
  }
}

export const removeFilterRule = (
  filter: Filter,
  index: number
): Filter => {
  if (index < 0 || index >= filter.rules.length) {
    return cloneFilter(filter)
  }

  const next = cloneFilter(filter)
  next.rules.splice(index, 1)
  return next
}
