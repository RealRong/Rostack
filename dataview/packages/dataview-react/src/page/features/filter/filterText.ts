import type {
  Field
} from '@dataview/core/contracts'
import {
  meta
} from '@dataview/meta'
import {
  token,
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
