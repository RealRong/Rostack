import type {
  EntityTable,
  FieldId,
  Sort,
  SortDirection,
  SortRule,
  ViewSortRuleId
} from '@dataview/core/types'
import { createId, entityTable } from '@shared/core'

const createSortRuleId = (): ViewSortRuleId => createId('sort') as ViewSortRuleId

const EMPTY_SORT_RULES: EntityTable<ViewSortRuleId, SortRule> = {
  byId: {} as Record<ViewSortRuleId, SortRule>,
  order: []
}

const normalizeSortRuleShape = (
  value: unknown
): SortRule | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const source = value as {
    id?: unknown
    fieldId?: unknown
    direction?: unknown
  }
  if (typeof source.id !== 'string' || typeof source.fieldId !== 'string') {
    return undefined
  }

  return {
    id: source.id,
    fieldId: source.fieldId,
    direction: source.direction === 'desc'
      ? 'desc'
      : 'asc'
  }
}

export const cloneSortRule = (
  rule: SortRule
): SortRule => ({
  id: rule.id,
  fieldId: rule.fieldId,
  direction: rule.direction
})

export const cloneSortRules = (
  rules: EntityTable<ViewSortRuleId, SortRule>
): EntityTable<ViewSortRuleId, SortRule> => entityTable.clone.table(rules)

export const normalizeSortRule = (
  rule: unknown
): SortRule | undefined => normalizeSortRuleShape(rule)

export const normalizeSortRules = (
  rules: unknown
): EntityTable<ViewSortRuleId, SortRule> => {
  if (typeof rules !== 'object' || rules === null) {
    return EMPTY_SORT_RULES
  }

  const source = rules as {
    byId?: unknown
    order?: unknown
  }
  if (!source.byId || typeof source.byId !== 'object' || !Array.isArray(source.order)) {
    return EMPTY_SORT_RULES
  }

  const byId = source.byId as Record<string, unknown>
  return entityTable.normalize.list(source.order.flatMap(ruleId => {
    if (typeof ruleId !== 'string') {
      return []
    }

    const rule = normalizeSortRuleShape(byId[ruleId])
    return rule
      ? [rule]
      : []
  }))
}

export const sameSortRules = (
  left: EntityTable<ViewSortRuleId, SortRule>,
  right: EntityTable<ViewSortRuleId, SortRule>
) => (
  left.order.length === right.order.length
  && left.order.every((ruleId, index) => {
    const rightId = right.order[index]
    const leftRule = left.byId[ruleId]
    const rightRule = rightId
      ? right.byId[rightId]
      : undefined
    return Boolean(
      rightId
      && leftRule
      && rightRule
      && leftRule.id === rightRule.id
      && leftRule.fieldId === rightRule.fieldId
      && leftRule.direction === rightRule.direction
    )
  })
)

const getSortRule = (
  rules: EntityTable<ViewSortRuleId, SortRule>,
  id: ViewSortRuleId
): SortRule | undefined => entityTable.read.get(rules, id)

const listSortRules = (
  rules: EntityTable<ViewSortRuleId, SortRule>
): SortRule[] => entityTable.read.list(rules)

const findSortRuleIdByFieldId = (
  rules: EntityTable<ViewSortRuleId, SortRule>,
  fieldId: FieldId,
  exceptId?: ViewSortRuleId
): ViewSortRuleId | undefined => rules.order.find(ruleId => {
  if (ruleId === exceptId) {
    return false
  }

  return rules.byId[ruleId]?.fieldId === fieldId
})

const assertSortFieldAvailable = (
  rules: EntityTable<ViewSortRuleId, SortRule>,
  fieldId: FieldId,
  exceptId?: ViewSortRuleId
) => {
  if (findSortRuleIdByFieldId(rules, fieldId, exceptId)) {
    throw new Error(`Sort rule already exists for field ${fieldId}`)
  }
}

const createSortState = (
  rules: EntityTable<ViewSortRuleId, SortRule>
): Sort => ({
  rules
})

export const writeSortCreate = (
  sort: Sort,
  fieldId: FieldId,
  direction: SortDirection = 'asc'
): {
  sort: Sort
  id: ViewSortRuleId
} => {
  assertSortFieldAvailable(sort.rules, fieldId)

  const id = createSortRuleId()
  const rule: SortRule = {
    id,
    fieldId,
    direction
  }

  return {
    id,
    sort: createSortState(entityTable.write.put(sort.rules, rule))
  }
}

export const writeSortPatch = (
  sort: Sort,
  id: ViewSortRuleId,
  patch: Partial<Pick<SortRule, 'fieldId' | 'direction'>>
): Sort => {
  const currentRule = getSortRule(sort.rules, id)
  if (!currentRule) {
    throw new Error(`Unknown sort rule ${id}`)
  }

  const nextFieldId = patch.fieldId ?? currentRule.fieldId
  if (nextFieldId !== currentRule.fieldId) {
    assertSortFieldAvailable(sort.rules, nextFieldId, id)
  }

  const nextRule = cloneSortRule({
    ...currentRule,
    ...patch,
    fieldId: nextFieldId
  })
  if (
    currentRule.fieldId === nextRule.fieldId
    && currentRule.direction === nextRule.direction
  ) {
    return sort
  }

  return createSortState(entityTable.write.patch(sort.rules, id, nextRule))
}

export const writeSortMove = (
  sort: Sort,
  id: ViewSortRuleId,
  beforeId?: ViewSortRuleId | null
): Sort => {
  if (!sort.rules.byId[id]) {
    throw new Error(`Unknown sort rule ${id}`)
  }
  if (beforeId && !sort.rules.byId[beforeId]) {
    throw new Error(`Unknown sort rule ${beforeId}`)
  }

  const nextOrder = sort.rules.order.filter(ruleId => ruleId !== id)
  if (beforeId) {
    const beforeIndex = nextOrder.indexOf(beforeId)
    if (beforeIndex === -1) {
      throw new Error(`Unknown sort rule ${beforeId}`)
    }
    nextOrder.splice(beforeIndex, 0, id)
  } else {
    nextOrder.push(id)
  }

  return nextOrder.every((ruleId, index) => ruleId === sort.rules.order[index])
    ? sort
    : createSortState({
        byId: {
          ...sort.rules.byId
        },
        order: nextOrder
      })
}

export const writeSortRemove = (
  sort: Sort,
  id: ViewSortRuleId
): Sort => {
  const nextRules = entityTable.write.remove(sort.rules, id)
  if (nextRules === sort.rules) {
    throw new Error(`Unknown sort rule ${id}`)
  }

  return createSortState(nextRules)
}

export const writeSortClear = (
  sort: Sort
): Sort => (
  sort.rules.order.length
    ? createSortState(EMPTY_SORT_RULES)
    : sort
)

export const sortRuleAccess = {
  list: listSortRules,
  get: getSortRule,
  hasField: (
    rules: EntityTable<ViewSortRuleId, SortRule>,
    fieldId: FieldId,
    exceptId?: ViewSortRuleId
  ) => Boolean(findSortRuleIdByFieldId(rules, fieldId, exceptId)),
  assertFieldAvailable: assertSortFieldAvailable
} as const
