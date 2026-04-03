import type {
  GroupProperty,
  GroupRecord
} from '@dataview/core/contracts'

export const CARD_TITLE_PLACEHOLDER = '输入名称...'

export const readCardTitleText = (
  titleProperty: GroupProperty | undefined,
  record: GroupRecord
) => {
  if (!titleProperty) {
    return ''
  }

  const value = record.values[titleProperty.id]
  return typeof value === 'string'
    ? value
    : value === undefined || value === null
      ? ''
      : String(value)
}
