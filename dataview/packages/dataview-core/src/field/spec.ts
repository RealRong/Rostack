import type {
  Field
} from '@dataview/core/contracts'
import {
  KANBAN_EMPTY_BUCKET_KEY
} from '@dataview/core/contracts'
import {
  readDateComparableTimestamp
} from '@dataview/core/field/kind/date'
import {
  getStatusFieldDefaultOption
} from '@dataview/core/field/kind/status'
import {
  readBooleanValue,
  readNumberValue
} from '@dataview/core/field/value'
import {
  getFieldOption
} from '@dataview/core/field/options'
import {
  trimToUndefined
} from '@shared/core'

export interface FieldIndexSpec {
  searchDefaultEnabled: boolean
  bucket: {
    fastKeysOf?: (value: unknown) => readonly string[] | undefined
  }
  sort: {
    scalarOf?: (value: unknown) => string | number | boolean | undefined
  }
}

export interface FieldCalculationSpec {
  uniqueKeyOf: (field: Field | undefined, value: unknown) => string
  optionIdsOf?: (field: Field | undefined, value: unknown) => readonly string[] | undefined
}

export interface FieldCreateSpec {
  defaultValue?: (field: Field) => unknown | undefined
}

export interface FieldViewSpec {
  groupUsesOptionColors: boolean
  kanbanGroupPriority: number
}

export interface FieldSpec {
  index: FieldIndexSpec
  calculation: FieldCalculationSpec
  create: FieldCreateSpec
  view: FieldViewSpec
}

const EMPTY_BUCKET_KEYS = Object.freeze([KANBAN_EMPTY_BUCKET_KEY]) as readonly string[]
const TRUE_BUCKET_KEYS = Object.freeze(['true']) as readonly string[]
const FALSE_BUCKET_KEYS = Object.freeze(['false']) as readonly string[]
const SINGLE_BUCKET_KEYS = new Map<string, readonly string[]>()

const readSingleBucketKeys = (
  key: string
): readonly string[] => {
  const cached = SINGLE_BUCKET_KEYS.get(key)
  if (cached) {
    return cached
  }

  const created = Object.freeze([key]) as readonly string[]
  SINGLE_BUCKET_KEYS.set(key, created)
  return created
}

const toScalarBucketKey = (
  value: unknown
): string => {
  if (value === undefined || value === null) {
    return KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'string') {
    return trimToUndefined(value) ?? KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? String(value)
      : KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const fastSingleOptionBucketKeys = (
  value: unknown
): readonly string[] => readSingleBucketKeys(toScalarBucketKey(value))

const fastMultiOptionBucketKeys = (
  value: unknown
): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return EMPTY_BUCKET_KEYS
  }

  if (value.length === 1) {
    return readSingleBucketKeys(toScalarBucketKey(value[0]))
  }

  return value.map(item => toScalarBucketKey(item))
}

const fastBooleanBucketKeys = (
  value: unknown
): readonly string[] => {
  if (value === true) {
    return TRUE_BUCKET_KEYS
  }

  if (value === false) {
    return FALSE_BUCKET_KEYS
  }

  return EMPTY_BUCKET_KEYS
}

const stableSerialize = (value: unknown): string => {
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
    return `{${entries.join(',')}}`
  }

  return String(value)
}

const asPlainString = (
  value: unknown
): string => trimToUndefined(value) ?? ''

const readOptionField = (
  field: Field | undefined
): Extract<Field, { kind: 'select' | 'multiSelect' | 'status' }> | undefined => (
  field?.kind === 'select' || field?.kind === 'multiSelect' || field?.kind === 'status'
    ? field
    : undefined
)

const normalizeOptionId = (
  field: Field | undefined,
  value: unknown
): string | undefined => {
  const optionField = readOptionField(field)
  if (!optionField || typeof value !== 'string') {
    return undefined
  }

  return getFieldOption(optionField, value)?.id ?? trimToUndefined(value)
}

const readSingleOptionIds = (
  field: Field | undefined,
  value: unknown
): readonly string[] | undefined => {
  const optionId = normalizeOptionId(field, value)
  return optionId
    ? readSingleBucketKeys(optionId)
    : undefined
}

const readMultiOptionIds = (
  field: Field | undefined,
  value: unknown
): readonly string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }

  const seen = new Set<string>()
  const optionIds: string[] = []

  for (let index = 0; index < value.length; index += 1) {
    const optionId = normalizeOptionId(field, value[index])
    if (!optionId || seen.has(optionId)) {
      continue
    }

    seen.add(optionId)
    optionIds.push(optionId)
  }

  if (!optionIds.length) {
    return undefined
  }

  optionIds.sort((left, right) => left.localeCompare(right))
  return optionIds
}

