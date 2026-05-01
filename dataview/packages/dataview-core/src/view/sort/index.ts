import { compareSortRecords } from './compare'
import {
  cloneSortRule,
  cloneSortState,
  cloneSortRules,
  getSortRule,
  hasSortField,
  listSortRules,
  normalizeSortRule,
  normalizeSortState,
  normalizeSortRules,
  sameSortRule,
  sameSortState,
  sameSortRules,
  assertSortFieldAvailable,
  writeSortClear,
  writeSortCreate,
  writeSortInsert,
  writeSortMove,
  writeSortPatch,
  writeSortRemove
} from './state'

export const sort = {
  state: {
    clone: cloneSortState,
    normalize: normalizeSortState,
    same: sameSortState
  },
  rule: {
    clone: cloneSortRule,
    normalize: normalizeSortRule,
    same: sameSortRule
  },
  rules: {
    read: {
      clone: cloneSortRules,
      normalize: normalizeSortRules,
      same: sameSortRules,
      list: listSortRules,
      get: getSortRule,
      hasField: hasSortField,
      assertFieldAvailable: assertSortFieldAvailable
    },
    write: {
      create: writeSortCreate,
      insert: writeSortInsert,
      patch: writeSortPatch,
      move: writeSortMove,
      remove: writeSortRemove,
      clear: writeSortClear
    }
  },
  compare: {
    records: compareSortRecords
  }
} as const
