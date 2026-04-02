import type {
  GroupBucketSort,
  GroupFilterOperator,
  GroupProperty,
  GroupPropertyConfig,
  GroupPropertyKind,
  GroupPropertyOption
} from '../../contracts/state'
import {
  createDefaultDatePropertyConfig
} from './date'
import {
  createDefaultStatusOptions,
  getStatusOptionCategory
} from './status'
import {
  createDefaultUrlPropertyConfig
} from './url'

export type OptionKind = Extract<GroupPropertyKind, 'select' | 'multiSelect' | 'status'>

export interface KindFilterPreset {
  id: string
  operator: GroupFilterOperator
  value?: unknown
  hidesValue?: boolean
}

export interface KindSpec {
  config: () => GroupPropertyConfig
  convertConfig: (property: Pick<GroupProperty, 'kind' | 'config'>) => GroupPropertyConfig
  hasOptions: boolean
  filter: {
    ops: readonly GroupFilterOperator[]
    presets: readonly KindFilterPreset[]
  }
  group: {
    modes: readonly string[]
    mode: string
    sorts: readonly GroupBucketSort[]
    sort: GroupBucketSort | ''
    showEmpty: boolean
    intervalModes?: readonly string[]
    bucketInterval?: number
  }
}

const DEFAULT_GROUP_BUCKET_INTERVAL = 10

const createFilterPreset = (
  id: string,
  operator: GroupFilterOperator,
  options?: {
    value?: unknown
    hidesValue?: boolean
  }
): KindFilterPreset => ({
  id,
  operator,
  value: options?.value,
  hidesValue: options?.hidesValue
})

const NUMBER_DATE_PRESETS = [
  createFilterPreset('eq', 'eq'),
  createFilterPreset('neq', 'neq'),
  createFilterPreset('gt', 'gt'),
  createFilterPreset('gte', 'gte'),
  createFilterPreset('lt', 'lt'),
  createFilterPreset('lte', 'lte'),
  createFilterPreset('exists_true', 'exists', {
    value: true,
    hidesValue: true
  }),
  createFilterPreset('exists_false', 'exists', {
    value: false,
    hidesValue: true
  })
] as const satisfies readonly KindFilterPreset[]

const SCALAR_OPTION_PRESETS = [
  createFilterPreset('eq', 'eq'),
  createFilterPreset('neq', 'neq'),
  createFilterPreset('exists_true', 'exists', {
    value: true,
    hidesValue: true
  }),
  createFilterPreset('exists_false', 'exists', {
    value: false,
    hidesValue: true
  })
] as const satisfies readonly KindFilterPreset[]

const MULTI_SELECT_PRESETS = [
  createFilterPreset('contains', 'contains'),
  createFilterPreset('exists_true', 'exists', {
    value: true,
    hidesValue: true
  }),
  createFilterPreset('exists_false', 'exists', {
    value: false,
    hidesValue: true
  })
] as const satisfies readonly KindFilterPreset[]

const CHECKBOX_PRESETS = [
  createFilterPreset('checked', 'eq', {
    value: true,
    hidesValue: true
  }),
  createFilterPreset('unchecked', 'eq', {
    value: false,
    hidesValue: true
  }),
  createFilterPreset('exists_true', 'exists', {
    value: true,
    hidesValue: true
  }),
  createFilterPreset('exists_false', 'exists', {
    value: false,
    hidesValue: true
  })
] as const satisfies readonly KindFilterPreset[]

const FILE_MEDIA_PRESETS = [
  createFilterPreset('exists_true', 'exists', {
    value: true,
    hidesValue: true
  }),
  createFilterPreset('exists_false', 'exists', {
    value: false,
    hidesValue: true
  })
] as const satisfies readonly KindFilterPreset[]

const TEXT_PRESETS = [
  createFilterPreset('contains', 'contains'),
  createFilterPreset('eq', 'eq'),
  createFilterPreset('neq', 'neq'),
  createFilterPreset('exists_true', 'exists', {
    value: true,
    hidesValue: true
  }),
  createFilterPreset('exists_false', 'exists', {
    value: false,
    hidesValue: true
  })
] as const satisfies readonly KindFilterPreset[]

