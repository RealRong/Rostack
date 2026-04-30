import { compareSortRecords } from './sortCompare'
import {
  cloneSortRule,
  cloneSortRules,
  normalizeSortRule,
  normalizeSortRules,
  sameSortRules,
  sortRuleAccess,
  writeSortClear,
  writeSortCreate,
  writeSortInsert,
  writeSortMove,
  writeSortPatch,
  writeSortRemove
} from './sortState'

export const sort = {
  rule: {
    clone: cloneSortRule,
    normalize: normalizeSortRule
  },
  rules: {
    clone: cloneSortRules,
    normalize: normalizeSortRules,
    same: sameSortRules,
    ...sortRuleAccess
  },
  write: {
    create: writeSortCreate,
    insert: writeSortInsert,
    patch: writeSortPatch,
    move: writeSortMove,
    remove: writeSortRemove,
    clear: writeSortClear
  },
  compare: {
    records: compareSortRecords
  }
} as const
