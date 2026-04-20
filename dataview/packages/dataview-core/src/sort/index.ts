import { compareSortRecords } from '@dataview/core/sort/compare'
import {
  add,
  clear,
  cloneSortRule,
  cloneSortRules,
  indexOfSortRule,
  keepOnly,
  move,
  normalizeSortRule,
  normalizeSortRules,
  remove,
  replace,
  sameSortRules,
  upsert
} from '@dataview/core/sort/state'

export const sort = {
  rule: {
    clone: cloneSortRule,
    normalize: normalizeSortRule
  },
  rules: {
    clone: cloneSortRules,
    normalize: normalizeSortRules,
    same: sameSortRules,
    indexOf: indexOfSortRule
  },
  write: {
    add,
    upsert,
    keepOnly,
    replace,
    remove,
    move,
    clear
  },
  compare: {
    records: compareSortRecords
  }
} as const
