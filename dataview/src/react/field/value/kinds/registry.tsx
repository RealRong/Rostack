import type { Field } from '@dataview/core/contracts'
import { isCustomField } from '@dataview/core/field'
import type { FieldValueSpec } from './contracts'
import { createCheckboxPropertySpec } from './checkbox'
import { createDatePropertySpec } from './date'
import { createMultiSelectPropertySpec } from './multiSelect'
import { createSingleSelectPropertySpec } from './select'
import { createStatusFieldSpec } from './status'
import { createTextPropertySpec } from './text'

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
