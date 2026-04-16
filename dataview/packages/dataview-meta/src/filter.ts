import type {
  FilterPresetId
} from '@dataview/core/contracts'
import {
  token,
  type Token
} from '@shared/i18n'
import {
  defineMetaCollection
} from '@dataview/meta/shared'

export interface FilterPresetDescriptor {
  id: FilterPresetId | string
  token: Token
}

const FILTER_PRESETS = [
  {
    id: 'contains',
    token: token('meta.filter.preset.contains', 'Contains')
  },
  {
    id: 'eq',
    token: token('meta.filter.preset.eq', 'Is')
  },
  {
    id: 'neq',
    token: token('meta.filter.preset.neq', 'Is not')
  },
  {
    id: 'gt',
    token: token('meta.filter.preset.gt', 'Greater than')
  },
  {
    id: 'gte',
    token: token('meta.filter.preset.gte', 'Greater than or equal to')
  },
  {
    id: 'lt',
    token: token('meta.filter.preset.lt', 'Less than')
  },
  {
    id: 'lte',
    token: token('meta.filter.preset.lte', 'Less than or equal to')
  },
  {
    id: 'checked',
    token: token('meta.filter.preset.checked', 'Is checked')
  },
  {
    id: 'unchecked',
    token: token('meta.filter.preset.unchecked', 'Is unchecked')
  },
  {
    id: 'exists_true',
    token: token('meta.filter.preset.exists_true', 'Has value')
  },
  {
    id: 'exists_false',
    token: token('meta.filter.preset.exists_false', 'Is empty')
  }
] as const satisfies readonly FilterPresetDescriptor[]

export const filter = {
  preset: defineMetaCollection(FILTER_PRESETS, {
    fallback: (id?: string) => ({
      id: id ?? 'contains',
      token: token('meta.filter.preset.unknown', id ?? 'Contains')
    })
  })
} as const
