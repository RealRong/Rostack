export type {
  FilterEditorKind,
  FilterPreset,
  FilterSpec
} from '@dataview/core/filter/types'
export {
  applyFilterPreset,
  cloneFilterRule,
  createDefaultFilterRule,
  createFilterOptionSetValue,
  getFilterEditorKind,
  getFilterPresetIds,
  getFilterSpec,
  hasFilterPreset,
  isFilterRuleEffective,
  matchFilterRule,
  normalizeFilterRule,
  projectFilterRuleValue,
  readFilterOptionSetValue,
  setFilterRuleValue
} from '@dataview/core/filter/spec'
export {
  cloneFilter,
  findFilterIndex,
  filter,
  normalizeFilter,
  sameFilter,
  sameFilterRule
} from '@dataview/core/filter/state'
