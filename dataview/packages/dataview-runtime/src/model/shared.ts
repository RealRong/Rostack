import type {
  CardLayout,
  CardSize,
  CustomField,
  RecordId,
  TitleField,
  ViewId
} from '@dataview/core/types'
import type {
  ItemId
} from '@dataview/engine'

export interface Card {
  viewId: ViewId
  itemId: ItemId
  recordId: RecordId
  size: CardSize
  layout: CardLayout
  wrap: boolean
  canDrag: boolean
  selected: boolean
  editing: boolean
}

export interface CardTitle {
  field: TitleField
  value: string
}

export interface CardProperty {
  field: CustomField
  value: unknown
}

export interface CardContent {
  title?: CardTitle
  properties: readonly CardProperty[]
  hasProperties: boolean
}
