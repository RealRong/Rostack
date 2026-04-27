import type {
  Field,
  FilterValuePreview
} from '@dataview/core/types'
import {
  field as fieldApi
} from '@dataview/core/field'
import { filter as filterApi } from '@dataview/core/view'
import type { FilterRuleProjection } from '@dataview/engine'
import {
  meta
} from '@dataview/meta'
import {
  token,
  tokenRange,
  type TokenTranslator,
  type Token
} from '@shared/i18n'

export const getFilterPresetLabel = (
  field: Pick<Field, 'kind'> | undefined,
  presetId: string
): Token => {
  if (presetId === 'exists_true' && field?.kind === 'asset') {
    return token('meta.filter.preset.exists_true.asset', 'Has value')
  }

  return meta.filter.preset.get(presetId).token
}

export const getFilterValuePlaceholder = (
  field: Pick<Field, 'kind'> | undefined
): Token | undefined => {
  switch (field?.kind) {
    case 'date':
      return token('meta.ui.filter.valuePlaceholder.date', 'Pick a date...')
    case 'number':
      return token('meta.ui.filter.valuePlaceholder.number', 'Enter a number...')
    case 'select':
    case 'multiSelect':
    case 'status':
      return undefined
    default:
      return token('meta.ui.filter.valuePlaceholder.default', 'Enter a value...')
  }
}

const getFilterSummaryOperator = (
  field: Pick<Field, 'kind'> | undefined,
  presetId: string
): Token | undefined => {
  switch (presetId) {
    case 'contains':
    case 'eq':
      return undefined
    case 'neq':
      return token('dataview.react.filter.summary.operator.neq', 'is not')
    case 'gt':
      return token('dataview.react.filter.summary.operator.gt', '>')
    case 'gte':
      return token('dataview.react.filter.summary.operator.gte', '>=')
    case 'lt':
      return token('dataview.react.filter.summary.operator.lt', '<')
    case 'lte':
      return token('dataview.react.filter.summary.operator.lte', '<=')
    case 'checked':
      return token('dataview.react.filter.summary.operator.checked', 'is checked')
    case 'unchecked':
      return token('dataview.react.filter.summary.operator.unchecked', 'is unchecked')
    case 'exists_true':
      return field?.kind === 'asset'
        ? token('dataview.react.filter.summary.operator.exists_true.asset', 'has value')
        : token('dataview.react.filter.summary.operator.exists_true', 'has value')
    case 'exists_false':
      return token('dataview.react.filter.summary.operator.exists_false', 'is empty')
    default:
      return getFilterPresetLabel(field, presetId)
  }
}

const readFilterSummaryValue = (
  value: FilterValuePreview,
  t: TokenTranslator
) => {
  switch (value.kind) {
    case 'single':
      return t(value.value)
    case 'multi':
      return t(value.values)
    case 'range':
      return t(tokenRange({
        min: value.min,
        max: value.max
      }))
    case 'none':
    default:
      return ''
  }
}

const readFilterSummaryOptionValue = (
  field: Extract<Field, { kind: 'select' | 'multiSelect' | 'status' }>,
  value: FilterRuleProjection['rule']['value'],
  t: TokenTranslator
) => {
  const optionIds = filterApi.value.optionSet.read(value).optionIds
  if (!optionIds.length) {
    return ''
  }

  return t(optionIds.map(optionId => (
    fieldApi.option.read.get(field, optionId)?.name ?? optionId
  )))
}

export const readFilterSummary = (
  entry: Pick<FilterRuleProjection, 'field' | 'rule' | 'activePresetId' | 'value'>,
  t: TokenTranslator
) => {
  const fieldLabel = entry.field?.name ?? t(meta.systemValue.get('field.deleted').token)
  const operator = getFilterSummaryOperator(entry.field, entry.activePresetId)
  const operatorText = operator
    ? t(operator)
    : ''
  let valueText = readFilterSummaryValue(entry.value, t)
  if (entry.field && fieldApi.kind.hasOptions(entry.field)) {
    valueText = readFilterSummaryOptionValue(entry.field, entry.rule.value, t)
  }

  if (operatorText && valueText) {
    return `${fieldLabel}: ${operatorText} ${valueText}`
  }

  if (valueText) {
    return `${fieldLabel}: ${valueText}`
  }

  if (operatorText) {
    return `${fieldLabel}: ${operatorText}`
  }

  return fieldLabel
}
