import {
  sameFilterRule
} from '@dataview/core/filter'
import {
  sameGroup
} from '@dataview/core/group'
import {
  sameSearch
} from '@dataview/core/search'
import {
  sameSorters
} from '@dataview/core/sort'
import type { DocumentViewQuery } from '@dataview/core/contracts'

export const isSameViewQuery = (
  left: DocumentViewQuery,
  right: DocumentViewQuery
) => {
  if (!sameSearch(left.search, right.search)) {
    return false
  }
  if (left.filter.mode !== right.filter.mode) {
    return false
  }
  if (left.filter.rules.length !== right.filter.rules.length) {
    return false
  }
  if (!sameSorters(left.sort, right.sort)) {
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

  return true
}
