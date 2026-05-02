import type {
  Field,
  FieldId,
  Filter,
  FilterRule,
  ViewFilterRuleId,
} from '@dataview/core/types'
import { createId } from '@shared/core'
import {
  createFilterRule,
  patchFilterRule,
  sameFilterRule,
} from './rule'

const createFilterRuleId = (): ViewFilterRuleId => createId('filter') as ViewFilterRuleId

const EMPTY_FILTER_RULES: FilterRule[] = []

const normalizeFilterRuleShape = (
  value: unknown
): FilterRule | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const source = value as {
    id?: unknown
    fieldId?: unknown
    presetId?: unknown
    value?: unknown
  }
  if (typeof source.id !== 'string' || typeof source.fieldId !== 'string') {
    return undefined
  }

  return {
    id: source.id,
    fieldId: source.fieldId,
    presetId: typeof source.presetId === 'string'
      ? source.presetId
      : '',
    ...(Object.prototype.hasOwnProperty.call(source, 'value')
      ? { value: structuredClone(source.value) as FilterRule['value'] }
      : {}),
  }
}

export const cloneFilterRules = (
  rules: readonly FilterRule[]
): FilterRule[] => rules.map((rule) => structuredClone(rule))

const listFilterRules = (
  rules: readonly FilterRule[]
): FilterRule[] => cloneFilterRules(rules)

const getFilterRule = (
  rules: readonly FilterRule[],
  id: ViewFilterRuleId
): FilterRule | undefined => rules.find((rule) => rule.id === id)

const findFilterRuleIdByFieldId = (
  rules: readonly FilterRule[],
  fieldId: FieldId,
  exceptId?: ViewFilterRuleId
): ViewFilterRuleId | undefined => rules.find((rule) => (
  rule.id !== exceptId
  && rule.fieldId === fieldId
))?.id

const assertFilterFieldAvailable = (
  rules: readonly FilterRule[],
  fieldId: FieldId,
  exceptId?: ViewFilterRuleId
) => {
  if (findFilterRuleIdByFieldId(rules, fieldId, exceptId)) {
    throw new Error(`Filter rule already exists for field ${fieldId}`)
  }
}

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
    ? rules.flatMap((rule) => {
        const normalized = normalizeFilterRuleShape(rule)
        return normalized ? [normalized] : []
      })
    : EMPTY_FILTER_RULES
)

export const cloneFilterState = (
  left: Filter
): Filter => ({
  mode: left.mode,
  rules: cloneFilterRules(left.rules),
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
    rules: normalizeFilterRules(source?.rules),
  }
}

export const writeFilterCreate = (
  filter: Filter,
  field: Field
): {
  filter: Filter
  id: ViewFilterRuleId
} => writeFilterInsert(filter, field, {})

export const writeFilterInsert = (
  filter: Filter,
  field: Field,
  input: {
    id?: ViewFilterRuleId
    presetId?: string
    value?: FilterRule['value']
    before?: ViewFilterRuleId | null
  }
): {
  filter: Filter
  id: ViewFilterRuleId
} => {
  assertFilterFieldAvailable(filter.rules, field.id)

  const id = input.id ?? createFilterRuleId()
  if (filter.rules.some((rule) => rule.id === id)) {
    throw new Error(`Filter rule already exists: ${id}`)
  }

  const rule = createFilterRule(field, {
    id,
    ...(input.presetId !== undefined ? { presetId: input.presetId } : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'value') ? { value: input.value } : {}),
  })

  const nextRules = filter.rules.filter((entry) => entry.id !== id)
  const beforeId = input.before ?? undefined

  if (beforeId !== undefined) {
    const beforeIndex = nextRules.findIndex((entry) => entry.id === beforeId)
    if (beforeIndex < 0) {
      throw new Error(`Unknown filter rule ${beforeId}`)
    }
    nextRules.splice(beforeIndex, 0, rule)
  } else {
    nextRules.push(rule)
  }

  return {
    id,
    filter: {
      mode: filter.mode,
      rules: nextRules,
    },
  }
}

export const writeFilterPatch = (
  filter: Filter,
  id: ViewFilterRuleId,
  patch: Partial<Pick<FilterRule, 'fieldId' | 'presetId' | 'value'>>,
  field?: Field
): Filter => {
  const currentRule = getFilterRule(filter.rules, id)
  if (!currentRule) {
    throw new Error(`Unknown filter rule ${id}`)
  }

  if (patch.fieldId !== undefined) {
    assertFilterFieldAvailable(filter.rules, patch.fieldId, id)
  }

  const nextRule = patchFilterRule(field, currentRule, patch)
  if (sameFilterRule(currentRule, nextRule)) {
    return filter
  }

  return {
    mode: filter.mode,
    rules: filter.rules.map((rule) => rule.id === id ? nextRule : structuredClone(rule)),
  }
}

export const writeFilterMode = (
  filter: Filter,
  mode: Filter['mode']
): Filter => {
  if (filter.mode === mode) {
    return filter
  }

  return {
    mode,
    rules: cloneFilterRules(filter.rules),
  }
}

export const writeFilterRemove = (
  filter: Filter,
  id: ViewFilterRuleId
): Filter => {
  const nextRules = filter.rules.filter((rule) => rule.id !== id)
  if (nextRules.length === filter.rules.length) {
    throw new Error(`Unknown filter rule ${id}`)
  }

  return {
    mode: filter.mode,
    rules: nextRules,
  }
}

export const writeFilterMove = (
  filter: Filter,
  id: ViewFilterRuleId,
  beforeId?: ViewFilterRuleId | null
): Filter => {
  const currentRule = getFilterRule(filter.rules, id)
  if (!currentRule) {
    throw new Error(`Unknown filter rule ${id}`)
  }

  const nextRules = filter.rules.filter((rule) => rule.id !== id)
  if (beforeId) {
    const beforeIndex = nextRules.findIndex((rule) => rule.id === beforeId)
    if (beforeIndex < 0) {
      throw new Error(`Unknown filter rule ${beforeId}`)
    }
    nextRules.splice(beforeIndex, 0, currentRule)
  } else {
    nextRules.push(currentRule)
  }

  return sameFilterRules(filter.rules, nextRules)
    ? filter
    : {
        mode: filter.mode,
        rules: nextRules,
      }
}

export const writeFilterClear = (
  filter: Filter
): Filter => (
  filter.rules.length
    ? {
        mode: filter.mode,
        rules: EMPTY_FILTER_RULES,
      }
    : filter
)

export const filterRuleAccess = {
  list: listFilterRules,
  get: getFilterRule,
  hasField: (
    rules: readonly FilterRule[],
    fieldId: FieldId,
    exceptId?: ViewFilterRuleId
  ) => Boolean(findFilterRuleIdByFieldId(rules, fieldId, exceptId)),
  assertFieldAvailable: assertFilterFieldAvailable,
} as const
