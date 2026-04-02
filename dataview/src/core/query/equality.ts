import type { GroupViewQuery } from './contracts'
import {
  sameFilterRule,
  sameGroup,
  sameStringArray
} from './shared'

export const isSameViewQuery = (
  left: GroupViewQuery,
  right: GroupViewQuery
) => {
  if (left.search.query !== right.search.query) {
    return false
  }
  if (!sameStringArray(left.search.properties, right.search.properties)) {
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
      || leftSorter.property !== rightSorter.property
      || leftSorter.direction !== rightSorter.direction
    ) {
      return false
    }
  }

  return true
}
