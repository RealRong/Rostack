import type {
  DateValue,
  Field,
  FieldId,
  FilterOptionSetValue,
  FilterPresetId,
  FilterRule,
  FilterValuePreview,
  ViewFilterRuleId
} from '@dataview/core/types'
import {
  KANBAN_EMPTY_BUCKET_KEY
} from '@dataview/core/types'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  normalizeOptionIdList
} from '@dataview/core/field/option'
import type {
  FilterEditorKind,
  FilterFamilyConfig,
  FilterPreset,
  FilterQueryAnalysis,
  FilterRuleAnalysis
} from './types'
import {
  filterConfig
} from './config'
import type {
  Token
} from '@shared/i18n'
import {
  tokenDate,
  tokenRef
} from '@shared/i18n'
import { equal } from '@shared/core'

const EMPTY_FILTER_VALUE_PREVIEW: FilterValuePreview = Object.freeze({
  kind: 'none'
})

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

export const cloneFilterRule = (
  rule: FilterRule
): FilterRule => ({
  id: rule.id,
  fieldId: rule.fieldId,
  presetId: rule.presetId,
  ...(rule.value !== undefined
    ? { value: cloneFilterValue(rule.value) }
    : {})
})

export const sameFilterRule = (
  left: FilterRule,
  right: FilterRule
): boolean => (
  left.id === right.id
  && left.fieldId === right.fieldId
  && left.presetId === right.presetId
  && equal.sameJsonValue(left.value, right.value)
)

const resolveFilterConfig = (
  field?: Pick<Field, 'kind'>
): FilterFamilyConfig => filterConfig.byKind[field?.kind ?? 'text']

const resolveFilterPreset = (
  field: Field | undefined,
  rule: Pick<FilterRule, 'presetId'>
): FilterPreset => {
  const config = resolveFilterConfig(field)
  return config.presets.find(item => item.id === rule.presetId) ?? config.presets[0]!
}

const readExpectedValue = (
  preset: FilterPreset,
  rule: FilterRule
) => (
  preset.valueMode === 'fixed'
    ? preset.fixedValue
    : rule.value
)

const createEditableValue = (
  config: FilterFamilyConfig
): FilterRule['value'] => {
  switch (config.editableValueKind) {
    case 'option-set':
      return createFilterOptionSetValue()
    case 'number':
    case 'date':
    case 'none':
      return undefined
    case 'text':
    default:
      return ''
  }
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
    return EMPTY_FILTER_VALUE_PREVIEW
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

const matchExistsValue = (
  value: unknown,
  expected: unknown
) => expected === false
  ? fieldApi.value.empty(value)
  : !fieldApi.value.empty(value)

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

export const getFilterPresetIds = (
  field?: Pick<Field, 'kind'>
): readonly FilterPresetId[] => resolveFilterConfig(field).presets.map(preset => preset.id)

export const hasFilterPreset = (
  field: Field | undefined,
  presetId: FilterPresetId
): boolean => resolveFilterConfig(field).presets.some(preset => preset.id === presetId)

const getEditorKind = (
  config: FilterFamilyConfig,
  preset: FilterPreset
): FilterEditorKind => preset.valueMode === 'editable'
  ? config.editableValueKind
  : 'none'

export const createFilterRule = (
  field: Field,
  input: {
    id: ViewFilterRuleId
    presetId?: FilterPresetId
    value?: unknown
  }
): FilterRule => {
  const config = resolveFilterConfig(field)
  const defaultPreset = config.presets.find(item => item.id === config.defaultPresetId) ?? config.presets[0]!
  let rule: FilterRule = {
    id: input.id,
    fieldId: field.id,
    presetId: defaultPreset.id
  }

  if (defaultPreset.valueMode === 'editable') {
    const value = createEditableValue(config)
    if (value !== undefined) {
      rule.value = value
    }
  }

  if (input.presetId !== undefined) {
    rule = applyFilterPreset(field, rule, input.presetId)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'value')) {
    rule = setFilterRuleValue(field, rule, input.value)
  }

  return rule
}

export const applyFilterPreset = (
  field: Field | undefined,
  rule: FilterRule,
  presetId: FilterPresetId
): FilterRule => {
  const config = resolveFilterConfig(field)
  const nextPreset = config.presets.find(item => item.id === presetId) ?? config.presets[0]!
  const currentPreset = resolveFilterPreset(field, rule)
  const nextRule: FilterRule = {
    id: rule.id,
    fieldId: rule.fieldId,
    presetId: nextPreset.id
  }

  if (nextPreset.valueMode !== 'editable') {
    return nextRule
  }

  const editorKind = getEditorKind(config, nextPreset)
  const nextValue = currentPreset.valueMode === 'editable'
    ? normalizeEditableValue(editorKind, rule.value)
    : createEditableValue(config)

  if (nextValue !== undefined) {
    nextRule.value = nextValue
  }

  return nextRule
}

