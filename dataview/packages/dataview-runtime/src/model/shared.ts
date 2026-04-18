import type {
  CardLayout,
  CardSize,
  CustomField,
  RecordId,
  ViewId,
  View
} from '@dataview/core/contracts'
import type {
  ItemId,
  ViewState
} from '@dataview/engine'

export interface RecordCardData {
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

export interface RecordCardPropertyData {
  field: CustomField
  value: unknown
}

export interface RecordCardContentData {
  titleText: string
  placeholderText: string
  properties: readonly RecordCardPropertyData[]
  hasProperties: boolean
}

export type ActiveTypedViewState<TType extends View['type']> = ViewState & {
  view: View & {
    type: TType
  }
}

export const readActiveTypedViewState = <TType extends View['type']>(
  state: ViewState | undefined,
  type: TType
): ActiveTypedViewState<TType> | undefined => (
  state?.view.type === type
    ? state as ActiveTypedViewState<TType>
    : undefined
)
