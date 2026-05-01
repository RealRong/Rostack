import {
  analyzeFilterRule,
  cloneFilterRule,
  createFilterRule,
  createFilterOptionSetValue,
  getFilterPresetIds,
  hasFilterPreset,
  matchFilterRule,
  patchFilterRule,
  readFilterOptionSetValue,
  sameFilterRule
} from './rule'
import {
  cloneFilterRules,
  cloneFilterState,
  filterRuleAccess,
  normalizeFilterRules,
  normalizeFilterState,
  sameFilterRules,
  sameFilterState,
  writeFilterClear,
  writeFilterCreate,
  writeFilterInsert,
  writeFilterMove,
  writeFilterMode,
  writeFilterPatch,
  writeFilterRemove
} from './state'
import {
  filterConfig
} from './config'

export type {
  FilterEditorKind,
  FilterFamily,
  FilterFamilyConfig,
  FilterPreset,
  FilterQueryAnalysis,
  FilterRuleAnalysis
} from './types'

export const filter = {
  state: {
    clone: cloneFilterState,
    normalize: normalizeFilterState,
    same: sameFilterState,
    write: {
      mode: writeFilterMode
    }
  },
  rule: {
    same: sameFilterRule,
    clone: cloneFilterRule,
    presetIds: getFilterPresetIds,
    hasPreset: hasFilterPreset,
    create: createFilterRule,
    patch: patchFilterRule,
    match: matchFilterRule,
    analyze: analyzeFilterRule
  },
  rules: {
    read: {
      clone: cloneFilterRules,
      normalize: normalizeFilterRules,
      same: sameFilterRules,
      ...filterRuleAccess
    },
    write: {
      create: writeFilterCreate,
      insert: writeFilterInsert,
      move: writeFilterMove,
      patch: writeFilterPatch,
      remove: writeFilterRemove,
      clear: writeFilterClear
    }
  },
  value: {
    optionSet: {
      create: createFilterOptionSetValue,
      read: readFilterOptionSetValue
    }
  }
} as const

export { filterConfig }
