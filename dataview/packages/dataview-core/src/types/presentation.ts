import type { FilterPresetId } from './state'
import type { Token } from '@shared/i18n'

export type SystemValueId =
  | 'section.all'
  | 'field.deleted'
  | 'value.empty'
  | 'value.checked'
  | 'value.unchecked'
  | 'value.hasValue'
  | 'value.noValue'
  | 'date.today'
  | 'date.tomorrow'
  | 'date.yesterday'

export type FilterValuePreview =
  | {
      kind: 'none'
    }
  | {
      kind: 'single'
      value: Token
    }
  | {
      kind: 'multi'
      values: readonly Token[]
    }
  | {
      kind: 'range'
      min?: Token
      max?: Token
    }

export interface FilterConditionProjection {
  id: FilterPresetId
  selected: boolean
}