const readOptionConfigOptions = (
  property: Pick<GroupProperty, 'kind' | 'config'>
): GroupPropertyOption[] => {
  if (
    property.config?.type === 'select'
    || property.config?.type === 'multiSelect'
    || property.config?.type === 'status'
  ) {
    return Array.isArray(property.config.options)
      ? property.config.options
      : []
  }

  return []
}

const cloneOptionConfig = (
  type: Extract<GroupPropertyConfig['type'], 'select' | 'multiSelect'>,
  property: Pick<GroupProperty, 'kind' | 'config'>
): GroupPropertyConfig => ({
  type,
  options: readOptionConfigOptions(property).map(option => ({ ...option }))
})

const cloneStatusConfig = (
  property: Pick<GroupProperty, 'kind' | 'config'>
): GroupPropertyConfig => {
  const sourceOptions = readOptionConfigOptions(property)

  return {
    type: 'status',
    options: sourceOptions.length
      ? sourceOptions.map(option => ({
          ...option,
          category: getStatusOptionCategory(property, option.id) ?? 'todo'
        }))
      : createDefaultStatusOptions()
  }
}

const createLabelGroup = (
  sort: GroupBucketSort,
  showEmpty: boolean
): KindSpec['group'] => ({
  modes: ['value'],
  mode: 'value',
  sorts: ['labelAsc', 'labelDesc'],
  sort,
  showEmpty
})

const createValueGroup = (
  sort: GroupBucketSort,
  showEmpty: boolean
): KindSpec['group'] => ({
  modes: ['value'],
  mode: 'value',
  sorts: ['valueAsc', 'valueDesc'],
  sort,
  showEmpty
})

const createOptionGroup = (
  modes: readonly string[],
  mode: string
): KindSpec['group'] => ({
  modes,
  mode,
  sorts: ['manual', 'labelAsc', 'labelDesc'],
  sort: 'manual',
  showEmpty: true
})

const createBooleanGroup = (): KindSpec['group'] => ({
  modes: ['boolean'],
  mode: 'boolean',
  sorts: ['manual', 'valueAsc', 'valueDesc'],
  sort: 'manual',
  showEmpty: true
})

const createPresenceGroup = (): KindSpec['group'] => ({
  modes: ['presence'],
  mode: 'presence',
  sorts: ['manual'],
  sort: 'manual',
  showEmpty: true
})

export const GROUP_PROPERTY_KINDS = [
  'text',
  'number',
  'select',
  'multiSelect',
  'status',
  'date',
  'checkbox',
  'url',
  'email',
  'phone',
  'file',
  'media'
] as const satisfies readonly GroupPropertyKind[]

