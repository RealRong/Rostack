import { message, renderMessage } from '#dataview-meta/message'
import { field } from '#dataview-meta/field'
import { option } from '#dataview-meta/option'
import { sort } from '#dataview-meta/sort'
import { ui } from '#dataview-meta/ui'
import { view } from '#dataview-meta/view'

export const meta = {
  view,
  field,
  option,
  sort,
  ui
} as const

export {
  message,
  renderMessage
}

export type {
  MessageSpec,
  MessageValues
} from '#dataview-meta/message'

export type {
  OptionColorId
} from '#dataview-meta/option'

export type {
  FieldDateValueKindId,
  FieldDisplayDateFormatId,
  FieldDisplayTimeFormatId,
  FieldKindDescriptor,
  FieldNumberFormatId
} from '#dataview-meta/field'
