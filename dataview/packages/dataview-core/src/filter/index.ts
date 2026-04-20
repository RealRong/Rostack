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
  cloneFilter,
  filter as filterState,
  findFilterIndex,
  normalizeFilter,
  sameFilter,
  sameFilterRule
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
  ...filterState,
  clone: cloneFilter,
  normalize: normalizeFilter,
  same: sameFilter,
  indexOf: findFilterIndex,
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
  value: {
    optionSet: {
      create: createFilterOptionSetValue,
      read: readFilterOptionSetValue
    }
  }
} as const
