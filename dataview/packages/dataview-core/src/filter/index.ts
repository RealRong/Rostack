import {
  applyFilterPreset,
  cloneFilterRule,
  createDefaultFilterRule,
  createFilterOptionSetValue,
  deriveFilterRuleDefaultValue,
  getFilterBucketLookup,
  getFilterEditorKind,
  getFilterPlanDemand,
  getFilterPresetIds,
  getFilterSortLookup,
  getFilterSpec,
  hasFilterPreset,
  isFilterRuleEffective,
  matchFilterRule,
  normalizeFilterRule,
  projectFilterRuleValue,
  readFilterOptionSetValue,
  setFilterRuleValue
} from '@dataview/core/filter/spec'
import {
  cloneFilterRules,
  cloneFilterState,
  filterRuleAccess,
  normalizeFilterRules,
  normalizeFilterState,
  sameFilterRules,
  sameFilterState,
  sameFilterRule,
  writeFilterClear,
  writeFilterCreate,
  writeFilterMode,
  writeFilterPatch,
  writeFilterRemove
} from '@dataview/core/filter/state'

export type {
  FilterBucketLookup,
  FilterCandidateSpec,
  FilterCreateSpec,
  FilterEditorKind,
  FilterPlanDemand,
  FilterPlanSpec,
  FilterPreset,
  FilterSortLookup,
  FilterSpec
} from '@dataview/core/filter/types'

export const filter = {
  state: {
    clone: cloneFilterState,
    normalize: normalizeFilterState,
    same: sameFilterState
  },
  rule: {
    clone: cloneFilterRule,
    same: sameFilterRule,
    spec: getFilterSpec,
    presetIds: getFilterPresetIds,
    hasPreset: hasFilterPreset,
    create: createDefaultFilterRule,
    applyPreset: applyFilterPreset,
    editorKind: getFilterEditorKind,
    effective: isFilterRuleEffective,
    match: matchFilterRule,
    project: projectFilterRuleValue,
    planDemand: getFilterPlanDemand,
    bucketLookup: getFilterBucketLookup,
    sortLookup: getFilterSortLookup,
    defaultValue: deriveFilterRuleDefaultValue,
    setValue: setFilterRuleValue,
    normalize: normalizeFilterRule
  },
  rules: {
    clone: cloneFilterRules,
    normalize: normalizeFilterRules,
    same: sameFilterRules,
    ...filterRuleAccess
  },
  write: {
    create: writeFilterCreate,
    patch: writeFilterPatch,
    mode: writeFilterMode,
    remove: writeFilterRemove,
    clear: writeFilterClear
  },
  value: {
    optionSet: {
      create: createFilterOptionSetValue,
      read: readFilterOptionSetValue
    }
  }
} as const
