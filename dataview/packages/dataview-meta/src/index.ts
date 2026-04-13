import { message, renderMessage } from '#meta/message.ts'
import { field } from '#meta/field.tsx'
import { option } from '#meta/option.ts'
import { sort } from '#meta/sort.ts'
import { ui } from '#meta/ui.ts'
import { view } from '#meta/view.tsx'

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
} from '#meta/message.ts'

export type {
  OptionColorId
} from '#meta/option.ts'

export type {
  FieldDateValueKindId,
  FieldDisplayDateFormatId,
  FieldDisplayTimeFormatId,
  FieldKindDescriptor,
  FieldNumberFormatId
} from '#meta/field.tsx'
