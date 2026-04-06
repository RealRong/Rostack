import type { ViewQuery } from './contracts'
import {
  sameFilterRule,
  sameGroup,
  sameStringArray
} from './shared'

export const isSameViewQuery = (
  left: ViewQuery,
  right: ViewQuery
) => {
  if (left.search.query !== right.search.query) {
    return false
  }
  if (!sameStringArray(left.search.fields, right.search.fields)) {
    return false
  }
  if (left.filter.mode !== right.filter.mode) {
    return false
  }
  if (left.filter.rules.length !== right.filter.rules.length) {
    return false
  }
  if (left.sorters.length !== right.sorters.length) {
    return false
  }
  if (!sameGroup(left.group, right.group)) {
    return false
  }

  for (let index = 0; index < left.filter.rules.length; index += 1) {
    const leftRule = left.filter.rules[index]
    const rightRule = right.filter.rules[index]
    if (!leftRule || !rightRule || !sameFilterRule(leftRule, rightRule)) {
      return false
    }
  }

  for (let index = 0; index < left.sorters.length; index += 1) {
    const leftSorter = left.sorters[index]
    const rightSorter = right.sorters[index]
    if (
      !leftSorter
      || !rightSorter
      || leftSorter.field !== rightSorter.field
      || leftSorter.direction !== rightSorter.direction
    ) {
      return false
    }
  }

  return true
}
