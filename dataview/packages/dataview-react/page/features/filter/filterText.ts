import type { Field } from '@dataview/core/contracts'

export const getFilterPresetLabel = (
  field: Pick<Field, 'kind'> | undefined,
  presetId: string
) => {
  switch (presetId) {
    case 'eq':
      return 'Is'
    case 'neq':
      return 'Is not'
    case 'gt':
      return 'Greater than'
    case 'gte':
      return 'Greater than or equal to'
    case 'lt':
      return 'Less than'
    case 'lte':
      return 'Less than or equal to'
    case 'checked':
      return 'Is checked'
    case 'unchecked':
      return 'Is unchecked'
    case 'exists_true':
      return field?.kind === 'asset'
        ? 'Has value'
        : 'Is not empty'
    case 'exists_false':
      return 'Is empty'
    case 'contains':
    default:
      return 'Contains'
  }
}

export const getFilterValuePlaceholder = (
  field: Pick<Field, 'kind'> | undefined
) => {
  switch (field?.kind) {
    case 'date':
      return 'Pick a date...'
    case 'number':
      return 'Enter a number...'
    case 'select':
    case 'multiSelect':
    case 'status':
      return undefined
    default:
      return 'Enter a value...'
  }
}
