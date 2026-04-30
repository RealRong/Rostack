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
  ids: []
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
    ids?: unknown
  }
  if (!source.byId || typeof source.byId !== 'object' || !Array.isArray(source.ids)) {
    return EMPTY_SORT_RULES
  }

  const byId = source.byId as Record<string, unknown>
  return entityTable.normalize.list(source.ids.flatMap(ruleId => {
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
): ViewSortRuleId | undefined => rules.ids.find(ruleId => {
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
  return writeSortInsert(sort, {
    fieldId,
    direction
  })
}

export const writeSortInsert = (
  sort: Sort,
  input: {
    id?: ViewSortRuleId
    fieldId: FieldId
    direction?: SortDirection
    before?: ViewSortRuleId | null
  }
): {
  sort: Sort
  id: ViewSortRuleId
} => {
  assertSortFieldAvailable(sort.rules, input.fieldId)

  const id = input.id ?? createSortRuleId()
  if (sort.rules.byId[id]) {
    throw new Error(`Sort rule already exists: ${id}`)
  }

  const rule: SortRule = {
    id,
    fieldId: input.fieldId,
    direction: input.direction ?? 'asc'
  }

  const inserted = entityTable.write.put(sort.rules, rule)
  const nextIds = inserted.ids.filter((ruleId) => ruleId !== id)
  const beforeId = input.before ?? undefined

  if (beforeId) {
    if (!inserted.byId[beforeId]) {
      throw new Error(`Unknown sort rule ${beforeId}`)
    }

    const beforeIndex = nextIds.indexOf(beforeId)
    if (beforeIndex < 0) {
      throw new Error(`Unknown sort rule ${beforeId}`)
    }

    nextIds.splice(beforeIndex, 0, id)
  } else {
    nextIds.push(id)
  }

  return {
    id,
    sort: createSortState({
      byId: inserted.byId,
      ids: nextIds
    })
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

  const nextIds = sort.rules.ids.filter(ruleId => ruleId !== id)
  if (beforeId) {
    const beforeIndex = nextIds.indexOf(beforeId)
    if (beforeIndex === -1) {
      throw new Error(`Unknown sort rule ${beforeId}`)
    }
    nextIds.splice(beforeIndex, 0, id)
  } else {
    nextIds.push(id)
  }

  return nextIds.every((ruleId, index) => ruleId === sort.rules.ids[index])
    ? sort
    : createSortState({
        byId: {
          ...sort.rules.byId
        },
        ids: nextIds
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
  sort.rules.ids.length
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
