import { message, renderMessage } from '#meta/message'
import { field } from '#meta/field'
import { option } from '#meta/option'
import { sort } from '#meta/sort'
import { ui } from '#meta/ui'
import { view } from '#meta/view'

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
} from '#meta/message'

export type {
  OptionColorId
} from '#meta/option'

export type {
  FieldDateValueKindId,
  FieldDisplayDateFormatId,
  FieldDisplayTimeFormatId,
  FieldKindDescriptor,
  FieldNumberFormatId
} from '#meta/field'