const createFieldSpec = (input: {
  searchDefaultEnabled?: boolean
  fastBucketKeysOf?: (value: unknown) => readonly string[] | undefined
  sortScalarOf?: (value: unknown) => string | number | boolean | undefined
  uniqueKeyOf?: (field: Field | undefined, value: unknown) => string
  optionIdsOf?: (field: Field | undefined, value: unknown) => readonly string[] | undefined
  defaultValue?: (field: Field) => unknown | undefined
  groupUsesOptionColors?: boolean
  kanbanGroupPriority?: number
}): FieldSpec => ({
  index: {
    searchDefaultEnabled: input.searchDefaultEnabled === true,
    bucket: {
      ...(input.fastBucketKeysOf
        ? {
            fastKeysOf: input.fastBucketKeysOf
          }
        : {})
    },
    sort: {
      ...(input.sortScalarOf
        ? {
            scalarOf: input.sortScalarOf
          }
        : {})
    }
  },
  calculation: {
    uniqueKeyOf: input.uniqueKeyOf ?? ((_field, value) => stableSerialize(value)),
    ...(input.optionIdsOf
      ? {
          optionIdsOf: input.optionIdsOf
        }
      : {})
  },
  create: {
    ...(input.defaultValue
      ? {
          defaultValue: input.defaultValue
        }
      : {})
  },
  view: {
    groupUsesOptionColors: input.groupUsesOptionColors === true,
    kanbanGroupPriority: input.kanbanGroupPriority ?? 0
  }
})

const fieldSpecsByKind = {
  title: createFieldSpec({
    searchDefaultEnabled: true,
    uniqueKeyOf: (_field, value) => `text:${asPlainString(value)}`
  }),
  text: createFieldSpec({
    searchDefaultEnabled: true,
    uniqueKeyOf: (_field, value) => `text:${asPlainString(value)}`
  }),
  url: createFieldSpec({
    searchDefaultEnabled: true,
    uniqueKeyOf: (_field, value) => `text:${asPlainString(value)}`
  }),
  email: createFieldSpec({
    searchDefaultEnabled: true,
    uniqueKeyOf: (_field, value) => `text:${asPlainString(value)}`
  }),
  phone: createFieldSpec({
    searchDefaultEnabled: true,
    uniqueKeyOf: (_field, value) => `text:${asPlainString(value)}`
  }),
  number: createFieldSpec({
    sortScalarOf: readNumberValue,
    uniqueKeyOf: (_field, value) => {
      const number = readNumberValue(value)
      return number === undefined
        ? stableSerialize(value)
        : `number:${number}`
    }
  }),
  date: createFieldSpec({
    sortScalarOf: readDateComparableTimestamp
  }),
  select: createFieldSpec({
    searchDefaultEnabled: true,
    fastBucketKeysOf: fastSingleOptionBucketKeys,
    uniqueKeyOf: (_field, value) => `option:${asPlainString(value)}`,
    optionIdsOf: readSingleOptionIds,
    groupUsesOptionColors: true,
    kanbanGroupPriority: 2
  }),
  multiSelect: createFieldSpec({
    searchDefaultEnabled: true,
    fastBucketKeysOf: fastMultiOptionBucketKeys,
    uniqueKeyOf: (field, value) => {
      const optionIds = readMultiOptionIds(field, value)
      return optionIds
        ? `multi:${JSON.stringify(optionIds)}`
        : stableSerialize(value)
    },
    optionIdsOf: readMultiOptionIds,
    groupUsesOptionColors: true,
    kanbanGroupPriority: 1
  }),
  status: createFieldSpec({
    searchDefaultEnabled: true,
    fastBucketKeysOf: fastSingleOptionBucketKeys,
    uniqueKeyOf: (_field, value) => `option:${asPlainString(value)}`,
    optionIdsOf: readSingleOptionIds,
    defaultValue: field => (
      field.kind === 'status'
        ? getStatusFieldDefaultOption(field)?.id
        : undefined
    ),
    groupUsesOptionColors: true,
    kanbanGroupPriority: 3
  }),
  boolean: createFieldSpec({
    fastBucketKeysOf: fastBooleanBucketKeys,
    uniqueKeyOf: (_field, value) => {
      const booleanValue = readBooleanValue(value)
      return booleanValue === undefined
        ? stableSerialize(value)
        : `boolean:${booleanValue}`
    }
  }),
  asset: createFieldSpec({})
} as const satisfies Record<Field['kind'], FieldSpec>

export const getFieldSpec = (
  field: Pick<Field, 'kind'>
): FieldSpec => fieldSpecsByKind[field.kind]

export const readFieldSpec = (
  field?: Pick<Field, 'kind'>
): FieldSpec | undefined => (
  field
    ? getFieldSpec(field)
    : undefined
)
