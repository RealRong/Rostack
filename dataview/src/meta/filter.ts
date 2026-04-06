import type {
  Field,
  FilterRule
} from '@dataview/core/contracts'
import {
  getFieldDisplayValue,
  getFieldFilterPreset,
  getFieldFilterPresets,
  isCustomField
} from '@dataview/core/field'
import {
  type KindFilterPreset,
  getFieldOption,
  getStatusFilterTargetLabel,
  readStatusFilterValue
} from '@dataview/core/field'
import { message, renderMessage } from './message'

export type FilterValueEditorKind =
  | 'none'
  | 'text'
  | 'number'
  | 'date'
  | 'singleOption'
  | 'status'

export interface FilterConditionDescriptor extends KindFilterPreset {
  message: ReturnType<typeof message>
  summary: ReturnType<typeof message>
}

export interface FilterPresentation {
  condition?: FilterConditionDescriptor
  value: {
    editor: FilterValueEditorKind
    placeholder?: ReturnType<typeof message>
    text: string
  }
  chip: {
    message: ReturnType<typeof message>
  }
  bodyLayout: 'none' | 'inset' | 'flush'
}

const toConditionDescriptor = (
  property: Pick<Field, 'kind'> | undefined,
  preset: KindFilterPreset
): FilterConditionDescriptor => {
  switch (preset.id) {
    case 'eq':
      return {
        ...preset,
        message: message('meta.filter.condition.eq', 'Is'),
        summary: message('meta.filter.condition.eq.summary', 'is')
      }
    case 'neq':
      return {
        ...preset,
        message: message('meta.filter.condition.neq', 'Is not'),
        summary: message('meta.filter.condition.neq.summary', 'is not')
      }
    case 'gt':
      return {
        ...preset,
        message: message('meta.filter.condition.gt', 'Greater than'),
        summary: message('meta.filter.condition.gt.summary', 'greater than')
      }
    case 'gte':
      return {
        ...preset,
        message: message('meta.filter.condition.gte', 'Greater than or equal to'),
        summary: message('meta.filter.condition.gte.summary', 'greater than or equal to')
      }
    case 'lt':
      return {
        ...preset,
        message: message('meta.filter.condition.lt', 'Less than'),
        summary: message('meta.filter.condition.lt.summary', 'less than')
      }
    case 'lte':
      return {
        ...preset,
        message: message('meta.filter.condition.lte', 'Less than or equal to'),
        summary: message('meta.filter.condition.lte.summary', 'less than or equal to')
      }
    case 'checked':
      return {
        ...preset,
        message: message('meta.filter.condition.checked', 'Is checked'),
        summary: message('meta.filter.condition.checked.summary', 'is checked')
      }
    case 'unchecked':
      return {
        ...preset,
        message: message('meta.filter.condition.unchecked', 'Is unchecked'),
        summary: message('meta.filter.condition.unchecked.summary', 'is unchecked')
      }
    case 'exists_true':
      return property?.kind === 'asset'
        ? {
            ...preset,
            message: message('meta.filter.condition.exists_true.file', 'Has value'),
            summary: message('meta.filter.condition.exists_true.file.summary', 'has value')
          }
        : {
            ...preset,
            message: message('meta.filter.condition.exists_true', 'Is not empty'),
            summary: message('meta.filter.condition.exists_true.summary', 'is not empty')
          }
    case 'exists_false':
      return {
        ...preset,
        message: message('meta.filter.condition.exists_false', 'Is empty'),
        summary: message('meta.filter.condition.exists_false.summary', 'is empty')
      }
    case 'contains':
    default:
      return {
        ...preset,
        message: message('meta.filter.condition.contains', 'Contains'),
        summary: message('meta.filter.condition.contains.summary', 'contains')
      }
  }
}

const getValueEditorKind = (
  property: Pick<Field, 'kind'> | undefined,
  condition: Pick<FilterConditionDescriptor, 'hidesValue'> | undefined
): FilterValueEditorKind => {
  if (!property || !condition || condition.hidesValue) {
    return 'none'
  }

  switch (property.kind) {
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'status':
      return 'status'
    case 'select':
    case 'multiSelect':
      return 'singleOption'
    default:
      return 'text'
  }
}

const getValuePlaceholder = (
  property?: Pick<Field, 'kind'>
) => {
  switch (property?.kind) {
    case 'date':
      return message('meta.filter.value.placeholder.date', 'Pick a date...')
    case 'number':
      return message('meta.filter.value.placeholder.number', 'Enter a number...')
    default:
      return message('meta.filter.value.placeholder.default', 'Enter a value...')
  }
}

const getValueText = (
  property: Field | undefined,
  rule: FilterRule
) => {
  if (property?.kind === 'status' && isCustomField(property)) {
    return readStatusFilterValue(property, rule.value).targets
      .map(target => getStatusFilterTargetLabel(property, target))
      .join(', ')
  }

  if (property?.kind === 'multiSelect' && typeof rule.value === 'string' && isCustomField(property)) {
    return getFieldOption(property, rule.value)?.name ?? rule.value
  }

  if (property) {
    return getFieldDisplayValue(property, rule.value) ?? ''
  }

  if (Array.isArray(rule.value)) {
    return rule.value.map(item => String(item ?? '')).join(', ')
  }

  return rule.value == null ? '' : String(rule.value)
}

export const filter = {
  conditions: (
    property?: Pick<Field, 'kind'>
  ): readonly FilterConditionDescriptor[] => (
    getFieldFilterPresets(property).map(preset => toConditionDescriptor(property, preset))
  ),
  present: (
    property: Field | undefined,
    rule: FilterRule
  ): FilterPresentation => {
    const preset = getFieldFilterPreset(property, rule)
    const condition = preset
      ? toConditionDescriptor(property, preset)
      : undefined
    const editor = getValueEditorKind(property, condition)
    const text = getValueText(property, rule)
    const summaryText = condition
      ? renderMessage(condition.summary)
      : 'Filter'
    const chipText = !property || !condition
      ? 'Filter'
      : !text || condition.hidesValue
        ? `${property.name} ${summaryText}`
        : `${property.name} ${summaryText} ${text}`

    return {
      condition,
      value: {
        editor,
        placeholder: editor === 'none'
          ? undefined
          : getValuePlaceholder(property),
        text
      },
      chip: {
        message: message('meta.filter.chip', chipText)
      },
      bodyLayout: editor === 'none'
        ? 'none'
        : editor === 'singleOption' || editor === 'status'
          ? 'flush'
          : 'inset'
    }
  }
} as const
