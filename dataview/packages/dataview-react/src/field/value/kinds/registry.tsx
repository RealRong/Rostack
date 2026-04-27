import type { Field, FieldKind } from '@dataview/core/types'
import {
  createTableIndex
} from '@shared/spec'
import type { FieldValueSpec } from '@dataview/react/field/value/kinds/contracts'
import { checkboxFieldValueSpec } from '@dataview/react/field/value/kinds/checkbox'
import { dateFieldValueSpec } from '@dataview/react/field/value/kinds/date'
import { multiSelectFieldValueSpec } from '@dataview/react/field/value/kinds/multiSelect'
import { selectFieldValueSpec } from '@dataview/react/field/value/kinds/select'
import { statusFieldValueSpec } from '@dataview/react/field/value/kinds/status'
import { textFieldValueSpec } from '@dataview/react/field/value/kinds/text'

export const fieldValueSpec = {
  title: textFieldValueSpec,
  text: textFieldValueSpec,
  number: textFieldValueSpec,
  url: textFieldValueSpec,
  email: textFieldValueSpec,
  phone: textFieldValueSpec,
  asset: textFieldValueSpec,
  select: selectFieldValueSpec,
  status: statusFieldValueSpec,
  multiSelect: multiSelectFieldValueSpec,
  boolean: checkboxFieldValueSpec,
  date: dateFieldValueSpec
} as const satisfies Record<FieldKind, FieldValueSpec>

const fieldValueSpecIndex = createTableIndex(fieldValueSpec)

export const readFieldValueSpec = (
  field?: Field
): FieldValueSpec => (
  field
    ? fieldValueSpecIndex.get(field.kind)
    : fieldValueSpec.text
)
