import {
  applyFilterPreset,
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
} from './filterSpec'
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
} from './filterState'
import { planFilterCandidateLookup } from './filterPlan'

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
} from './filterTypes'
export type {
  FilterCandidateLookupPlan
} from './filterPlan'

export const filter = {
  state: {
    clone: cloneFilterState,
    normalize: normalizeFilterState,
    same: sameFilterState
  },
  rule: {
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
    insert: writeFilterInsert,
    move: writeFilterMove,
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
  },
  plan: {
    candidateLookup: planFilterCandidateLookup
  }
} as const

export { planFilterCandidateLookup }
