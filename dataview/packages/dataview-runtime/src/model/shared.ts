import type {
  CardLayout,
  CardSize,
  CustomField,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemId
} from '@dataview/engine'

export interface Card {
  viewId: ViewId
  itemId: ItemId
  recordId: RecordId
  fields: readonly CustomField[]
  size: CardSize
  layout: CardLayout
  wrap: boolean
  canDrag: boolean
  selected: boolean
  editing: boolean
}

export interface CardProperty {
  field: CustomField
  value: unknown
}

export interface CardContent {
  titleText: string
  placeholderText: string
  properties: readonly CardProperty[]
  hasProperties: boolean
}
