import type {
  BucketSort,
  CustomField,
  CustomFieldKind,
  FieldOption,
  CustomFieldId
} from '#core/contracts/state.ts'
import {
  createDefaultDateFieldConfig
} from '#core/field/kind/date.ts'
import {
  createDefaultStatusOptions,
  getStatusOptionCategory
} from '#core/field/kind/status.ts'
import {
  createDefaultUrlFieldConfig
} from '#core/field/kind/url.ts'

export type OptionKind = Extract<CustomFieldKind, 'select' | 'multiSelect' | 'status'>

export interface KindSpec {
  create: (input: {
    id: CustomFieldId
    name: string
    meta?: Record<string, unknown>
  }) => CustomField
  convert: (field: CustomField) => CustomField
  hasOptions: boolean
  group: {
    modes: readonly string[]
    mode: string
    sorts: readonly BucketSort[]
    sort: BucketSort | ''
    showEmpty: boolean
    intervalModes?: readonly string[]
    bucketInterval?: number
  }
}

const DEFAULT_GROUP_BUCKET_INTERVAL = 10

const cloneBase = (field: CustomField) => ({
  id: field.id,
  name: field.name,
  ...(field.meta !== undefined
    ? { meta: structuredClone(field.meta) }
    : {})
})

const readOptionFieldOptions = (
  field: CustomField
): FieldOption[] => (
  field.kind === 'select'
  || field.kind === 'multiSelect'
  || field.kind === 'status'
)
  ? field.options
  : []

const cloneFlatOptions = (field: CustomField) => (
  readOptionFieldOptions(field).map(option => ({
    id: option.id,
    name: option.name,
    color: option.color ?? null
  }))
)

const cloneStatusOptions = (field: CustomField) => {
  const sourceOptions = readOptionFieldOptions(field)

  return sourceOptions.length
    ? sourceOptions.map(option => ({
        id: option.id,
        name: option.name,
        color: option.color ?? null,
        category: getStatusOptionCategory(field, option.id) ?? 'todo'
      }))
    : createDefaultStatusOptions()
}

const createLabelGroup = (
  sort: BucketSort,
  showEmpty: boolean
): KindSpec['group'] => ({
  modes: ['value'],
  mode: 'value',
  sorts: ['labelAsc', 'labelDesc'],
  sort,
  showEmpty
})

const createValueGroup = (
  sort: BucketSort,
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

export const CUSTOM_FIELD_KINDS = [
  'text',
  'number',
  'select',
  'multiSelect',
  'status',
  'date',
  'boolean',
  'url',
  'email',
  'phone',
  'asset'
] as const satisfies readonly CustomFieldKind[]

export const kindSpecs = {
  text: {
    create: input => ({ ...input, kind: 'text' }),
    convert: field => ({ ...cloneBase(field), kind: 'text' }),
    hasOptions: false,
    group: createLabelGroup('labelAsc', false)
  },
  number: {
    create: input => ({ ...input, kind: 'number', format: 'number', precision: null, currency: null, useThousandsSeparator: false }),
    convert: field => ({ ...cloneBase(field), kind: 'number', format: 'number', precision: null, currency: null, useThousandsSeparator: false }),
    hasOptions: false,
    group: {
      ...createValueGroup('valueAsc', false),
      modes: ['range'],
      mode: 'range',
      intervalModes: ['range'],
      bucketInterval: DEFAULT_GROUP_BUCKET_INTERVAL
    }
  },
  select: {
    create: input => ({ ...input, kind: 'select', options: [] }),
    convert: field => ({ ...cloneBase(field), kind: 'select', options: cloneFlatOptions(field) }),
    hasOptions: true,
    group: createOptionGroup(['option'], 'option')
  },
  multiSelect: {
    create: input => ({ ...input, kind: 'multiSelect', options: [] }),
    convert: field => ({ ...cloneBase(field), kind: 'multiSelect', options: cloneFlatOptions(field) }),
    hasOptions: true,
    group: createOptionGroup(['option'], 'option')
  },
  status: {
    create: input => {
      const options = createDefaultStatusOptions()

      return {
        ...input,
        kind: 'status' as const,
        options,
        defaultOptionId: options[0]?.id ?? null
      }
    },
    convert: field => {
      const options = cloneStatusOptions(field)

      return {
        ...cloneBase(field),
        kind: 'status' as const,
        options,
        defaultOptionId: options[0]?.id ?? null
      }
    },
    hasOptions: true,
    group: createOptionGroup(['option', 'category'], 'option')
  },
  date: {
    create: input => ({ ...input, kind: 'date', ...createDefaultDateFieldConfig() }),
    convert: field => ({ ...cloneBase(field), kind: 'date', ...createDefaultDateFieldConfig() }),
    hasOptions: false,
    group: {
      ...createValueGroup('valueAsc', false),
      modes: ['day', 'week', 'month', 'quarter', 'year'],
      mode: 'month'
    }
  },
  boolean: {
    create: input => ({ ...input, kind: 'boolean' }),
    convert: field => ({ ...cloneBase(field), kind: 'boolean' }),
    hasOptions: false,
    group: createBooleanGroup()
  },
  url: {
    create: input => ({ ...input, kind: 'url', ...createDefaultUrlFieldConfig() }),
    convert: field => ({ ...cloneBase(field), kind: 'url', ...createDefaultUrlFieldConfig() }),
    hasOptions: false,
    group: createLabelGroup('labelAsc', false)
  },
  email: {
    create: input => ({ ...input, kind: 'email' }),
    convert: field => ({ ...cloneBase(field), kind: 'email' }),
    hasOptions: false,
    group: createLabelGroup('labelAsc', false)
  },
  phone: {
    create: input => ({ ...input, kind: 'phone' }),
    convert: field => ({ ...cloneBase(field), kind: 'phone' }),
    hasOptions: false,
    group: createLabelGroup('labelAsc', false)
  },
  asset: {
    create: input => ({ ...input, kind: 'asset', multiple: true, accept: 'any' }),
    convert: field => ({ ...cloneBase(field), kind: 'asset', multiple: true, accept: 'any' }),
    hasOptions: false,
    group: createPresenceGroup()
  }
} as const satisfies Record<CustomFieldKind, KindSpec>

export const getKindSpec = (
  kind: CustomFieldKind
): KindSpec => kindSpecs[kind]

export const getFieldKindSpec = (
  field?: Pick<CustomField, 'kind'>
): KindSpec | undefined => (
  field
    ? getKindSpec(field.kind)
    : undefined
)

export const createDefaultFieldOfKind = (
  kind: CustomFieldKind,
  input: {
    id: CustomFieldId
    name: string
    meta?: Record<string, unknown>
  }
): CustomField => getKindSpec(kind).create(input)

export const convertFieldKind = (
  field: CustomField,
  kind: CustomFieldKind
): CustomField => getKindSpec(kind).convert(field)

export const createKindConfig = createDefaultFieldOfKind

export const convertFieldKindConfig = convertFieldKind

export const hasFieldOptions = (
  field?: Pick<CustomField, 'kind'>
): field is Pick<CustomField, 'kind'> & { kind: OptionKind } => (
  Boolean(field && getKindSpec(field.kind).hasOptions)
)
