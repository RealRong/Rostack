import type { Field } from '@dataview/core/contracts'
import { isCustomField } from '@dataview/core/field'
import type { FieldValueSpec } from '#react/field/value/kinds/contracts.ts'
import { createCheckboxPropertySpec } from '#react/field/value/kinds/checkbox.tsx'
import { createDatePropertySpec } from '#react/field/value/kinds/date.tsx'
import { createMultiSelectPropertySpec } from '#react/field/value/kinds/multiSelect.tsx'
import { createSingleSelectPropertySpec } from '#react/field/value/kinds/select.tsx'
import { createStatusFieldSpec } from '#react/field/value/kinds/status.tsx'
import { createTextPropertySpec } from '#react/field/value/kinds/text.tsx'

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
