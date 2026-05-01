import type {
  EntityTable,
  Field,
  FieldId,
  Filter,
  FilterRule,
  ViewFilterRuleId
} from '@dataview/core/types'
import { createId, entityTable, equal } from '@shared/core'
import {
  applyFilterPreset,
  cloneFilterRule,
  createDefaultFilterRule,
  normalizeFilterRule,
  setFilterRuleValue
} from '@dataview/core/view/filterSpec'

const createFilterRuleId = (): ViewFilterRuleId => createId('filter') as ViewFilterRuleId

const EMPTY_FILTER_RULES: EntityTable<ViewFilterRuleId, FilterRule> = {
  byId: {} as Record<ViewFilterRuleId, FilterRule>,
  ids: []
}

const hasValue = (
  value: unknown
) => value !== undefined

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
      : {})
  }
}

export const cloneFilterRules = (
  rules: EntityTable<ViewFilterRuleId, FilterRule>
): EntityTable<ViewFilterRuleId, FilterRule> => entityTable.clone.table(rules)

const listFilterRules = (
  rules: EntityTable<ViewFilterRuleId, FilterRule>
): FilterRule[] => entityTable.read.list(rules)

const getFilterRule = (
  rules: EntityTable<ViewFilterRuleId, FilterRule>,
  id: ViewFilterRuleId
): FilterRule | undefined => entityTable.read.get(rules, id)

const findFilterRuleIdByFieldId = (
  rules: EntityTable<ViewFilterRuleId, FilterRule>,
  fieldId: FieldId,
  exceptId?: ViewFilterRuleId
): ViewFilterRuleId | undefined => rules.ids.find(ruleId => {
  if (ruleId === exceptId) {
    return false
  }

  return rules.byId[ruleId]?.fieldId === fieldId
})

const assertFilterFieldAvailable = (
  rules: EntityTable<ViewFilterRuleId, FilterRule>,
  fieldId: FieldId,
  exceptId?: ViewFilterRuleId
) => {
  if (findFilterRuleIdByFieldId(rules, fieldId, exceptId)) {
    throw new Error(`Filter rule already exists for field ${fieldId}`)
  }
}

export const sameFilterRule = (
  left: FilterRule,
  right: FilterRule
) => (
  left.id === right.id
  && left.fieldId === right.fieldId
  && left.presetId === right.presetId
  && equal.sameJsonValue(left.value, right.value)
)

export const sameFilterRules = (
  left: EntityTable<ViewFilterRuleId, FilterRule>,
  right: EntityTable<ViewFilterRuleId, FilterRule>
) => (
  left.ids.length === right.ids.length
  && left.ids.every((ruleId, index) => {
    const rightId = right.ids[index]
    const leftRule = left.byId[ruleId]
    const rightRule = rightId
      ? right.byId[rightId]
      : undefined
    return Boolean(
      rightId
      && leftRule
      && rightRule
      && sameFilterRule(leftRule, rightRule)
    )
  })
)

export const normalizeFilterRules = (
  rules: unknown
): EntityTable<ViewFilterRuleId, FilterRule> => {
  if (typeof rules !== 'object' || rules === null) {
    return EMPTY_FILTER_RULES
  }

  const source = rules as {
    byId?: unknown
    ids?: unknown
  }
  if (!source.byId || typeof source.byId !== 'object' || !Array.isArray(source.ids)) {
    return EMPTY_FILTER_RULES
  }

  const byId = source.byId as Record<string, unknown>
  return entityTable.normalize.list(source.ids.flatMap(ruleId => {
    if (typeof ruleId !== 'string') {
      return []
    }

    const rule = normalizeFilterRuleShape(byId[ruleId])
    return rule
      ? [rule]
      : []
  }))
}