export const setFilterRuleValue = (
  field: Field | undefined,
  rule: FilterRule,
  value: unknown
): FilterRule => {
  const config = resolveFilterConfig(field)
  const preset = resolveFilterPreset(field, rule)
  if (preset.valueMode !== 'editable') {
    return {
      id: rule.id,
      fieldId: rule.fieldId,
      presetId: rule.presetId
    }
  }

  const nextValue = normalizeEditableValue(getEditorKind(config, preset), value)
  return {
    id: rule.id,
    fieldId: rule.fieldId,
    presetId: rule.presetId,
    ...(nextValue !== undefined
      ? { value: nextValue }
      : {})
  }
}

export const normalizeFilterRule = (
  field: Field | undefined,
  rule: Partial<Omit<FilterRule, 'id'>> & Pick<FilterRule, 'id' | 'fieldId'>
): FilterRule => {
  const config = resolveFilterConfig(field)
  const preset = config.presets.find(item => item.id === rule.presetId) ?? config.presets[0]!
  const nextRule: FilterRule = {
    id: rule.id,
    fieldId: rule.fieldId,
    presetId: preset.id
  }

  if (preset.valueMode === 'editable') {
    const nextValue = normalizeEditableValue(getEditorKind(config, preset), rule.value)
    if (nextValue !== undefined) {
      nextRule.value = nextValue
    }
  }

  return nextRule
}

export const patchFilterRule = (
  field: Field | undefined,
  rule: FilterRule,
  patch: Partial<Pick<FilterRule, 'fieldId' | 'presetId' | 'value'>>
): FilterRule => {
  if (patch.fieldId !== undefined) {
    return normalizeFilterRule(field, {
      id: rule.id,
      fieldId: patch.fieldId,
      presetId: patch.presetId ?? rule.presetId,
      ...(Object.prototype.hasOwnProperty.call(patch, 'value')
        ? { value: patch.value }
        : Object.prototype.hasOwnProperty.call(rule, 'value')
          ? { value: rule.value }
          : {})
    })
  }

  let nextRule = rule
  if (patch.presetId !== undefined) {
    nextRule = applyFilterPreset(field, nextRule, patch.presetId)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'value')) {
    nextRule = setFilterRuleValue(field, nextRule, patch.value)
  }
  return nextRule
}

export const matchFilterRule = (
  field: Field | undefined,
  recordValue: unknown,
  rule: FilterRule
): boolean => {
  const config = resolveFilterConfig(field)
  const preset = resolveFilterPreset(field, rule)
  const expected = readExpectedValue(preset, rule)

  switch (config.family) {
    case 'text':
      if (preset.operator === 'exists') {
        return matchExistsValue(recordValue, expected)
      }
      if (preset.operator === 'contains') {
        return matchTextContains(recordValue, expected)
      }
      return preset.operator === 'eq'
        ? fieldApi.compare.value(field, recordValue, expected) === 0
        : fieldApi.compare.value(field, recordValue, expected) !== 0
    case 'comparable-number':
    case 'comparable-date':
      return preset.operator === 'exists'
        ? matchExistsValue(recordValue, expected)
        : matchComparableValue(field, recordValue, expected, preset.operator)
    case 'single-option': {
      if (preset.operator === 'exists') {
        return matchExistsValue(recordValue, expected)
      }
      const match = matchOptionSet(field, recordValue, expected)
      return preset.operator === 'neq' ? !match : match
    }
    case 'multi-option':
      return preset.operator === 'exists'
        ? matchExistsValue(recordValue, expected)
        : matchOptionSet(field, recordValue, expected)
    case 'boolean':
      return preset.operator === 'exists'
        ? matchExistsValue(recordValue, expected)
        : recordValue === expected
    case 'presence':
      return matchExistsValue(recordValue, expected)
  }
}

const analyzeQuery = (
  config: FilterFamilyConfig,
  rule: FilterRule
): FilterQueryAnalysis => {
  switch (config.family) {
    case 'comparable-number':
    case 'comparable-date':
      switch (rule.presetId) {
        case 'eq':
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
          return {
            kind: 'sort',
            mode: rule.presetId,
            value: rule.value
          }
        case 'exists_true':
          return {
            kind: 'sort',
            mode: 'exists'
          }
        default:
          return {
            kind: 'scan'
          }
      }
    case 'single-option': {
      const optionIds = readFilterOptionSetValue(rule.value).optionIds
      switch (rule.presetId) {
        case 'eq':
          return {
            kind: 'bucket',
            mode: 'include',
            keys: optionIds
          }
        case 'neq':
          return {
            kind: 'bucket',
            mode: 'exclude',
            keys: optionIds
          }
        case 'exists_true':
          return {
            kind: 'bucket',
            mode: 'exclude',
            keys: [KANBAN_EMPTY_BUCKET_KEY]
          }
        case 'exists_false':
          return {
            kind: 'bucket',
            mode: 'include',
            keys: [KANBAN_EMPTY_BUCKET_KEY]
          }
        default:
          return {
            kind: 'scan'
          }
      }
    }
    case 'multi-option':
      switch (rule.presetId) {
        case 'contains':
          return {
            kind: 'bucket',
            mode: 'include',
            keys: readFilterOptionSetValue(rule.value).optionIds
          }
        case 'exists_true':
          return {
            kind: 'bucket',
            mode: 'exclude',
            keys: [KANBAN_EMPTY_BUCKET_KEY]
          }
        case 'exists_false':
          return {
            kind: 'bucket',
            mode: 'include',
            keys: [KANBAN_EMPTY_BUCKET_KEY]
          }
        default:
          return {
            kind: 'scan'
          }
      }
    case 'boolean':
      switch (rule.presetId) {
        case 'checked':
          return {
            kind: 'bucket',
            mode: 'include',
            keys: ['true']
          }
        case 'unchecked':
          return {
            kind: 'bucket',
            mode: 'include',
            keys: ['false']
          }
        case 'exists_true':
          return {
            kind: 'bucket',
            mode: 'exclude',
            keys: [KANBAN_EMPTY_BUCKET_KEY]
          }
        case 'exists_false':
          return {
            kind: 'bucket',
            mode: 'include',
            keys: [KANBAN_EMPTY_BUCKET_KEY]
          }
        default:
          return {
            kind: 'scan'
          }
      }
    default:
      return {
        kind: 'scan'
      }
  }
}

