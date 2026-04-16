import { calculation } from '@dataview/meta/calculation'
import { field } from '@dataview/meta/field'
import { filter } from '@dataview/meta/filter'
import { option } from '@dataview/meta/option'
import { sort } from '@dataview/meta/sort'
import { status, systemValue } from '@dataview/meta/systemValue'
import { ui } from '@dataview/meta/ui'
import { view } from '@dataview/meta/view'

export const meta = {
  calculation,
  view,
  field,
  filter,
  option,
  sort,
  status,
  systemValue,
  ui
} as const

export {
  token
} from '@shared/i18n'
export type {
  Token,
  TranslationToken,
  TranslationTokenValues
} from '@shared/i18n'

export type {
  OptionColorId
} from '@dataview/meta/option'

export type {
  FieldDateValueKindId,
  FieldDisplayDateFormatId,
  FieldDisplayTimeFormatId,
  FieldKindDescriptor,
  FieldNumberFormatId
} from '@dataview/meta/field'
