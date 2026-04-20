import type { Field } from '@dataview/core/contracts'
import { field as fieldApi } from '@dataview/core/field'
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
      return createSingleSelectPropertySpec(fieldApi.kind.isCustom(field) ? field : undefined)
    case 'status':
      return createStatusFieldSpec(fieldApi.kind.isCustom(field) ? field : undefined)
    case 'multiSelect':
      return createMultiSelectPropertySpec(fieldApi.kind.isCustom(field) ? field : undefined)
    case 'boolean':
      return createCheckboxPropertySpec(fieldApi.kind.isCustom(field) ? field : undefined)
    case 'date':
      return createDatePropertySpec(fieldApi.kind.isCustom(field) ? field : undefined)
    case 'asset':
      return createTextPropertySpec(field)
    default:
      return createTextPropertySpec(field)
  }
}
