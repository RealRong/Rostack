import type { Field } from '@dataview/core/contracts'
import { isCustomField } from '@dataview/core/field'
import type { FieldValueSpec } from '@dataview/react/field/value/kinds/contracts'
import { createCheckboxPropertySpec } from '@dataview/react/field/value/kinds/checkbox'
import { createDatePropertySpec } from '@dataview/react/field/value/kinds/date'
import { createMultiSelectPropertySpec } from '@dataview/react/field/value/kinds/multiSelect'
import { createSingleSelectPropertySpec } from '@dataview/react/field/value/kinds/select'
import { createStatusFieldSpec } from '@dataview/react/field/value/kinds/status'
import { createTextPropertySpec } from '@dataview/react/field/value/kinds/text'

export const getFieldValueSpec = (field?: Field): FieldValueSpec<any> => {
  switch (field?.kind) {
    case 'title':
      return createTextPropertySpec(field)
    case 'select':
      return createSingleSelectPropertySpec(isCustomField(field) ? field : undefined)
    case 'status':
      return createStatusFieldSpec(isCustomField(field) ? field : undefined)
    case 'multiSelect':
      return createMultiSelectPropertySpec(isCustomField(field) ? field : undefined)
    case 'boolean':
      return createCheckboxPropertySpec(isCustomField(field) ? field : undefined)
    case 'date':
      return createDatePropertySpec(isCustomField(field) ? field : undefined)
    case 'asset':
      return createTextPropertySpec(field)
    default:
      return createTextPropertySpec(field)
  }
}
