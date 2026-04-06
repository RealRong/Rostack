import type { Field } from '@dataview/core/contracts'
import { isCustomField } from '@dataview/core/field'
import type { FieldValueSpec } from './contracts'
import { createCheckboxPropertySpec } from './checkbox'
import { createDatePropertySpec } from './date'
import { createMultiSelectPropertySpec } from './multiSelect'
import { createSingleSelectPropertySpec } from './select'
import { createStatusPropertySpec } from './status'
import { createTextPropertySpec } from './text'

export const getFieldValueSpec = (property?: Field): FieldValueSpec<any> => {
  switch (property?.kind) {
    case 'title':
      return createTextPropertySpec(property)
    case 'select':
      return createSingleSelectPropertySpec(isCustomField(property) ? property : undefined)
    case 'status':
      return createStatusPropertySpec(isCustomField(property) ? property : undefined)
    case 'multiSelect':
      return createMultiSelectPropertySpec(isCustomField(property) ? property : undefined)
    case 'boolean':
      return createCheckboxPropertySpec(isCustomField(property) ? property : undefined)
    case 'date':
      return createDatePropertySpec(isCustomField(property) ? property : undefined)
    case 'asset':
      return createTextPropertySpec(property)
    default:
      return createTextPropertySpec(property)
  }
}
