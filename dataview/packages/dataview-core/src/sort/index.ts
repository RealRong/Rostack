import { compareSortRecords } from '@dataview/core/sort/compare'
import {
  cloneSortRule,
  cloneSortRules,
  normalizeSortRule,
  normalizeSortRules,
  sameSortRules,
  sortRuleAccess,
  writeSortClear,
  writeSortCreate,
  writeSortMove,
  writeSortPatch,
  writeSortRemove
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
    ...sortRuleAccess
  },
  write: {
    create: writeSortCreate,
    patch: writeSortPatch,
    move: writeSortMove,
    remove: writeSortRemove,
    clear: writeSortClear
  },
  compare: {
    records: compareSortRecords
  }
} as const
