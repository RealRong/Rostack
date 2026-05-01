import type {
  Field,
  FilterPresetId
} from '@dataview/core/types'
import type {
  FilterFamilyConfig,
  FilterPreset
} from './types'

const filterPreset = (
  id: FilterPresetId,
  operator: FilterPreset['operator'],
  options?: {
    valueMode?: FilterPreset['valueMode']
    fixedValue?: FilterPreset['fixedValue']
  }
): FilterPreset => ({
  id,
  operator,
  valueMode: options?.valueMode ?? 'editable',
  ...(options?.fixedValue !== undefined
    ? { fixedValue: structuredClone(options.fixedValue) }
    : {})
})

const TEXT_PRESETS = [
  filterPreset('contains', 'contains'),
  filterPreset('eq', 'eq'),
  filterPreset('neq', 'neq'),
  filterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  filterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

const NUMBER_PRESETS = [
  filterPreset('eq', 'eq'),
  filterPreset('neq', 'neq'),
  filterPreset('gt', 'gt'),
  filterPreset('gte', 'gte'),
  filterPreset('lt', 'lt'),
  filterPreset('lte', 'lte'),
  filterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  filterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

const OPTION_PRESETS = [
  filterPreset('eq', 'eq'),
  filterPreset('neq', 'neq'),
  filterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  filterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

const MULTI_OPTION_PRESETS = [
  filterPreset('contains', 'contains'),
  filterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  filterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

const BOOLEAN_PRESETS = [
  filterPreset('checked', 'eq', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  filterPreset('unchecked', 'eq', {
    valueMode: 'fixed',
    fixedValue: false
  }),
  filterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  filterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

const PRESENCE_PRESETS = [
  filterPreset('exists_true', 'exists', {
    valueMode: 'fixed',
    fixedValue: true
  }),
  filterPreset('exists_false', 'exists', {
    valueMode: 'fixed',
    fixedValue: false
  })
] as const satisfies readonly FilterPreset[]

export const filterConfig = {
  byKind: {
    title: {
      family: 'text',
      defaultPresetId: 'contains',
      presets: TEXT_PRESETS,
      editableValueKind: 'text'
    },
    text: {
      family: 'text',
      defaultPresetId: 'contains',
      presets: TEXT_PRESETS,
      editableValueKind: 'text'
    },
    url: {
      family: 'text',
      defaultPresetId: 'contains',
      presets: TEXT_PRESETS,
      editableValueKind: 'text'
    },
    email: {
      family: 'text',
      defaultPresetId: 'contains',
      presets: TEXT_PRESETS,
      editableValueKind: 'text'
    },
    phone: {
      family: 'text',
      defaultPresetId: 'contains',
      presets: TEXT_PRESETS,
      editableValueKind: 'text'
    },
    number: {
      family: 'comparable-number',
      defaultPresetId: 'eq',
      presets: NUMBER_PRESETS,
      editableValueKind: 'number'
    },
    date: {
      family: 'comparable-date',
      defaultPresetId: 'eq',
      presets: NUMBER_PRESETS,
      editableValueKind: 'date'
    },
    select: {
      family: 'single-option',
      defaultPresetId: 'eq',
      presets: OPTION_PRESETS,
      editableValueKind: 'option-set'
    },
    multiSelect: {
      family: 'multi-option',
      defaultPresetId: 'contains',
      presets: MULTI_OPTION_PRESETS,
      editableValueKind: 'option-set'
    },
    status: {
      family: 'single-option',
      defaultPresetId: 'eq',
      presets: OPTION_PRESETS,
      editableValueKind: 'option-set'
    },
    boolean: {
      family: 'boolean',
      defaultPresetId: 'checked',
      presets: BOOLEAN_PRESETS,
      editableValueKind: 'none'
    },
    asset: {
      family: 'presence',
      defaultPresetId: 'exists_true',
      presets: PRESENCE_PRESETS,
      editableValueKind: 'none'
    }
  }
} as const satisfies {
  byKind: Record<Field['kind'], FilterFamilyConfig>
}
