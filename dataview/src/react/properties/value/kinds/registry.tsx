import type { GroupProperty } from '@/core/contracts'
import type { PropertyValueSpec } from './contracts'
import { createCheckboxPropertySpec } from './checkbox'
import { createDatePropertySpec } from './date'
import { createMultiSelectPropertySpec } from './multiSelect'
import { createSingleSelectPropertySpec } from './select'
import { createStatusPropertySpec } from './status'
import { createTextPropertySpec } from './text'

export const getPropertyValueSpec = (property?: GroupProperty): PropertyValueSpec<any> => {
  switch (property?.kind) {
    case 'select':
      return createSingleSelectPropertySpec(property)
    case 'status':
      return createStatusPropertySpec(property)
    case 'multiSelect':
      return createMultiSelectPropertySpec(property)
    case 'checkbox':
      return createCheckboxPropertySpec(property)
    case 'date':
      return createDatePropertySpec(property)
    case 'file':
    case 'media':
      return createTextPropertySpec(property)
    default:
      return createTextPropertySpec(property)
  }
}
