import type {
  Field,
  Filter,
  FilterRule
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import {
  applyFilterPreset,
  cloneFilterRule,
  createDefaultFilterRule,
  setFilterRuleValue
} from '@dataview/core/filter/spec'

export const sameFilterRule = (
  left: FilterRule,
  right: FilterRule
) => (
  left.fieldId === right.fieldId
  && left.presetId === right.presetId
  && equal.sameJsonValue(left.value, right.value)
)

export const cloneFilterRules = (
  rules: readonly FilterRule[]
): FilterRule[] => rules.map(cloneFilterRule)

export const sameFilterRules = (
  left: readonly FilterRule[],
  right: readonly FilterRule[]
) => (
  left.length === right.length
  && left.every((rule, index) => {
    const nextRule = right[index]
    return Boolean(nextRule && sameFilterRule(rule, nextRule))
  })
)

export const normalizeFilterRules = (
  rules: unknown
): FilterRule[] => (
  Array.isArray(rules)
    ? rules
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
)

export const indexOfFilterRule = (
  rules: readonly FilterRule[],
  fieldId: string
) => rules.findIndex(rule => rule.fieldId === fieldId)

export const cloneFilterState = (
  left: Filter,
) : Filter => ({
  mode: left.mode,
  rules: cloneFilterRules(left.rules)
})

export const sameFilterState = (
  left: Filter,
  right: Filter
) => (
  left.mode === right.mode
  && sameFilterRules(left.rules, right.rules)
)

export const normalizeFilterState = (
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
    rules: normalizeFilterRules(source?.rules)
  }
}

export const writeFilterAdd = (
  filter: Filter,
  field: Field
): Filter => {
  if (indexOfFilterRule(filter.rules, field.id) !== -1) {
    return filter
  }

  const next = cloneFilterState(filter)
  next.rules.push(createDefaultFilterRule(field))
  return next
}

export const writeFilterReplace = (
  filter: Filter,
  index: number,
  rule: FilterRule
): Filter => {
  if (!filter.rules[index]) {
    return filter
  }

  const next = cloneFilterState(filter)
  next.rules[index] = cloneFilterRule(rule)
  return next
}

export const writeFilterPreset = (
  filter: Filter,
  index: number,
  field: Field | undefined,
  presetId: string
): Filter => {
  const currentRule = filter.rules[index]
  if (!currentRule) {
    return filter
  }

  const nextRule = applyFilterPreset(field, currentRule, presetId)
  if (sameFilterRule(currentRule, nextRule)) {
    return filter
  }

  const next = cloneFilterState(filter)
  next.rules[index] = nextRule
  return next
}

export const writeFilterValue = (
  filter: Filter,
  index: number,
  field: Field | undefined,
  value: FilterRule['value']
): Filter => {
  const currentRule = filter.rules[index]
  if (!currentRule) {
    return filter
  }

  const nextRule = setFilterRuleValue(field, currentRule, value)
  if (sameFilterRule(currentRule, nextRule)) {
    return filter
  }

  const next = cloneFilterState(filter)
  next.rules[index] = nextRule
  return next
}

export const writeFilterMode = (
  filter: Filter,
  mode: Filter['mode']
): Filter => {
  if (filter.mode === mode) {
    return filter
  }

  return {
    ...cloneFilterState(filter),
    mode
  }
}

export const writeFilterRemove = (
  filter: Filter,
  index: number
): Filter => {
  if (index < 0 || index >= filter.rules.length) {
    return filter
  }

  const next = cloneFilterState(filter)
  next.rules.splice(index, 1)
  return next
}

export const writeFilterClear = (
  filter: Filter
): Filter => (
  filter.rules.length
    ? {
        ...cloneFilterState(filter),
        rules: []
      }
    : filter
)