const deriveRecordDefault = (
  config: FilterFamilyConfig,
  field: Field | undefined,
  rule: FilterRule
): FilterRuleAnalysis['recordDefault'] => {
  if (!field) {
    return undefined
  }

  switch (config.family) {
    case 'text':
      return rule.presetId === 'eq' && typeof rule.value === 'string'
        ? {
            fieldId: field.id,
            value: rule.value
          }
        : undefined
    case 'comparable-number':
      return rule.presetId === 'eq'
        && typeof rule.value === 'number'
        && Number.isFinite(rule.value)
        ? {
            fieldId: field.id,
            value: rule.value
          }
        : undefined
    case 'comparable-date':
      return rule.presetId === 'eq'
        && fieldApi.date.value.comparableTimestamp(rule.value) !== undefined
        ? {
            fieldId: field.id,
            value: structuredClone(rule.value)
          }
        : undefined
    case 'single-option': {
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
    case 'multi-option': {
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
    case 'boolean':
      return rule.presetId === 'checked'
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
    case 'presence':
      return undefined
  }
}

export const analyzeFilterRule = (
  field: Field | undefined,
  rule: FilterRule
): FilterRuleAnalysis => {
  const config = resolveFilterConfig(field)
  const preset = resolveFilterPreset(field, rule)
  const editorKind = getEditorKind(config, preset)
  const effective = (() => {
    switch (config.family) {
      case 'text':
        return preset.valueMode === 'editable'
          ? typeof rule.value === 'string' && rule.value.trim().length > 0
          : true
      case 'comparable-number':
        return preset.valueMode === 'editable'
          ? typeof rule.value === 'number' && Number.isFinite(rule.value)
          : true
      case 'comparable-date':
        return preset.valueMode === 'editable'
          ? fieldApi.date.value.comparableTimestamp(rule.value) !== undefined
          : true
      case 'single-option':
      case 'multi-option':
        return preset.valueMode === 'editable'
          ? readFilterOptionSetValue(rule.value).optionIds.length > 0
          : true
      case 'boolean':
      case 'presence':
        return true
    }
  })()

  const project = (() => {
    switch (config.family) {
      case 'text':
        return typeof rule.value === 'string' && rule.value.length
          ? projectSingleValue(rule.value)
          : EMPTY_FILTER_VALUE_PREVIEW
      case 'comparable-number':
        return typeof rule.value === 'number' && Number.isFinite(rule.value)
          ? projectSingleValue(rule.value)
          : EMPTY_FILTER_VALUE_PREVIEW
      case 'comparable-date':
        return rule.value && typeof rule.value === 'object' && ('kind' in rule.value)
          ? projectSingleValue(tokenDate(rule.value as DateValue))
          : EMPTY_FILTER_VALUE_PREVIEW
      case 'single-option':
      case 'multi-option':
        return projectOptionSetValue(field, rule.value)
      case 'boolean':
        if (rule.presetId === 'checked') {
          return projectSingleValue(tokenRef('dataview.systemValue', 'value.checked'))
        }
        if (rule.presetId === 'unchecked') {
          return projectSingleValue(tokenRef('dataview.systemValue', 'value.unchecked'))
        }
        return EMPTY_FILTER_VALUE_PREVIEW
      case 'presence':
        return rule.presetId === 'exists_true'
          ? projectSingleValue(tokenRef('dataview.systemValue', 'value.hasValue'))
          : rule.presetId === 'exists_false'
            ? projectSingleValue(tokenRef('dataview.systemValue', 'value.empty'))
            : EMPTY_FILTER_VALUE_PREVIEW
    }
  })()

  return {
    effective,
    editorKind,
    project,
    query: analyzeQuery(config, rule),
    ...(deriveRecordDefault(config, field, rule)
      ? {
          recordDefault: deriveRecordDefault(config, field, rule)!
        }
      : {})
  }
}
