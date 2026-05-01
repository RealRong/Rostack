import {
  applyFilterPreset,
  createFilterRule,
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
} from './spec'
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
  writeFilterInsert,
  writeFilterMove,
  writeFilterMode,
  writeFilterPatch,
  writeFilterRemove
} from './state'
import { planFilterCandidateLookup } from './plan'

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
} from './types'
export type {
  FilterCandidateLookupPlan
} from './plan'

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
    spec: getFilterSpec,
    presetIds: getFilterPresetIds,
    hasPreset: hasFilterPreset,
    create: createFilterRule,
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
  },
  plan: {
    candidateLookup: planFilterCandidateLookup
  }
} as const

export { planFilterCandidateLookup }