export const kindSpecs = {
  text: {
    config: () => ({ type: 'text' }),
    convertConfig: () => ({ type: 'text' }),
    hasOptions: false,
    filter: {
      ops: ['contains', 'eq', 'neq', 'exists'],
      presets: TEXT_PRESETS
    },
    group: createLabelGroup('labelAsc', false)
  },
  number: {
    config: () => ({ type: 'number', format: 'number' }),
    convertConfig: () => ({ type: 'number', format: 'number' }),
    hasOptions: false,
    filter: {
      ops: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists'],
      presets: NUMBER_DATE_PRESETS
    },
    group: {
      ...createValueGroup('valueAsc', false),
      modes: ['range'],
      mode: 'range',
      intervalModes: ['range'],
      bucketInterval: DEFAULT_GROUP_BUCKET_INTERVAL
    }
  },
  select: {
    config: () => ({ type: 'select', options: [] }),
    convertConfig: property => cloneOptionConfig('select', property),
    hasOptions: true,
    filter: {
      ops: ['eq', 'neq', 'in', 'exists'],
      presets: SCALAR_OPTION_PRESETS
    },
    group: createOptionGroup(['option'], 'option')
  },
  multiSelect: {
    config: () => ({ type: 'multiSelect', options: [] }),
    convertConfig: property => cloneOptionConfig('multiSelect', property),
    hasOptions: true,
    filter: {
      ops: ['contains', 'in', 'exists'],
      presets: MULTI_SELECT_PRESETS
    },
    group: createOptionGroup(['option'], 'option')
  },
  status: {
    config: () => ({ type: 'status', options: createDefaultStatusOptions() }),
    convertConfig: property => cloneStatusConfig(property),
    hasOptions: true,
    filter: {
      ops: ['eq', 'neq', 'in', 'exists'],
      presets: SCALAR_OPTION_PRESETS
    },
    group: createOptionGroup(['option', 'category'], 'option')
  },
  date: {
    config: () => createDefaultDatePropertyConfig(),
    convertConfig: () => createDefaultDatePropertyConfig(),
    hasOptions: false,
    filter: {
      ops: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists'],
      presets: NUMBER_DATE_PRESETS
    },
    group: {
      ...createValueGroup('valueAsc', false),
      modes: ['day', 'week', 'month', 'quarter', 'year'],
      mode: 'month'
    }
  },
  checkbox: {
    config: () => ({ type: 'checkbox' }),
    convertConfig: () => ({ type: 'checkbox' }),
    hasOptions: false,
    filter: {
      ops: ['eq', 'neq', 'exists'],
      presets: CHECKBOX_PRESETS
    },
    group: createBooleanGroup()
  },
  url: {
    config: () => createDefaultUrlPropertyConfig(),
    convertConfig: () => createDefaultUrlPropertyConfig(),
    hasOptions: false,
    filter: {
      ops: ['contains', 'eq', 'neq', 'exists'],
      presets: TEXT_PRESETS
    },
    group: createLabelGroup('labelAsc', false)
  },
  email: {
    config: () => ({ type: 'email' }),
    convertConfig: () => ({ type: 'email' }),
    hasOptions: false,
    filter: {
      ops: ['contains', 'eq', 'neq', 'exists'],
      presets: TEXT_PRESETS
    },
    group: createLabelGroup('labelAsc', false)
  },
  phone: {
    config: () => ({ type: 'phone' }),
    convertConfig: () => ({ type: 'phone' }),
    hasOptions: false,
    filter: {
      ops: ['contains', 'eq', 'neq', 'exists'],
      presets: TEXT_PRESETS
    },
    group: createLabelGroup('labelAsc', false)
  },
  file: {
    config: () => ({ type: 'file', multiple: true }),
    convertConfig: () => ({ type: 'file', multiple: true }),
    hasOptions: false,
    filter: {
      ops: ['contains', 'exists'],
      presets: FILE_MEDIA_PRESETS
    },
    group: createPresenceGroup()
  },
  media: {
    config: () => ({ type: 'media', multiple: true }),
    convertConfig: () => ({ type: 'media', multiple: true }),
    hasOptions: false,
    filter: {
      ops: ['contains', 'exists'],
      presets: FILE_MEDIA_PRESETS
    },
    group: createPresenceGroup()
  }
} as const satisfies Record<GroupPropertyKind, KindSpec>

export const getKindSpec = (
  kind: GroupPropertyKind
): KindSpec => kindSpecs[kind]

export const getPropertyKindSpec = (
  property?: Pick<GroupProperty, 'kind'>
): KindSpec | undefined => (
  property
    ? getKindSpec(property.kind)
    : undefined
)

export const createKindConfig = (
  kind: GroupPropertyKind
): GroupPropertyConfig => getKindSpec(kind).config()

export const convertPropertyKindConfig = (
  property: Pick<GroupProperty, 'kind' | 'config'>,
  kind: GroupPropertyKind
): GroupPropertyConfig => getKindSpec(kind).convertConfig(property)

export const hasPropertyOptions = (
  property?: Pick<GroupProperty, 'kind'>
): property is Pick<GroupProperty, 'kind'> & { kind: OptionKind } => (
  Boolean(property && getKindSpec(property.kind).hasOptions)
)