export const cloneFilterState = (
  left: Filter
): Filter => ({
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

export const writeFilterCreate = (
  filter: Filter,
  field: Field
): {
  filter: Filter
  id: ViewFilterRuleId
} => {
  return writeFilterInsert(filter, field, {})
}

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
  if (filter.rules.byId[id]) {
    throw new Error(`Filter rule already exists: ${id}`)
  }

  let rule = createDefaultFilterRule(id, field)
  if (input.presetId !== undefined) {
    rule = applyFilterPreset(field, rule, input.presetId)
  }
  if (Object.prototype.hasOwnProperty.call(input, 'value')) {
    rule = setFilterRuleValue(field, rule, input.value)
  }

  const inserted = entityTable.write.put(filter.rules, rule)
  const nextIds = inserted.ids.filter((ruleId) => ruleId !== id)
  const beforeId = input.before ?? undefined

  if (beforeId !== undefined) {
    if (!inserted.byId[beforeId]) {
      throw new Error(`Unknown filter rule ${beforeId}`)
    }

    const beforeIndex = nextIds.indexOf(beforeId)
    if (beforeIndex < 0) {
      throw new Error(`Unknown filter rule ${beforeId}`)
    }

    nextIds.splice(beforeIndex, 0, id)
  } else {
    nextIds.push(id)
  }

  return {
    id,
    filter: {
      mode: filter.mode,
      rules: {
        byId: inserted.byId,
        ids: nextIds
      }
    }
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

  let nextRule = currentRule
  if (patch.fieldId !== undefined) {
    assertFilterFieldAvailable(filter.rules, patch.fieldId, id)
    nextRule = normalizeFilterRule(field, {
      id,
      fieldId: patch.fieldId,
      presetId: patch.presetId ?? currentRule.presetId,
      ...(hasValue(patch.value)
        ? { value: patch.value }
        : hasValue(currentRule.value)
          ? { value: currentRule.value }
          : {})
    })
  } else {
    if (patch.presetId !== undefined) {
      nextRule = applyFilterPreset(field, nextRule, patch.presetId)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'value')) {
      nextRule = setFilterRuleValue(field, nextRule, patch.value)
    }
  }

  if (sameFilterRule(currentRule, nextRule)) {
    return filter
  }

  return {
    mode: filter.mode,
    rules: entityTable.write.patch(filter.rules, id, cloneFilterRule(nextRule))
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
    rules: cloneFilterRules(filter.rules)
  }
}

export const writeFilterRemove = (
  filter: Filter,
  id: ViewFilterRuleId
): Filter => {
  const nextRules = entityTable.write.remove(filter.rules, id)
  if (nextRules === filter.rules) {
    throw new Error(`Unknown filter rule ${id}`)
  }

  return {
    mode: filter.mode,
    rules: nextRules
  }
}

export const writeFilterMove = (
  filter: Filter,
  id: ViewFilterRuleId,
  beforeId?: ViewFilterRuleId | null
): Filter => {
  if (!filter.rules.byId[id]) {
    throw new Error(`Unknown filter rule ${id}`)
  }
  if (beforeId && !filter.rules.byId[beforeId]) {
    throw new Error(`Unknown filter rule ${beforeId}`)
  }

  const nextIds = filter.rules.ids.filter((ruleId) => ruleId !== id)
  if (beforeId) {
    const beforeIndex = nextIds.indexOf(beforeId)
    if (beforeIndex < 0) {
      throw new Error(`Unknown filter rule ${beforeId}`)
    }
    nextIds.splice(beforeIndex, 0, id)
  } else {
    nextIds.push(id)
  }

  return nextIds.every((ruleId, index) => ruleId === filter.rules.ids[index])
    ? filter
    : {
        mode: filter.mode,
        rules: {
          byId: {
            ...filter.rules.byId
          },
          ids: nextIds
        }
      }
}

export const writeFilterClear = (
  filter: Filter
): Filter => (
  filter.rules.ids.length
    ? {
        mode: filter.mode,
        rules: EMPTY_FILTER_RULES
      }
    : filter
)

export const filterRuleAccess = {
  list: listFilterRules,
  get: getFilterRule,
  hasField: (
    rules: EntityTable<ViewFilterRuleId, FilterRule>,
    fieldId: FieldId,
    exceptId?: ViewFilterRuleId
  ) => Boolean(findFilterRuleIdByFieldId(rules, fieldId, exceptId)),
  assertFieldAvailable: assertFilterFieldAvailable
} as const
