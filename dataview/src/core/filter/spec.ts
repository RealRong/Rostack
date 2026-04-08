import type {
  DateValue,
  Field,
  FilterOptionSetValue,
  FilterPresetId,
  FilterRule
} from '@dataview/core/contracts'
import {
  compareFieldValues,
  getFieldDisplayValue,
  getFieldOption,
  getFieldOptions,
  isEmptyFieldValue,
  normalizeSearchableValue,
  readDateComparableTimestamp
} from '@dataview/core/field'
import type {
  FilterEditorKind,
  FilterPreset,
  FilterSpec
} from './types'

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

const normalizeOptionIds = (
  optionIds: readonly unknown[]
): string[] => {
  const seen = new Set<string>()
  const next: string[] = []

  optionIds.forEach(optionId => {
    if (typeof optionId !== 'string') {
      return
    }

    const normalized = optionId.trim()
    if (!normalized || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    next.push(normalized)
  })

  return next
}

export const createFilterOptionSetValue = (
  optionIds: readonly string[] = []
): FilterOptionSetValue => ({
  kind: 'option-set',
  optionIds: normalizeOptionIds(optionIds)
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

const comparePrimitive = (
  field: Field | undefined,
  left: unknown,
  right: unknown
) => compareFieldValues(field, left, right)

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

const isTextLikeField = (
  field: Field | undefined
) => !field || field.kind === 'title' || field.kind === 'text' || field.kind === 'url' || field.kind === 'email' || field.kind === 'phone'

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

  return normalizeSearchableValue(value).some(token => (
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

const formatOptionSetValueText = (
  field: Field | undefined,
  value: unknown
) => {
  const optionIds = readFilterOptionSetValue(value).optionIds
  if (!optionIds.length) {
    return ''
  }

  return optionIds
    .map(optionId => (
      field && field.kind !== 'title'
        ? getFieldOption(field, optionId)?.name ?? optionId
        : optionId
    ))
    .join(', ')
}

const createFilterSpec = (input: {
  presets: readonly FilterPreset[]
  defaultPresetId: FilterPresetId
  getEditorKind: (field: Field | undefined, rule: FilterRule) => FilterEditorKind
  isEffective: (field: Field | undefined, rule: FilterRule) => boolean
  match: (field: Field | undefined, recordValue: unknown, rule: FilterRule) => boolean
  formatValueText: (field: Field | undefined, rule: FilterRule) => string
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
    formatValueText: input.formatValueText
  }
}

const textFilterSpec = createFilterSpec({
  presets: TEXT_PRESETS,
  defaultPresetId: 'contains',
  getEditorKind: (_field, rule) => {
    const preset = TEXT_PRESETS.find(item => item.id === rule.presetId) ?? TEXT_PRESETS[0]
    return preset.valueMode === 'editable' ? 'text' : 'none'
  },
  isEffective: (_field, rule) => {
    const preset = TEXT_PRESETS.find(item => item.id === rule.presetId) ?? TEXT_PRESETS[0]
    return preset.valueMode === 'editable'
      ? typeof rule.value === 'string' && rule.value.trim().length > 0
      : true
  },
  match: (field, recordValue, rule) => {
    const preset = TEXT_PRESETS.find(item => item.id === rule.presetId) ?? TEXT_PRESETS[0]
    const expected = readExpectedValue(preset, rule)
    if (preset.operator === 'exists') {
      return expected === false
        ? isEmptyFieldValue(recordValue)
        : !isEmptyFieldValue(recordValue)
    }
    if (preset.operator === 'contains') {
      return matchTextContains(recordValue, expected)
    }
    if (preset.operator === 'eq') {
      return comparePrimitive(field, recordValue, expected) === 0
    }

    return comparePrimitive(field, recordValue, expected) !== 0
  },
  formatValueText: (_field, rule) => typeof rule.value === 'string' ? rule.value : ''
})

const numberFilterSpec = createFilterSpec({
  presets: NUMBER_PRESETS,
  defaultPresetId: 'eq',
  getEditorKind: (_field, rule) => {
    const preset = NUMBER_PRESETS.find(item => item.id === rule.presetId) ?? NUMBER_PRESETS[0]
    return preset.valueMode === 'editable' ? 'number' : 'none'
  },
  isEffective: (_field, rule) => {
    const preset = NUMBER_PRESETS.find(item => item.id === rule.presetId) ?? NUMBER_PRESETS[0]
    return preset.valueMode === 'editable'
      ? typeof rule.value === 'number' && Number.isFinite(rule.value)
      : true
  },
  match: (field, recordValue, rule) => {
    const preset = NUMBER_PRESETS.find(item => item.id === rule.presetId) ?? NUMBER_PRESETS[0]
    const expected = readExpectedValue(preset, rule)
    if (preset.operator === 'exists') {
      return expected === false
        ? isEmptyFieldValue(recordValue)
        : !isEmptyFieldValue(recordValue)
    }

    const comparison = comparePrimitive(field, recordValue, expected)
    switch (preset.operator) {
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
  },
  formatValueText: (_field, rule) => typeof rule.value === 'number' ? String(rule.value) : ''
})

const dateFilterSpec = createFilterSpec({
  presets: NUMBER_PRESETS,
  defaultPresetId: 'eq',
  getEditorKind: (_field, rule) => {
    const preset = NUMBER_PRESETS.find(item => item.id === rule.presetId) ?? NUMBER_PRESETS[0]
    return preset.valueMode === 'editable' ? 'date' : 'none'
  },
  isEffective: (_field, rule) => {
    const preset = NUMBER_PRESETS.find(item => item.id === rule.presetId) ?? NUMBER_PRESETS[0]
    return preset.valueMode === 'editable'
      ? readDateComparableTimestamp(rule.value) !== undefined
      : true
  },
  match: (field, recordValue, rule) => {
    const preset = NUMBER_PRESETS.find(item => item.id === rule.presetId) ?? NUMBER_PRESETS[0]
    const expected = readExpectedValue(preset, rule)
    if (preset.operator === 'exists') {
      return expected === false
        ? isEmptyFieldValue(recordValue)
        : !isEmptyFieldValue(recordValue)
    }

    const comparison = comparePrimitive(field, recordValue, expected)
    switch (preset.operator) {
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
  },
  formatValueText: (field, rule) => getFieldDisplayValue(field, rule.value) ?? ''
})

const optionFilterSpec = createFilterSpec({
  presets: OPTION_PRESETS,
  defaultPresetId: 'eq',
  getEditorKind: (_field, rule) => {
    const preset = OPTION_PRESETS.find(item => item.id === rule.presetId) ?? OPTION_PRESETS[0]
    return preset.valueMode === 'editable' ? 'option-set' : 'none'
  },
  isEffective: (_field, rule) => {
    const preset = OPTION_PRESETS.find(item => item.id === rule.presetId) ?? OPTION_PRESETS[0]
    return preset.valueMode === 'editable'
      ? hasOptionSetValue(rule.value)
      : true
  },
  match: (field, recordValue, rule) => {
    const preset = OPTION_PRESETS.find(item => item.id === rule.presetId) ?? OPTION_PRESETS[0]
    const expected = readExpectedValue(preset, rule)
    if (preset.operator === 'exists') {
      return expected === false
        ? isEmptyFieldValue(recordValue)
        : !isEmptyFieldValue(recordValue)
    }

    const match = matchOptionSet(field, recordValue, expected)
    return preset.operator === 'neq' ? !match : match
  },
  formatValueText: formatOptionSetValueText
})

const optionSetFilterSpec = createFilterSpec({
  presets: MULTI_OPTION_PRESETS,
  defaultPresetId: 'contains',
  getEditorKind: (_field, rule) => {
    const preset = MULTI_OPTION_PRESETS.find(item => item.id === rule.presetId) ?? MULTI_OPTION_PRESETS[0]
    return preset.valueMode === 'editable' ? 'option-set' : 'none'
  },
  isEffective: (_field, rule) => {
    const preset = MULTI_OPTION_PRESETS.find(item => item.id === rule.presetId) ?? MULTI_OPTION_PRESETS[0]
    return preset.valueMode === 'editable'
      ? hasOptionSetValue(rule.value)
      : true
  },
  match: (field, recordValue, rule) => {
    const preset = MULTI_OPTION_PRESETS.find(item => item.id === rule.presetId) ?? MULTI_OPTION_PRESETS[0]
    const expected = readExpectedValue(preset, rule)
    if (preset.operator === 'exists') {
      return expected === false
        ? isEmptyFieldValue(recordValue)
        : !isEmptyFieldValue(recordValue)
    }

    return matchOptionSet(field, recordValue, expected)
  },
  formatValueText: formatOptionSetValueText
})

const booleanFilterSpec = createFilterSpec({
  presets: BOOLEAN_PRESETS,
  defaultPresetId: 'checked',
  getEditorKind: () => 'none',
  isEffective: () => true,
  match: (_field, recordValue, rule) => {
    const preset = BOOLEAN_PRESETS.find(item => item.id === rule.presetId) ?? BOOLEAN_PRESETS[0]
    const expected = readExpectedValue(preset, rule)
    if (preset.operator === 'exists') {
      return expected === false
        ? isEmptyFieldValue(recordValue)
        : !isEmptyFieldValue(recordValue)
    }

    return recordValue === expected
  },
  formatValueText: () => ''
})

const presenceFilterSpec = createFilterSpec({
  presets: PRESENCE_PRESETS,
  defaultPresetId: 'exists_true',
  getEditorKind: () => 'none',
  isEffective: () => true,
  match: (_field, recordValue, rule) => {
    const preset = PRESENCE_PRESETS.find(item => item.id === rule.presetId) ?? PRESENCE_PRESETS[0]
    const expected = readExpectedValue(preset, rule)
    return expected === false
      ? isEmptyFieldValue(recordValue)
      : !isEmptyFieldValue(recordValue)
  },
  formatValueText: () => ''
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

export const formatFilterRuleValueText = (
  field: Field | undefined,
  rule: FilterRule
): string => getFilterSpec(field).formatValueText(field, rule)

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
