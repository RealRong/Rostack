import type {
  DateValue,
  Field,
  FieldId,
  FilterValuePreview,
  FilterOptionSetValue,
  FilterPresetId,
  FilterRule
} from '@dataview/core/contracts'
import {
  KANBAN_EMPTY_BUCKET_KEY
} from '@dataview/core/contracts'
import {
  field as fieldApi
} from '@dataview/core/field'
import type {
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
import {
  normalizeOptionIdList
} from '@dataview/core/shared/option'
import type {
  Token
} from '@shared/i18n'
import {
  tokenDate,
  tokenRef
} from '@shared/i18n'

const defineFilterPreset = (
  id: FilterPresetId,
  operator: FilterPreset['operator'],
  options?: {
    valueMode?: FilterPreset['valueMode']
    fixedValue?: FilterPreset['fixedValue']
  }
): FilterPreset => ({
  id,
  operator,
  valueMode: options?.valueMode ?? 'editable',
  ...(options?.fixedValue !== undefined
    ? { fixedValue: structuredClone(options.fixedValue) }
    : {})
})

const TEXT_PRESETS = [
  defineFilterPreset('contains', 'contains'),
  defineFilterPreset('eq', 'eq'),
  defineFilterPreset('neq', 'neq'),
  defineFilterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  defineFilterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

const NUMBER_PRESETS = [
  defineFilterPreset('eq', 'eq'),
  defineFilterPreset('neq', 'neq'),
  defineFilterPreset('gt', 'gt'),
  defineFilterPreset('gte', 'gte'),
  defineFilterPreset('lt', 'lt'),
  defineFilterPreset('lte', 'lte'),
  defineFilterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  defineFilterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

const OPTION_PRESETS = [
  defineFilterPreset('eq', 'eq'),
  defineFilterPreset('neq', 'neq'),
  defineFilterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  defineFilterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

const MULTI_OPTION_PRESETS = [
  defineFilterPreset('contains', 'contains'),
  defineFilterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  defineFilterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

const BOOLEAN_PRESETS = [
  defineFilterPreset('checked', 'eq', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  defineFilterPreset('unchecked', 'eq', {
    valueMode: 'fixed',
    fixedValue: false
  }),
  defineFilterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  defineFilterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

const PRESENCE_PRESETS = [
  defineFilterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  defineFilterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

const isFilterOptionSetValue = (
  value: unknown
): value is FilterOptionSetValue => (
  typeof value === 'object'
  && value !== null
  && (value as { kind?: unknown }).kind === 'option-set'
  && Array.isArray((value as { optionIds?: unknown }).optionIds)
)

export const createFilterOptionSetValue = (
  optionIds: readonly string[] = []
): FilterOptionSetValue => ({
  kind: 'option-set',
  optionIds: normalizeOptionIdList(optionIds)
})

export const readFilterOptionSetValue = (
  value: unknown
): FilterOptionSetValue => {
  if (isFilterOptionSetValue(value)) {
    return createFilterOptionSetValue(value.optionIds)
  }

  if (Array.isArray(value)) {
    return createFilterOptionSetValue(value.filter((item): item is string => typeof item === 'string'))
  }

  if (typeof value === 'string' && value.trim()) {
    return createFilterOptionSetValue([value.trim()])
  }

  return createFilterOptionSetValue()
}

const cloneFilterValue = (value: FilterRule['value']) => (
  value === undefined
    ? undefined
    : structuredClone(value)
)

const cloneRule = (rule: FilterRule): FilterRule => ({
  fieldId: rule.fieldId,
  presetId: rule.presetId,
  ...(rule.value !== undefined
    ? { value: cloneFilterValue(rule.value) }
    : {})
})

const readExpectedValue = (
  preset: FilterPreset,
  rule: FilterRule
) => (
  preset.valueMode === 'fixed'
    ? preset.fixedValue
    : rule.value
)

const hasOptionSetValue = (
  value: unknown
): boolean => readFilterOptionSetValue(value).optionIds.length > 0

const isOptionField = (
  field: Field | undefined
) => field?.kind === 'select' || field?.kind === 'status'

const isOptionSetField = (
  field: Field | undefined
) => isOptionField(field) || field?.kind === 'multiSelect'

const createEditableValue = (
  field: Field | undefined
): FilterRule['value'] => {
  if (isOptionSetField(field)) {
    return createFilterOptionSetValue()
  }

  if (field?.kind === 'number' || field?.kind === 'date') {
    return undefined
  }

  return ''
}

const normalizeEditableValue = (
  editorKind: FilterEditorKind,
  value: unknown
): FilterRule['value'] => {
  switch (editorKind) {
    case 'text':
      return typeof value === 'string' ? value : ''
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined
    case 'date': {
      const dateValue = value as DateValue | undefined
      return dateValue?.kind === 'date' || dateValue?.kind === 'datetime'
        ? structuredClone(dateValue)
        : undefined
    }
    case 'option-set':
      return readFilterOptionSetValue(value)
    case 'none':
    default:
      return undefined
  }
}

const matchTextContains = (
  value: unknown,
  expected: unknown
) => {
  const query = String(expected ?? '').trim().toLowerCase()
  if (!query) {
    return false
  }

  return fieldApi.value.searchable(value).some(token => (
    token.toLowerCase().includes(query)
  ))
}

const matchOptionSet = (
  field: Field | undefined,
  value: unknown,
  expected: unknown
) => {
  const optionIds = readFilterOptionSetValue(expected).optionIds
  if (!optionIds.length) {
    return false
  }

  if (field?.kind === 'multiSelect') {
    return Array.isArray(value)
      ? value.some(item => typeof item === 'string' && optionIds.includes(item))
      : false
  }

  return typeof value === 'string' && optionIds.includes(value)
}

const projectSingleValue = (
  value: Token
): FilterValuePreview => ({
  kind: 'single',
  value
})

const projectOptionSetValue = (
  field: Field | undefined,
  value: unknown
): FilterValuePreview => {
  const optionIds = readFilterOptionSetValue(value).optionIds
  if (!optionIds.length) {
    return {
      kind: 'none'
    }
  }

  return {
    kind: 'multi',
    values: optionIds.map(optionId => (
      field && field.kind !== 'title'
        ? fieldApi.option.read.get(field, optionId)?.name ?? optionId
        : optionId
    ))
  }
}

const EMPTY_PLAN_DEMAND: FilterPlanDemand = Object.freeze({})
const EMPTY_FILTER_VALUE_PREVIEW: FilterValuePreview = Object.freeze({
  kind: 'none'
})

const readPreset = <TPreset extends FilterPreset>(
  presets: readonly TPreset[],
  rule: FilterRule
): TPreset => presets.find(item => item.id === rule.presetId) ?? presets[0]!

const matchExistsValue = (
  value: unknown,
  expected: unknown
) => expected === false
  ? fieldApi.value.empty(value)
  : !fieldApi.value.empty(value)

const optionBucketLookup = (
  mode: FilterBucketLookup['mode'],
  keys: readonly string[]
): FilterBucketLookup => ({
  mode,
  keys
})

const sortLookup = (
  mode: FilterSortLookup['mode'],
  value?: FilterRule['value']
): FilterSortLookup => ({
  mode,
  ...(value === undefined
    ? {}
    : { value })
})

const matchComparableValue = (
  field: Field | undefined,
  recordValue: unknown,
  expected: unknown,
  operator: FilterPreset['operator']
) => {
  const comparison = fieldApi.compare.value(field, recordValue, expected)
  switch (operator) {
    case 'eq':
      return comparison === 0
    case 'neq':
      return comparison !== 0
    case 'gt':
      return comparison > 0
    case 'gte':
      return comparison >= 0
    case 'lt':
      return comparison < 0
    case 'lte':
    default:
      return comparison <= 0
  }
}

const readSortedFilterLookup = (
  rule: FilterRule
): FilterSortLookup | undefined => {
  switch (rule.presetId) {
    case 'eq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return sortLookup(rule.presetId, rule.value)
    case 'exists_true':
      return sortLookup('exists')
    default:
      return undefined
  }
}

const createSortedFilterSpec = (input: {
  editorKind: 'number' | 'date'
  isEffectiveValue: (value: unknown) => boolean
  projectValue: (rule: FilterRule) => FilterValuePreview
  deriveDefaultValue: FilterCreateSpec['deriveDefaultValue']
}): FilterSpec => createFilterSpec({
  presets: NUMBER_PRESETS,
  defaultPresetId: 'eq',
  getEditorKind: (_field, rule) => (
    readPreset(NUMBER_PRESETS, rule).valueMode === 'editable'
      ? input.editorKind
      : 'none'
  ),
  isEffective: (_field, rule) => {
    const preset = readPreset(NUMBER_PRESETS, rule)
    return preset.valueMode === 'editable'
      ? input.isEffectiveValue(rule.value)
      : true
  },
  match: (field, recordValue, rule) => {
    const preset = readPreset(NUMBER_PRESETS, rule)
    const expected = readExpectedValue(preset, rule)
    return preset.operator === 'exists'
      ? matchExistsValue(recordValue, expected)
      : matchComparableValue(field, recordValue, expected, preset.operator)
  },
  projectValue: (_field, rule) => input.projectValue(rule),
  plan: {
    demandOf: ({ rule }) => readSortedFilterLookup(rule)
      ? {
          sorted: true
        }
      : EMPTY_PLAN_DEMAND
  },
  candidate: {
    sortLookupOf: ({ rule }) => readSortedFilterLookup(rule)
  },
  create: {
    deriveDefaultValue: input.deriveDefaultValue
  }
})

const createOptionBucketFilterSpec = (input: {
  presets: readonly FilterPreset[]
  defaultPresetId: FilterPresetId
  matchValue: (field: Field | undefined, recordValue: unknown, expected: unknown, rule: FilterRule) => boolean
  bucketDemand: readonly FilterPresetId[]
  bucketLookupOf: (rule: FilterRule, optionIds: readonly string[]) => FilterBucketLookup | undefined
  deriveDefaultValue: FilterCreateSpec['deriveDefaultValue']
}): FilterSpec => createFilterSpec({
  presets: input.presets,
  defaultPresetId: input.defaultPresetId,
  getEditorKind: (_field, rule) => (
    readPreset(input.presets, rule).valueMode === 'editable'
      ? 'option-set'
      : 'none'
  ),
  isEffective: (_field, rule) => {
    const preset = readPreset(input.presets, rule)
    return preset.valueMode === 'editable'
      ? hasOptionSetValue(rule.value)
      : true
  },
  match: (field, recordValue, rule) => {
    const preset = readPreset(input.presets, rule)
    const expected = readExpectedValue(preset, rule)
    return preset.operator === 'exists'
      ? matchExistsValue(recordValue, expected)
      : input.matchValue(field, recordValue, expected, rule)
  },
  projectValue: projectOptionSetValue,
  plan: {
    demandOf: ({ rule }) => input.bucketDemand.includes(rule.presetId)
      ? {
          bucket: true
        }
      : EMPTY_PLAN_DEMAND
  },
  candidate: {
    bucketLookupOf: ({ rule }) => input.bucketLookupOf(
      rule,
      readFilterOptionSetValue(rule.value).optionIds
    )
  },
  create: {
    deriveDefaultValue: input.deriveDefaultValue
  }
})

const deriveTextDefaultValue = (
  field: Field,
  rule: FilterRule
): {
  fieldId: FieldId
  value: unknown
} | undefined => (
  rule.presetId === 'eq' && typeof rule.value === 'string'
    ? {
        fieldId: field.id,
        value: rule.value
      }
    : undefined
)

const deriveNumberDefaultValue = (
  field: Field,
  rule: FilterRule
): {
  fieldId: FieldId
  value: unknown
} | undefined => (
  rule.presetId === 'eq'
  && typeof rule.value === 'number'
  && Number.isFinite(rule.value)
    ? {
        fieldId: field.id,
        value: rule.value
      }
    : undefined
)

const deriveDateDefaultValue = (
  field: Field,
  rule: FilterRule
): {
  fieldId: FieldId
  value: unknown
} | undefined => (
  rule.presetId === 'eq'
  && fieldApi.date.value.comparableTimestamp(rule.value) !== undefined
    ? {
        fieldId: field.id,
        value: structuredClone(rule.value)
      }
    : undefined
)

const deriveSingleOptionDefaultValue = (
  field: Field,
  rule: FilterRule
): {
  fieldId: FieldId
  value: unknown
} | undefined => {
  if (rule.presetId !== 'eq') {
    return undefined
  }

  const optionIds = readFilterOptionSetValue(rule.value).optionIds
  return optionIds.length
    ? {
        fieldId: field.id,
        value: optionIds[0]
      }
    : undefined
}

const deriveMultiOptionDefaultValue = (
  field: Field,
  rule: FilterRule
): {
  fieldId: FieldId
  value: unknown
} | undefined => {
  if (rule.presetId !== 'contains') {
    return undefined
  }

  const optionIds = readFilterOptionSetValue(rule.value).optionIds
  return optionIds.length
    ? {
        fieldId: field.id,
        value: [...optionIds]
      }
    : undefined
}

const deriveBooleanDefaultValue = (
  field: Field,
  rule: FilterRule
): {
  fieldId: FieldId
  value: unknown
} | undefined => (
  rule.presetId === 'checked'
    ? {
        fieldId: field.id,
        value: true
      }
    : rule.presetId === 'unchecked'
      ? {
          fieldId: field.id,
          value: false
        }
      : undefined
)

const createFilterSpec = (input: {
  presets: readonly FilterPreset[]
  defaultPresetId: FilterPresetId
  getEditorKind: (field: Field | undefined, rule: FilterRule) => FilterEditorKind
  isEffective: (field: Field | undefined, rule: FilterRule) => boolean
  match: (field: Field | undefined, recordValue: unknown, rule: FilterRule) => boolean
  projectValue: (field: Field | undefined, rule: FilterRule) => FilterValuePreview
  plan?: FilterPlanSpec
  candidate?: FilterCandidateSpec
  create?: FilterCreateSpec
}): FilterSpec => {
  const presetById = new Map(input.presets.map(preset => [preset.id, preset] as const))

  const getActivePreset = (
    _field: Field | undefined,
    rule: FilterRule
  ) => presetById.get(rule.presetId) ?? input.presets[0]

  return {
    presets: input.presets,
    getDefaultRule: field => {
      const preset = presetById.get(input.defaultPresetId) ?? input.presets[0]
      const nextRule: FilterRule = {
        fieldId: field.id,
        presetId: preset.id
      }

      if (preset.valueMode === 'editable') {
        const value = createEditableValue(field)
        if (value !== undefined) {
          nextRule.value = value
        }
      }

      return nextRule
    },
    getActivePreset,
    applyPreset: (field, rule, presetId) => {
      const nextPreset = presetById.get(presetId) ?? input.presets[0]
      const currentPreset = getActivePreset(field, rule)
      const nextRule: FilterRule = {
        fieldId: rule.fieldId,
        presetId: nextPreset.id
      }

      if (nextPreset.valueMode !== 'editable') {
        return nextRule
      }

      const editorKind = input.getEditorKind(field, {
        fieldId: rule.fieldId,
        presetId: nextPreset.id
      })
      const nextValue = currentPreset.valueMode === 'editable'
        ? normalizeEditableValue(editorKind, rule.value)
        : createEditableValue(field)

      if (nextValue !== undefined) {
        nextRule.value = nextValue
      }

      return nextRule
    },
    getEditorKind: input.getEditorKind,
    isEffective: input.isEffective,
    match: input.match,
    projectValue: input.projectValue,
    plan: input.plan ?? {
      demandOf: () => EMPTY_PLAN_DEMAND
    },
    ...(input.candidate
      ? {
          candidate: input.candidate
        }
      : {}),
    ...(input.create
      ? {
          create: input.create
        }
      : {})
  }
}

const textFilterSpec = createFilterSpec({
  presets: TEXT_PRESETS,
  defaultPresetId: 'contains',
  getEditorKind: (_field, rule) => {
    const preset = readPreset(TEXT_PRESETS, rule)
    return preset.valueMode === 'editable' ? 'text' : 'none'
  },
  isEffective: (_field, rule) => {
    const preset = readPreset(TEXT_PRESETS, rule)
    return preset.valueMode === 'editable'
      ? typeof rule.value === 'string' && rule.value.trim().length > 0
      : true
  },
  match: (field, recordValue, rule) => {
    const preset = readPreset(TEXT_PRESETS, rule)
    const expected = readExpectedValue(preset, rule)
    if (preset.operator === 'exists') {
      return matchExistsValue(recordValue, expected)
    }
    if (preset.operator === 'contains') {
      return matchTextContains(recordValue, expected)
    }
    if (preset.operator === 'eq') {
      return fieldApi.compare.value(field, recordValue, expected) === 0
    }

    return fieldApi.compare.value(field, recordValue, expected) !== 0
  },
  projectValue: (_field, rule) => (
    typeof rule.value === 'string' && rule.value.length
      ? projectSingleValue(rule.value)
      : EMPTY_FILTER_VALUE_PREVIEW
  ),
  create: {
    deriveDefaultValue: ({ field, rule }) => deriveTextDefaultValue(field, rule)
  }
})

const numberFilterSpec = createSortedFilterSpec({
  editorKind: 'number',
  isEffectiveValue: value => typeof value === 'number' && Number.isFinite(value),
  projectValue: rule => (
    typeof rule.value === 'number' && Number.isFinite(rule.value)
      ? projectSingleValue(rule.value)
      : EMPTY_FILTER_VALUE_PREVIEW
  ),
  deriveDefaultValue: ({ field, rule }) => deriveNumberDefaultValue(field, rule)
})

const dateFilterSpec = createSortedFilterSpec({
  editorKind: 'date',
  isEffectiveValue: value => fieldApi.date.value.comparableTimestamp(value) !== undefined,
  projectValue: rule => (
    rule.value && typeof rule.value === 'object' && ('kind' in rule.value)
      ? projectSingleValue(tokenDate(rule.value as DateValue))
      : EMPTY_FILTER_VALUE_PREVIEW
  ),
  deriveDefaultValue: ({ field, rule }) => deriveDateDefaultValue(field, rule)
})

const optionFilterSpec = createOptionBucketFilterSpec({
  presets: OPTION_PRESETS,
  defaultPresetId: 'eq',
  matchValue: (field, recordValue, expected, rule) => {
    const preset = readPreset(OPTION_PRESETS, rule)
    const match = matchOptionSet(field, recordValue, expected)
    return preset.operator === 'neq' ? !match : match
  },
  bucketDemand: ['eq', 'neq', 'exists_true', 'exists_false'],
  bucketLookupOf: (rule, optionIds) => {
    switch (rule.presetId) {
      case 'eq':
        return optionBucketLookup('include', optionIds)
      case 'neq':
        return optionBucketLookup('exclude', optionIds)
      case 'exists_true':
        return optionBucketLookup('exclude', [KANBAN_EMPTY_BUCKET_KEY])
      case 'exists_false':
        return optionBucketLookup('include', [KANBAN_EMPTY_BUCKET_KEY])
      default:
        return undefined
    }
  },
  deriveDefaultValue: ({ field, rule }) => deriveSingleOptionDefaultValue(field, rule)
})

const optionSetFilterSpec = createOptionBucketFilterSpec({
  presets: MULTI_OPTION_PRESETS,
  defaultPresetId: 'contains',
  matchValue: (field, recordValue, expected) => matchOptionSet(field, recordValue, expected),
  bucketDemand: ['contains', 'exists_true', 'exists_false'],
  bucketLookupOf: (rule, optionIds) => {
    switch (rule.presetId) {
      case 'contains':
        return optionBucketLookup('include', optionIds)
      case 'exists_true':
        return optionBucketLookup('exclude', [KANBAN_EMPTY_BUCKET_KEY])
      case 'exists_false':
        return optionBucketLookup('include', [KANBAN_EMPTY_BUCKET_KEY])
      default:
        return undefined
    }
  },
  deriveDefaultValue: ({ field, rule }) => deriveMultiOptionDefaultValue(field, rule)
})

const booleanFilterSpec = createFilterSpec({
  presets: BOOLEAN_PRESETS,
  defaultPresetId: 'checked',
  getEditorKind: () => 'none',
  isEffective: () => true,
  match: (_field, recordValue, rule) => {
    const preset = readPreset(BOOLEAN_PRESETS, rule)
    const expected = readExpectedValue(preset, rule)
    if (preset.operator === 'exists') {
      return matchExistsValue(recordValue, expected)
    }

    return recordValue === expected
  },
  projectValue: (_field, rule) => {
    if (rule.presetId === 'checked') {
      return projectSingleValue(tokenRef('dataview.systemValue', 'value.checked'))
    }

    if (rule.presetId === 'unchecked') {
      return projectSingleValue(tokenRef('dataview.systemValue', 'value.unchecked'))
    }

    return EMPTY_FILTER_VALUE_PREVIEW
  },
  plan: {
    demandOf: ({ rule }) => {
      switch (rule.presetId) {
        case 'checked':
        case 'unchecked':
        case 'exists_true':
        case 'exists_false':
          return {
            bucket: true
          }
        default:
          return EMPTY_PLAN_DEMAND
      }
    }
  },
  candidate: {
    bucketLookupOf: ({ rule }) => {
      switch (rule.presetId) {
        case 'checked':
          return optionBucketLookup('include', ['true'])
        case 'unchecked':
          return optionBucketLookup('include', ['false'])
        case 'exists_true':
          return optionBucketLookup('exclude', [KANBAN_EMPTY_BUCKET_KEY])
        case 'exists_false':
          return optionBucketLookup('include', [KANBAN_EMPTY_BUCKET_KEY])
        default:
          return undefined
      }
    }
  },
  create: {
    deriveDefaultValue: ({ field, rule }) => deriveBooleanDefaultValue(field, rule)
  }
})

const presenceFilterSpec = createFilterSpec({
  presets: PRESENCE_PRESETS,
  defaultPresetId: 'exists_true',
  getEditorKind: () => 'none',
  isEffective: () => true,
  match: (_field, recordValue, rule) => {
    const preset = readPreset(PRESENCE_PRESETS, rule)
    const expected = readExpectedValue(preset, rule)
    return matchExistsValue(recordValue, expected)
  },
  projectValue: (_field, rule) => (
    rule.presetId === 'exists_true'
      ? projectSingleValue(tokenRef('dataview.systemValue', 'value.hasValue'))
      : rule.presetId === 'exists_false'
        ? projectSingleValue(tokenRef('dataview.systemValue', 'value.empty'))
        : EMPTY_FILTER_VALUE_PREVIEW
  )
})

const filterSpecsByKind = {
  title: textFilterSpec,
  text: textFilterSpec,
  url: textFilterSpec,
  email: textFilterSpec,
  phone: textFilterSpec,
  number: numberFilterSpec,
  date: dateFilterSpec,
  select: optionFilterSpec,
  multiSelect: optionSetFilterSpec,
  status: optionFilterSpec,
  boolean: booleanFilterSpec,
  asset: presenceFilterSpec
} as const satisfies Record<Field['kind'], FilterSpec>

export const getFilterSpec = (
  field?: Pick<Field, 'kind'>
): FilterSpec => filterSpecsByKind[field?.kind ?? 'text']

export const getFilterPresetIds = (
  field?: Pick<Field, 'kind'>
): readonly FilterPresetId[] => getFilterSpec(field).presets.map(preset => preset.id)

export const hasFilterPreset = (
  field: Field | undefined,
  presetId: FilterPresetId
): boolean => getFilterSpec(field).presets.some(preset => preset.id === presetId)

export const createDefaultFilterRule = (
  field: Field
): FilterRule => getFilterSpec(field).getDefaultRule(field)

export const applyFilterPreset = (
  field: Field | undefined,
  rule: FilterRule,
  presetId: FilterPresetId
): FilterRule => getFilterSpec(field).applyPreset(field, rule, presetId)

export const getFilterEditorKind = (
  field: Field | undefined,
  rule: FilterRule
): FilterEditorKind => getFilterSpec(field).getEditorKind(field, rule)

export const isFilterRuleEffective = (
  field: Field | undefined,
  rule: FilterRule
): boolean => getFilterSpec(field).isEffective(field, rule)

export const matchFilterRule = (
  field: Field | undefined,
  recordValue: unknown,
  rule: FilterRule
): boolean => getFilterSpec(field).match(field, recordValue, rule)

export const projectFilterRuleValue = (
  field: Field | undefined,
  rule: FilterRule
): FilterValuePreview => getFilterSpec(field).projectValue(field, rule)

export const getFilterPlanDemand = (
  field: Field | undefined,
  rule: FilterRule
): FilterPlanDemand => getFilterSpec(field).plan.demandOf({
  field,
  rule
})

export const getFilterBucketLookup = (
  field: Field | undefined,
  rule: FilterRule
): FilterBucketLookup | undefined => getFilterSpec(field).candidate?.bucketLookupOf?.({
  field,
  rule
})

export const getFilterSortLookup = (
  field: Field | undefined,
  rule: FilterRule
): FilterSortLookup | undefined => getFilterSpec(field).candidate?.sortLookupOf?.({
  field,
  rule
})

export const deriveFilterRuleDefaultValue = (
  field: Field,
  rule: FilterRule
): {
  fieldId: FieldId
  value: unknown
} | undefined => getFilterSpec(field).create?.deriveDefaultValue?.({
  field,
  rule
})

export const setFilterRuleValue = (
  field: Field | undefined,
  rule: FilterRule,
  value: unknown
): FilterRule => {
  const spec = getFilterSpec(field)
  const preset = spec.getActivePreset(field, rule)
  if (preset.valueMode !== 'editable') {
    return {
      fieldId: rule.fieldId,
      presetId: rule.presetId
    }
  }

  const nextValue = normalizeEditableValue(spec.getEditorKind(field, rule), value)
  return {
    fieldId: rule.fieldId,
    presetId: rule.presetId,
    ...(nextValue !== undefined
      ? { value: nextValue }
      : {})
  }
}

export const normalizeFilterRule = (
  field: Field | undefined,
  rule: Partial<FilterRule> & Pick<FilterRule, 'fieldId'>
): FilterRule => {
  const spec = getFilterSpec(field)
  const preset = spec.presets.find(item => item.id === rule.presetId) ?? spec.presets[0]
  const nextRule: FilterRule = {
    fieldId: rule.fieldId,
    presetId: preset.id
  }

  if (preset.valueMode === 'editable') {
    const nextValue = normalizeEditableValue(spec.getEditorKind(field, nextRule), rule.value)
    if (nextValue !== undefined) {
      nextRule.value = nextValue
    }
  }

  return nextRule
}

export const cloneFilterRule = (rule: FilterRule): FilterRule => cloneRule(rule)
