import type {
  FieldId,
  Sort,
  SortDirection,
  SortRule,
  ViewSortRuleId,
} from '@dataview/core/types'
import { createId } from '@shared/core'

const createSortRuleId = (): ViewSortRuleId => createId('sort') as ViewSortRuleId

const EMPTY_SORT_RULES: SortRule[] = []

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
    direction: source.direction === 'desc' ? 'desc' : 'asc',
  }
}

export const cloneSortRule = (
  rule: SortRule
): SortRule => ({
  id: rule.id,
  fieldId: rule.fieldId,
  direction: rule.direction,
})

export const sameSortRule = (
  left: SortRule,
  right: SortRule
): boolean => (
  left.id === right.id
  && left.fieldId === right.fieldId
  && left.direction === right.direction
)

export const cloneSortRules = (
  rules: readonly SortRule[]
): SortRule[] => rules.map(cloneSortRule)

export const normalizeSortRule = (
  rule: unknown
): SortRule | undefined => normalizeSortRuleShape(rule)

export const normalizeSortRules = (
  rules: unknown
): SortRule[] => (
  Array.isArray(rules)
    ? rules.flatMap((rule) => {
        const normalized = normalizeSortRuleShape(rule)
        return normalized ? [normalized] : []
      })
    : EMPTY_SORT_RULES
)

export const sameSortRules = (
  left: readonly SortRule[],
  right: readonly SortRule[]
) => (
  left.length === right.length
  && left.every((rule, index) => {
    const nextRule = right[index]
    return Boolean(nextRule && sameSortRule(rule, nextRule))
  })
)

export const getSortRule = (
  rules: readonly SortRule[],
  id: ViewSortRuleId
): SortRule | undefined => rules.find((rule) => rule.id === id)

export const listSortRules = (
  rules: readonly SortRule[]
): SortRule[] => cloneSortRules(rules)

const findSortRuleIdByFieldId = (
  rules: readonly SortRule[],
  fieldId: FieldId,
  exceptId?: ViewSortRuleId
): ViewSortRuleId | undefined => rules.find((rule) => (
  rule.id !== exceptId
  && rule.fieldId === fieldId
))?.id

export const hasSortField = (
  rules: readonly SortRule[],
  fieldId: FieldId,
  exceptId?: ViewSortRuleId
): boolean => Boolean(findSortRuleIdByFieldId(rules, fieldId, exceptId))

export const assertSortFieldAvailable = (
  rules: readonly SortRule[],
  fieldId: FieldId,
  exceptId?: ViewSortRuleId
) => {
  if (findSortRuleIdByFieldId(rules, fieldId, exceptId)) {
    throw new Error(`Sort rule already exists for field ${fieldId}`)
  }
}

export const cloneSortState = (
  sort: Sort
): Sort => ({
  rules: cloneSortRules(sort.rules),
})

export const sameSortState = (
  left: Sort,
  right: Sort
): boolean => sameSortRules(left.rules, right.rules)

export const normalizeSortState = (
  sort: unknown
): Sort => {
  const source = typeof sort === 'object' && sort !== null
    ? sort as {
        rules?: unknown
      }
    : undefined

  return {
    rules: normalizeSortRules(source?.rules),
  }
}

export const writeSortCreate = (
  sort: Sort,
  fieldId: FieldId,
  direction: SortDirection = 'asc'
): {
  sort: Sort
  id: ViewSortRuleId
} => writeSortInsert(sort, {
  fieldId,
  direction,
})

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
  if (sort.rules.some((rule) => rule.id === id)) {
    throw new Error(`Sort rule already exists: ${id}`)
  }

  const rule: SortRule = {
    id,
    fieldId: input.fieldId,
    direction: input.direction ?? 'asc',
  }

  const nextRules = sort.rules.filter((entry) => entry.id !== id)
  const beforeId = input.before ?? undefined

  if (beforeId) {
    const beforeIndex = nextRules.findIndex((entry) => entry.id === beforeId)
    if (beforeIndex < 0) {
      throw new Error(`Unknown sort rule ${beforeId}`)
    }
    nextRules.splice(beforeIndex, 0, rule)
  } else {
    nextRules.push(rule)
  }

  return {
    id,
    sort: {
      rules: nextRules,
    },
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
    fieldId: nextFieldId,
  })
  if (
    currentRule.fieldId === nextRule.fieldId
    && currentRule.direction === nextRule.direction
  ) {
    return sort
  }

  return {
    rules: sort.rules.map((rule) => rule.id === id ? nextRule : cloneSortRule(rule)),
  }
}

export const writeSortMove = (
  sort: Sort,
  id: ViewSortRuleId,
  beforeId?: ViewSortRuleId | null
): Sort => {
  const currentRule = getSortRule(sort.rules, id)
  if (!currentRule) {
    throw new Error(`Unknown sort rule ${id}`)
  }

  const nextRules = sort.rules.filter((rule) => rule.id !== id)
  if (beforeId) {
    const beforeIndex = nextRules.findIndex((rule) => rule.id === beforeId)
    if (beforeIndex === -1) {
      throw new Error(`Unknown sort rule ${beforeId}`)
    }
    nextRules.splice(beforeIndex, 0, currentRule)
  } else {
    nextRules.push(currentRule)
  }

  return sameSortRules(sort.rules, nextRules)
    ? sort
    : {
        rules: nextRules,
      }
}

export const writeSortRemove = (
  sort: Sort,
  id: ViewSortRuleId
): Sort => {
  const nextRules = sort.rules.filter((rule) => rule.id !== id)
  if (nextRules.length === sort.rules.length) {
    throw new Error(`Unknown sort rule ${id}`)
  }

  return {
    rules: nextRules,
  }
}

export const writeSortClear = (
  sort: Sort
): Sort => (
  sort.rules.length
    ? {
        rules: EMPTY_SORT_RULES,
      }
    : sort
)
