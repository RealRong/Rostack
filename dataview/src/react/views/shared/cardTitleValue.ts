import type { Row } from '@dataview/core/contracts'

export const CARD_TITLE_PLACEHOLDER = '输入名称...'

export const readCardTitleText = (
  record: Row
) => record.title
