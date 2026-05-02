import type {
  SystemValueId
} from '@dataview/core/types'
import {
  KANBAN_EMPTY_BUCKET_KEY
} from '@dataview/core/types/state'
import type {
  AssetField,
  BucketSort,
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  DateField,
  FieldOption,
  FlatOption,
  MultiSelectField,
  NumberField,
  SelectField,
  StatusField,
  StatusOption,
  UrlField
} from '@dataview/core/types/state'
import type {
  Bucket,
  ResolvedBucket
} from '@dataview/core/field/kind/group'
import {
  fieldDate,
  type DateGroupMode
} from '@dataview/core/field/kind/date'
import {
  compareStatusFieldValues,
  createDefaultStatusOptions,
  getStatusCategoryColor,
  getStatusCategoryOrder,
  getStatusDefaultOption,
  getStatusOptionCategory,
  STATUS_CATEGORIES
} from '@dataview/core/field/kind/status'
import {
  formatUrlDisplayValue,
  createDefaultUrlFieldConfig
} from '@dataview/core/field/kind/url'
import {
  createFieldOptionId,
  readFieldOption,
  readFieldOptionId,
  readFieldOptionOrder,
  readFieldOptionTokens,
  readFieldOptions,
  replaceFieldOptions,
  type OptionField
} from '@dataview/core/field/option'
import {
  type DraftParseResult as FieldDraftParseResult,
  expandSearchableValue,
  isEmptyValue
} from '@dataview/core/field/value'
import { compare, entityTable, json, parse, string } from '@shared/core'
import {
  spec
} from '@shared/spec'
import type {
  Token
} from '@shared/i18n'
import {
  tokenRef
} from '@shared/i18n'

export type OptionKind = OptionField['kind']
export type FieldInput = CustomField | undefined

export interface FieldOptionWrite {
  kind: 'keep' | 'clear' | 'set'
  value?: unknown
}

export interface FieldOptionSpec {
  createOption: (input: {
    field: OptionField
    options: readonly FieldOption[]
    name: string
  }) => FieldOption
  updateOption: (input: {
    field: OptionField
    option: FieldOption
    patch: {
      name?: string
      color?: string | null
      category?: StatusOption['category']
    }
  }) => FieldOption
  patchForRemove: (input: {
    field: OptionField
    options: readonly FieldOption[]
    optionId: string
  }) => Partial<Omit<CustomField, 'id'>>
  projectValueWithoutOption: (input: {
    field: OptionField
    value: unknown
    optionId: string
  }) => FieldOptionWrite
}

export interface FieldSchemaValidationIssue {
  path: string
  message: string
}

export interface KindSpec {
  create: {
    default: (input: {
      id: CustomFieldId
      name: string
      meta?: Record<string, unknown>
    }) => CustomField
    convert: (field: CustomField) => CustomField
    defaultValue?: (field: CustomField) => unknown | undefined
  }
  schema: {
    normalize: (field: CustomField) => CustomField
    validate: (field: CustomField, path: string) => readonly FieldSchemaValidationIssue[]
  }
  value: {
    display: (field: FieldInput, value: unknown) => string | undefined
    parse: (field: FieldInput, draft: string) => FieldDraftParseResult
    search: (field: FieldInput, value: unknown) => string[]
    compare: (field: FieldInput, left: unknown, right: unknown) => number
  }
  group: {
    modes: readonly string[]
    defaultMode: string
    sorts: readonly BucketSort[]
    defaultSort: BucketSort | ''
    showEmpty: boolean
    intervalModes?: readonly string[]
    defaultInterval?: number
    domain: (field: FieldInput, mode: string) => readonly Bucket[]
    entries: (
      field: FieldInput,
      value: unknown,
      mode: string,
      bucketInterval?: number
    ) => readonly Bucket[]
  }
  index: {
    searchDefaultEnabled: boolean
    bucketKeys?: (value: unknown) => readonly string[] | undefined
    sortScalar?: (value: unknown) => string | number | boolean | undefined
  }
  calculation: {
    uniqueKey: (field: FieldInput, value: unknown) => string
    optionIds?: (field: FieldInput, value: unknown) => readonly string[] | undefined
  }
  view: {
    groupUsesOptionColors: boolean
    kanbanGroupPriority: number
  }
  behavior: {
    canQuickToggle: boolean
    toggle?: (value: unknown) => unknown | undefined
  }
  option?: FieldOptionSpec
}

const DEFAULT_GROUP_BUCKET_INTERVAL = 10

const KEEP_WRITE: FieldOptionWrite = Object.freeze({
  kind: 'keep'
})

const CLEAR_WRITE: FieldOptionWrite = Object.freeze({
  kind: 'clear'
})

const EMPTY_BUCKET_KEYS = Object.freeze([KANBAN_EMPTY_BUCKET_KEY]) as readonly string[]
const TRUE_BUCKET_KEYS = Object.freeze(['true']) as readonly string[]
const FALSE_BUCKET_KEYS = Object.freeze(['false']) as readonly string[]
const SINGLE_BUCKET_KEYS = new Map<string, readonly string[]>()

const createFieldSchemaIssue = (
  path: string,
  message: string
): FieldSchemaValidationIssue => ({
  path,
  message
})

const cloneBase = (
  field: CustomField
) => ({
  id: field.id,
  name: field.name,
  ...(field.meta !== undefined
    ? { meta: structuredClone(field.meta) }
    : {})
})

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

const asPlainString = (
  value: unknown
): string => (
  typeof value === 'string'
    ? value.trim()
    : String(value ?? '').trim()
)

const compareText = (
  left: unknown,
  right: unknown
) => compare.compareText(
  expandSearchableValue(left).join(', ').toLowerCase(),
  expandSearchableValue(right).join(', ').toLowerCase()
)

const systemValueToken = (
  id: SystemValueId
): Token => tokenRef('dataview.systemValue', id)

const rawValueToken = (
  text: string
): Token => text

const displayPlainValue = (
  value: unknown
): string | undefined => {
  if (isEmptyValue(value)) {
    return undefined
  }

  return Array.isArray(value)
    ? value.map(item => String(item)).join(', ')
    : String(value)
}

const toggleBooleanValue = (
  value: unknown
) => (
  value === true
    ? false
    : true
)

const compareNumberValues = (
  left: unknown,
  right: unknown
) => {
  const leftNumber = parse.readFiniteNumber(left)
  const rightNumber = parse.readFiniteNumber(right)
  if (leftNumber !== undefined && rightNumber !== undefined) {
    return compare.comparePrimitive(leftNumber, rightNumber)
  }

  return compareText(left, right)
}

const compareDateValues = (
  left: unknown,
  right: unknown
) => {
  const leftTimestamp = fieldDate.value.comparableTimestamp(left)
  const rightTimestamp = fieldDate.value.comparableTimestamp(right)
  if (leftTimestamp !== undefined && rightTimestamp !== undefined) {
    return compare.comparePrimitive(leftTimestamp, rightTimestamp)
  }

  return compareText(left, right)
}

const compareBooleanValues = (
  left: unknown,
  right: unknown
) => {
  const leftBoolean = parse.readBooleanLike(left)
  const rightBoolean = parse.readBooleanLike(right)
  if (leftBoolean !== undefined && rightBoolean !== undefined) {
    return compare.comparePrimitive(leftBoolean ? 1 : 0, rightBoolean ? 1 : 0)
  }

  return compareText(left, right)
}

const compareTextValues = (
  _field: FieldInput,
  left: unknown,
  right: unknown
) => {
  const leftDateKey = left && typeof left === 'object'
    ? fieldDate.group.sortKey(left)
    : undefined
  const rightDateKey = right && typeof right === 'object'
    ? fieldDate.group.sortKey(right)
    : undefined

  if (leftDateKey && rightDateKey) {
    return compare.comparePrimitive(leftDateKey, rightDateKey)
  }

  return compareText(left, right)
}

const toScalarBucketKey = (
  value: unknown
): string => {
  if (value === undefined || value === null) {
    return KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized || KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? String(value)
      : KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (value && typeof value === 'object') {
    const dateKey = fieldDate.group.sortKey(value)
    if (dateKey) {
      return dateKey
    }

    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

const scalarSortValue = (
  value: unknown
): string | number | boolean | null => {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : null
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized || null
  }

  if (value && typeof value === 'object') {
    return fieldDate.group.sortKey(value) ?? null
  }

  return String(value)
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

const normalizeOptionColor = (
  value: unknown
): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized || null
}

const normalizeFlatOption = (
  option: FlatOption
): FlatOption | undefined => {
  const id = option.id?.trim()
  const name = option.name?.trim()
  if (!id || !name) {
    return undefined
  }

  return {
    id,
    name,
    color: normalizeOptionColor(option.color)
  }
}

const normalizeStatusOption = (
  option: StatusOption
): StatusOption | undefined => {
  const normalized = normalizeFlatOption(option)
  if (!normalized) {
    return undefined
  }

  return {
    ...normalized,
    category: STATUS_CATEGORIES.includes(option.category)
      ? option.category
      : 'todo'
  }
}

const normalizeStatusDefaultOptionId = (
  options: readonly StatusOption[],
  value: unknown
) => {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  return options.some(option => option.id === normalized)
    ? normalized
    : null
}

const validateBaseOptions = (
  options: readonly FlatOption[],
  path: string
): FieldSchemaValidationIssue[] => {
  const issues: FieldSchemaValidationIssue[] = []
  const ids = new Set<string>()
  const names = new Set<string>()

  options.forEach((option, index) => {
    if (!string.isNonEmptyString(option.id)) {
      issues.push(createFieldSchemaIssue(
        `${path}.${index}.id`,
        'Field option id must be a non-empty string'
      ))
    } else if (ids.has(option.id)) {
      issues.push(createFieldSchemaIssue(
        `${path}.${index}.id`,
        `Duplicate field option id: ${option.id}`
      ))
    } else {
      ids.add(option.id)
    }

    if (!string.isNonEmptyString(option.name)) {
      issues.push(createFieldSchemaIssue(
        `${path}.${index}.name`,
        'Field option name must be a non-empty string'
      ))
    } else {
      const normalizedName = string.trimLowercase(option.name)
      if (!normalizedName) {
        issues.push(createFieldSchemaIssue(
          `${path}.${index}.name`,
          'Field option name must be a non-empty string'
        ))
      } else if (names.has(normalizedName)) {
        issues.push(createFieldSchemaIssue(
          `${path}.${index}.name`,
          `Duplicate field option name: ${option.name}`
        ))
      } else {
        names.add(normalizedName)
      }
    }

    if (option.color !== null && !string.isNonEmptyString(option.color)) {
      issues.push(createFieldSchemaIssue(
        `${path}.${index}.color`,
        'Field option color must be null or a non-empty string'
      ))
    }
  })

  return issues
}

const cloneFlatOptions = (
  field: CustomField
) => readFieldOptions(field).map(option => ({
  id: option.id,
  name: option.name,
  color: option.color ?? null
}))

const toFlatOptionTable = (
  options: readonly FlatOption[]
) => entityTable.normalize.list(options.map(option => ({
  id: option.id,
  name: option.name,
  color: option.color ?? null
})))

const toStatusOptionTable = (
  options: readonly StatusOption[]
) => entityTable.normalize.list(options.map(option => ({
  id: option.id,
  name: option.name,
  color: option.color ?? null,
  category: option.category
})))

const cloneStatusOptions = (
  field: CustomField
) => {
  const sourceOptions = readFieldOptions(field)

  return sourceOptions.length
    ? sourceOptions.map(option => ({
        id: option.id,
        name: option.name,
        color: option.color ?? null,
        category: getStatusOptionCategory(field, option.id) ?? 'todo'
      }))
    : createDefaultStatusOptions()
}

const getOptionDisplay = (
  field: FieldInput,
  optionId: unknown
) => {
  const option = readFieldOption(field, optionId)
  return option?.name ?? (
    typeof optionId === 'string'
      ? optionId
      : undefined
  )
}

const getOptionTokens = (
  field: FieldInput,
  optionId: unknown
) => readFieldOptionTokens(field, optionId)

const getOptionOrder = (
  field: FieldInput,
  optionId: unknown
) => readFieldOptionOrder(field, optionId)

const normalizeOptionId = (
  field: FieldInput,
  value: unknown
): string | undefined => readFieldOptionId(field, value)

const readSingleOptionIds = (
  field: FieldInput,
  value: unknown
): readonly string[] | undefined => {
  const optionId = normalizeOptionId(field, value)
  return optionId
    ? readSingleBucketKeys(optionId)
    : undefined
}

const readMultiOptionIds = (
  field: FieldInput,
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

const compareOptionValues = (
  field: FieldInput,
  left: unknown,
  right: unknown
) => {
  const leftOrder = getOptionOrder(field, left)
  const rightOrder = getOptionOrder(field, right)
  if (leftOrder !== undefined && rightOrder !== undefined) {
    return compare.comparePrimitive(leftOrder, rightOrder)
  }

  return compareText(
    getOptionDisplay(field, left),
    getOptionDisplay(field, right)
  )
}

const displayOptionValue = (
  field: FieldInput,
  value: unknown
) => (
  isEmptyValue(value)
    ? undefined
    : getOptionDisplay(field, value)
)

const displayMultiOptionValue = (
  field: FieldInput,
  value: unknown
) => {
  if (isEmptyValue(value)) {
    return undefined
  }

  return Array.isArray(value)
    ? value.map(item => getOptionDisplay(field, item) ?? String(item)).join(', ')
    : undefined
}

const searchOptionValue = (
  field: FieldInput,
  value: unknown
) => getOptionTokens(field, value)

const searchMultiOptionValue = (
  field: FieldInput,
  value: unknown
) => Array.isArray(value)
  ? value.flatMap(item => getOptionTokens(field, item))
  : []

const parseTextDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => ({
  type: 'set',
  value: draft
})

const parseNumberDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => {
  if (!draft.trim()) {
    return {
      type: 'clear'
    }
  }

  const numeric = parse.readLooseNumber(draft)
  return Number.isFinite(numeric)
    ? {
        type: 'set',
        value: numeric
      }
    : {
        type: 'clear'
      }
}

const parseDateDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => {
  if (!draft.trim()) {
    return {
      type: 'clear'
    }
  }

  const parsed = fieldDate.draft.parse(draft)
  return parsed
    ? {
        type: 'set',
        value: parsed
      }
    : {
        type: 'invalid'
      }
}

const parseSingleOptionDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => (
  draft.trim()
    ? {
        type: 'set',
        value: draft.trim()
      }
    : {
        type: 'clear'
      }
)

const parseMultiOptionDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => {
  const value = draft
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  return value.length
    ? {
        type: 'set',
        value
      }
    : {
        type: 'clear'
      }
}

const parseBooleanDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => {
  if (!draft.trim()) {
    return {
      type: 'clear'
    }
  }

  const booleanValue = parse.readBooleanLike(draft)
  return booleanValue === undefined
    ? {
        type: 'invalid'
      }
    : {
        type: 'set',
        value: booleanValue
      }
}

const parseBinaryAssetDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => (
  !draft.trim()
    ? {
        type: 'clear'
      }
    : {
        type: 'invalid'
      }
)

const displayBooleanValue = (
  value: unknown
) => {
  if (isEmptyValue(value)) {
    return undefined
  }

  const booleanValue = parse.readBooleanLike(value)
  return booleanValue === undefined
    ? String(value)
    : booleanValue
      ? 'True'
      : 'False'
}

const createObservedScalarBucket = (
  field: FieldInput,
  value: unknown,
  display: KindSpec['value']['display'],
  order = Number.MAX_SAFE_INTEGER
): ResolvedBucket => {
  if (isEmptyValue(value)) {
    return {
      key: KANBAN_EMPTY_BUCKET_KEY,
      label: systemValueToken('value.empty'),
      clearValue: true,
      empty: true,
      order,
      sortLabel: '',
      sortValue: null
    }
  }

  const displayValue = display(field, value)
  const normalizedStringValue = typeof value === 'string'
    ? value.trim()
    : undefined

  return {
    key: toScalarBucketKey(value),
    label: rawValueToken(
      normalizedStringValue && normalizedStringValue.length
        ? normalizedStringValue
        : displayValue ?? String(value)
    ),
    value,
    clearValue: false,
    empty: false,
    order,
    sortLabel: normalizedStringValue && normalizedStringValue.length
      ? normalizedStringValue
      : displayValue ?? String(value),
    sortValue: scalarSortValue(value)
  }
}

const createObservedBuckets = (
  field: FieldInput,
  value: unknown,
  display: KindSpec['value']['display']
): readonly Bucket[] => (
  Array.isArray(value)
    ? value.map((item, index) => createObservedScalarBucket(field, item, display, index))
    : [createObservedScalarBucket(field, value, display)]
)

const createOptionBucket = (
  option: {
    id: string
    name: string
    color?: string | null
  },
  order: number,
  value: unknown = option.id
): ResolvedBucket => ({
  key: option.id,
  label: option.name || option.id,
  value,
  clearValue: false,
  color: option.color ?? undefined,
  empty: false,
  order,
  sortLabel: option.name,
  sortValue: option.name
})

const integerRangeTitle = (
  start: number,
  interval: number
) => (
  interval === 1
    ? String(start)
    : `${start}-${start + interval - 1}`
)

const decimalRangeTitle = (
  start: number,
  interval: number
) => `${start}-${start + interval}`

const createNumberRangeBucket = (
  start: number,
  interval: number
): ResolvedBucket => ({
  key: `range:${start}:${interval}`,
  label: rawValueToken(
    Number.isInteger(start) && Number.isInteger(interval)
      ? integerRangeTitle(start, interval)
      : decimalRangeTitle(start, interval)
  ),
  value: {
    start,
    end: start + interval
  },
  clearValue: false,
  empty: false,
  order: start,
  sortLabel: Number.isInteger(start) && Number.isInteger(interval)
    ? integerRangeTitle(start, interval)
    : decimalRangeTitle(start, interval),
  sortValue: start
})

const createDateGroupBucket = (
  mode: DateGroupMode,
  start: string
): ResolvedBucket => ({
  key: fieldDate.group.createKey(mode, start),
  label: tokenRef('dataview.dateBucket', undefined, {
    mode,
    start
  }),
  value: start,
  clearValue: false,
  empty: false,
  order: fieldDate.value.comparableTimestamp({
    kind: 'date',
    start
  }) ?? Number.MAX_SAFE_INTEGER,
  sortLabel: start,
  sortValue: fieldDate.value.comparableTimestamp({
    kind: 'date',
    start
  }) ?? null
})

const createBooleanBucket = (
  key: 'true' | 'false' | '(empty)',
  order: number
): ResolvedBucket => {
  if (key === KANBAN_EMPTY_BUCKET_KEY) {
    return {
      key,
      label: systemValueToken('value.empty'),
      clearValue: true,
      empty: true,
      order,
      sortLabel: '',
      sortValue: null
    }
  }

  return {
    key,
    label: systemValueToken(
      key === 'true'
        ? 'value.checked'
        : 'value.unchecked'
    ),
    value: key === 'true',
    clearValue: false,
    empty: false,
    order,
    sortLabel: key,
    sortValue: key === 'true'
  }
}

const createPresenceBucket = (
  key: 'present' | '(empty)',
  order: number
): ResolvedBucket => (
  key === KANBAN_EMPTY_BUCKET_KEY
    ? {
        key,
        label: systemValueToken('value.empty'),
        clearValue: true,
        empty: true,
        order,
        sortLabel: '',
        sortValue: null
      }
    : {
        key,
        label: systemValueToken('value.hasValue'),
        value: true,
        clearValue: false,
        empty: false,
        order,
        sortLabel: 'present',
        sortValue: true
      }
)

const createStatusCategoryBucket = (
  field: FieldInput,
  category: typeof STATUS_CATEGORIES[number]
): ResolvedBucket => ({
  key: category,
  label: tokenRef('dataview.statusCategory', category),
  value: getStatusDefaultOption(field, category)?.id,
  clearValue: false,
  color: getStatusCategoryColor(category),
  empty: false,
  order: getStatusCategoryOrder(category),
  sortLabel: category,
  sortValue: getStatusCategoryOrder(category)
})

const defaultGroupDomain = (
  _field: FieldInput,
  _mode: string
): readonly Bucket[] => []

const defaultGroupEntries = (
  field: FieldInput,
  value: unknown,
  display: KindSpec['value']['display']
): readonly Bucket[] => createObservedBuckets(field, value, display)

const numberGroupEntries = (
  field: FieldInput,
  value: unknown,
  bucketInterval: number | undefined,
  display: KindSpec['value']['display']
): readonly Bucket[] => {
  const interval = bucketInterval ?? DEFAULT_GROUP_BUCKET_INTERVAL
  if (typeof value === 'number' && Number.isFinite(value)) {
    const start = Math.floor(value / interval) * interval
    return [createNumberRangeBucket(start, interval)]
  }

  return [createObservedScalarBucket(field, value, display)]
}

const dateGroupEntries = (
  field: FieldInput,
  value: unknown,
  mode: string,
  display: KindSpec['value']['display']
): readonly Bucket[] => {
  const normalizedMode = mode as DateGroupMode
  const start = fieldDate.group.start(value, normalizedMode)

  return start
    ? [createDateGroupBucket(normalizedMode, start)]
    : [createObservedScalarBucket(field, value, display)]
}

const selectGroupDomain = (
  field: FieldInput,
  display: KindSpec['value']['display']
): readonly Bucket[] => {
  const options = readFieldOptions(field)

  return [
    ...options.map((option, index) => createOptionBucket(option, index)),
    createObservedScalarBucket(field, undefined, display, options.length)
  ]
}

const selectGroupEntries = (
  field: FieldInput,
  value: unknown,
  display: KindSpec['value']['display']
): readonly Bucket[] => {
  const options = readFieldOptions(field)
  const option = typeof value === 'string'
    ? options.find(item => item.id === value)
    : undefined

  return [option
    ? createOptionBucket(option, options.indexOf(option))
    : createObservedScalarBucket(field, value, display)]
}

const multiSelectGroupDomain = (
  field: FieldInput,
  display: KindSpec['value']['display']
): readonly Bucket[] => {
  const options = readFieldOptions(field)

  return [
    ...options.map((option, index) => createOptionBucket(option, index, [option.id])),
    createObservedScalarBucket(field, undefined, display, options.length)
  ]
}

const multiSelectGroupEntries = (
  field: FieldInput,
  value: unknown,
  display: KindSpec['value']['display']
): readonly Bucket[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return [createObservedScalarBucket(field, undefined, display)]
  }

  const options = readFieldOptions(field)
  return value.map((item, index) => {
    const option = typeof item === 'string'
      ? options.find(candidate => candidate.id === item)
      : undefined

    return option
      ? createOptionBucket(option, options.indexOf(option), [option.id])
      : createObservedScalarBucket(field, item, display, index)
  })
}

const statusGroupDomain = (
  field: FieldInput,
  mode: string,
  display: KindSpec['value']['display']
): readonly Bucket[] => {
  if (mode === 'category') {
    return [
      ...STATUS_CATEGORIES.map(category => createStatusCategoryBucket(field, category)),
      createObservedScalarBucket(field, undefined, display, STATUS_CATEGORIES.length)
    ]
  }

  return selectGroupDomain(field, display)
}

const statusGroupEntries = (
  field: FieldInput,
  value: unknown,
  mode: string,
  display: KindSpec['value']['display']
): readonly Bucket[] => {
  const options = readFieldOptions(field)
  const option = typeof value === 'string'
    ? options.find(item => item.id === value)
    : undefined

  if (mode === 'category') {
    if (!option) {
      return [createObservedScalarBucket(field, value, display)]
    }

    const category = getStatusOptionCategory(field, option.id)
    return category
      ? [createStatusCategoryBucket(field, category)]
      : [createObservedScalarBucket(field, value, display)]
  }

  return [option
    ? createOptionBucket(option, options.indexOf(option))
    : createObservedScalarBucket(field, value, display)]
}

const booleanGroupDomain = (): readonly Bucket[] => [
  createBooleanBucket('true', 0),
  createBooleanBucket('false', 1),
  createBooleanBucket(KANBAN_EMPTY_BUCKET_KEY, 2)
]

const booleanGroupEntries = (
  value: unknown
): readonly Bucket[] => {
  if (value === true) {
    return [createBooleanBucket('true', 0)]
  }

  if (value === false) {
    return [createBooleanBucket('false', 1)]
  }

  return [createBooleanBucket(KANBAN_EMPTY_BUCKET_KEY, 2)]
}

const presenceGroupDomain = (): readonly Bucket[] => [
  createPresenceBucket('present', 0),
  createPresenceBucket(KANBAN_EMPTY_BUCKET_KEY, 1)
]

const presenceGroupEntries = (
  value: unknown
): readonly Bucket[] => (
  isEmptyValue(value)
    ? [createPresenceBucket(KANBAN_EMPTY_BUCKET_KEY, 1)]
    : [createPresenceBucket('present', 0)]
)

const createLabelGroup = (
  defaultSort: BucketSort,
  showEmpty: boolean,
  input: Pick<KindSpec['group'], 'domain' | 'entries'>
): KindSpec['group'] => ({
  modes: ['value'],
  defaultMode: 'value',
  sorts: ['labelAsc', 'labelDesc'],
  defaultSort,
  showEmpty,
  ...input
})

const createValueGroup = (
  defaultSort: BucketSort,
  showEmpty: boolean,
  input: Pick<KindSpec['group'], 'domain' | 'entries'> & {
    modes?: readonly string[]
    defaultMode?: string
    intervalModes?: readonly string[]
    defaultInterval?: number
  }
): KindSpec['group'] => ({
  modes: input.modes ?? ['value'],
  defaultMode: input.defaultMode ?? 'value',
  sorts: ['valueAsc', 'valueDesc'],
  defaultSort,
  showEmpty,
  ...(input.intervalModes
    ? {
        intervalModes: input.intervalModes
      }
    : {}),
  ...(input.defaultInterval !== undefined
    ? {
        defaultInterval: input.defaultInterval
      }
    : {}),
  domain: input.domain,
  entries: input.entries
})

const createOptionGroup = (
  modes: readonly string[],
  defaultMode: string,
  input: Pick<KindSpec['group'], 'domain' | 'entries'>
): KindSpec['group'] => ({
  modes,
  defaultMode,
  sorts: ['manual', 'labelAsc', 'labelDesc'],
  defaultSort: 'manual',
  showEmpty: true,
  ...input
})

const createBooleanGroup = (
  input: Pick<KindSpec['group'], 'domain' | 'entries'>
): KindSpec['group'] => ({
  modes: ['boolean'],
  defaultMode: 'boolean',
  sorts: ['manual', 'valueAsc', 'valueDesc'],
  defaultSort: 'manual',
  showEmpty: true,
  ...input
})

const createPresenceGroup = (
  input: Pick<KindSpec['group'], 'domain' | 'entries'>
): KindSpec['group'] => ({
  modes: ['presence'],
  defaultMode: 'presence',
  sorts: ['manual'],
  defaultSort: 'manual',
  showEmpty: true,
  ...input
})

const createOptionSpec = (input: {
  updateOption: FieldOptionSpec['updateOption']
  patchForRemove: FieldOptionSpec['patchForRemove']
  projectValueWithoutOption: FieldOptionSpec['projectValueWithoutOption']
}): FieldOptionSpec => ({
  createOption: ({ field, options, name }) => ({
    id: createFieldOptionId(options, name),
    name,
    color: null,
    ...(field.kind === 'status'
      ? {
          category: 'todo' as const
        }
      : {})
  }),
  updateOption: input.updateOption,
  patchForRemove: input.patchForRemove,
  projectValueWithoutOption: input.projectValueWithoutOption
})

const singleValueOptionSpec = createOptionSpec({
  updateOption: ({ field, option, patch }) => ({
    ...option,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(field.kind === 'status' && patch.category !== undefined
      ? { category: patch.category }
      : {})
  }),
  patchForRemove: ({ field, options, optionId }) => ({
    ...replaceFieldOptions(
      field,
      options.filter(option => option.id !== optionId)
    ),
    ...(field.kind === 'status' && field.defaultOptionId === optionId
      ? { defaultOptionId: null }
      : {})
  }) as Partial<Omit<CustomField, 'id'>>,
  projectValueWithoutOption: ({ value, optionId }) => (
    value === optionId
      ? CLEAR_WRITE
      : KEEP_WRITE
  )
})

const multiValueOptionSpec = createOptionSpec({
  updateOption: ({ option, patch }) => ({
    ...option,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {})
  }),
  patchForRemove: ({ field, options, optionId }) => replaceFieldOptions(
    field,
    options.filter(option => option.id !== optionId)
  ) as Partial<Omit<CustomField, 'id'>>,
  projectValueWithoutOption: ({ value, optionId }) => {
    if (!Array.isArray(value)) {
      return KEEP_WRITE
    }

    const nextValue = value.filter(item => item !== optionId)
    if (nextValue.length === value.length) {
      return KEEP_WRITE
    }

    return nextValue.length
      ? {
          kind: 'set',
          value: nextValue
        }
      : CLEAR_WRITE
  }
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

export const fieldKindSpec = {
  text: {
    create: {
      default: input => ({
        ...input,
        kind: 'text'
      }),
      convert: field => ({
        ...cloneBase(field),
        kind: 'text'
      })
    },
    schema: {
      normalize: field => ({
        ...cloneBase(field),
        kind: 'text'
      }),
      validate: () => []
    },
    value: {
      display: (_field, value) => displayPlainValue(value),
      parse: parseTextDraft,
      search: (_field, value) => expandSearchableValue(value),
      compare: compareTextValues
    },
    group: createLabelGroup('labelAsc', false, {
      domain: defaultGroupDomain,
      entries: (field, value) => defaultGroupEntries(field, value, (_target, current) => displayPlainValue(current))
    }),
    index: {
      searchDefaultEnabled: true
    },
    calculation: {
      uniqueKey: (_field, value) => `text:${asPlainString(value)}`
    },
    view: {
      groupUsesOptionColors: false,
      kanbanGroupPriority: 0
    },
    behavior: {
      canQuickToggle: false
    }
  },
  number: {
    create: {
      default: input => ({
        ...input,
        kind: 'number',
        format: 'number',
        precision: null,
        currency: null,
        useThousandsSeparator: false
      }),
      convert: field => ({
        ...cloneBase(field),
        kind: 'number',
        format: 'number',
        precision: null,
        currency: null,
        useThousandsSeparator: false
      })
    },
    schema: {
      normalize: field => {
        const current = field as NumberField
        const defaults = fieldKindSpec.number.create.default({
          id: current.id,
          name: current.name,
          ...(current.meta !== undefined ? { meta: structuredClone(current.meta) } : {})
        }) as NumberField
        return {
          ...defaults,
          format: ['number', 'integer', 'percent', 'currency'].includes(current.format)
            ? current.format
            : defaults.format,
          precision: typeof current.precision === 'number'
            && Number.isInteger(current.precision)
            && current.precision >= 0
            ? current.precision
            : null,
          currency: typeof current.currency === 'string' && current.currency.trim()
            ? current.currency.trim()
            : null,
          useThousandsSeparator: current.useThousandsSeparator === true
        }
      },
      validate: (field, path) => {
        const current = field as NumberField
        const issues: FieldSchemaValidationIssue[] = []
        if (!['number', 'integer', 'percent', 'currency'].includes(current.format)) {
          issues.push(createFieldSchemaIssue(
            `${path}.format`,
            'Number field format is invalid'
          ))
        }
        if (current.precision !== null && (!Number.isInteger(current.precision) || current.precision < 0)) {
          issues.push(createFieldSchemaIssue(
            `${path}.precision`,
            'Number field precision must be null or a non-negative integer'
          ))
        }
        if (current.currency !== null && !string.isNonEmptyString(current.currency)) {
          issues.push(createFieldSchemaIssue(
            `${path}.currency`,
            'Number field currency must be null or a non-empty string'
          ))
        }
        if (typeof current.useThousandsSeparator !== 'boolean') {
          issues.push(createFieldSchemaIssue(
            `${path}.useThousandsSeparator`,
            'Number field useThousandsSeparator must be boolean'
          ))
        }
        return issues
      }
    },
    value: {
      display: (_field, value) => displayPlainValue(value),
      parse: parseNumberDraft,
      search: (_field, value) => expandSearchableValue(value),
      compare: (_field, left, right) => compareNumberValues(left, right)
    },
    group: createValueGroup('valueAsc', false, {
      modes: ['range'],
      defaultMode: 'range',
      intervalModes: ['range'],
      defaultInterval: DEFAULT_GROUP_BUCKET_INTERVAL,
      domain: defaultGroupDomain,
      entries: (field, value, _mode, interval) => numberGroupEntries(field, value, interval, (_target, current) => displayPlainValue(current))
    }),
    index: {
      searchDefaultEnabled: false,
      sortScalar: parse.readFiniteNumber
    },
    calculation: {
      uniqueKey: (_field, value) => {
        const number = parse.readFiniteNumber(value)
        return number === undefined
          ? json.stableStringify(value)
          : `number:${number}`
      }
    },
    view: {
      groupUsesOptionColors: false,
      kanbanGroupPriority: 0
    },
    behavior: {
      canQuickToggle: false
    }
  },
  select: {
    create: {
      default: input => ({
        ...input,
        kind: 'select',
        options: toFlatOptionTable([])
      }),
      convert: field => ({
        ...cloneBase(field),
        kind: 'select',
        options: toFlatOptionTable(cloneFlatOptions(field))
      })
    },
    schema: {
      normalize: field => {
        const current = field as SelectField
        const options = readFieldOptions(current)
          .map(normalizeFlatOption)
          .filter((option): option is FlatOption => Boolean(option))
        return {
          ...cloneBase(current),
          kind: 'select',
          options: toFlatOptionTable(options)
        }
      },
      validate: (field, path) => validateBaseOptions(readFieldOptions(field as SelectField), `${path}.options`)
    },
    value: {
      display: displayOptionValue,
      parse: parseSingleOptionDraft,
      search: searchOptionValue,
      compare: compareOptionValues
    },
    group: createOptionGroup(['option'], 'option', {
      domain: field => selectGroupDomain(field, displayOptionValue),
      entries: (field, value) => selectGroupEntries(field, value, displayOptionValue)
    }),
    index: {
      searchDefaultEnabled: true,
      bucketKeys: fastSingleOptionBucketKeys
    },
    calculation: {
      uniqueKey: (_field, value) => `option:${asPlainString(value)}`,
      optionIds: readSingleOptionIds
    },
    view: {
      groupUsesOptionColors: true,
      kanbanGroupPriority: 2
    },
    behavior: {
      canQuickToggle: false
    },
    option: singleValueOptionSpec
  },
  multiSelect: {
    create: {
      default: input => ({
        ...input,
        kind: 'multiSelect',
        options: toFlatOptionTable([])
      }),
      convert: field => ({
        ...cloneBase(field),
        kind: 'multiSelect',
        options: toFlatOptionTable(cloneFlatOptions(field))
      })
    },
    schema: {
      normalize: field => {
        const current = field as MultiSelectField
        const options = readFieldOptions(current)
          .map(normalizeFlatOption)
          .filter((option): option is FlatOption => Boolean(option))
        return {
          ...cloneBase(current),
          kind: 'multiSelect',
          options: toFlatOptionTable(options)
        }
      },
      validate: (field, path) => validateBaseOptions(readFieldOptions(field as MultiSelectField), `${path}.options`)
    },
    value: {
      display: displayMultiOptionValue,
      parse: parseMultiOptionDraft,
      search: searchMultiOptionValue,
      compare: (field, left, right) => compareText(
        displayMultiOptionValue(field, left),
        displayMultiOptionValue(field, right)
      )
    },
    group: createOptionGroup(['option'], 'option', {
      domain: field => multiSelectGroupDomain(field, displayMultiOptionValue),
      entries: (field, value) => multiSelectGroupEntries(field, value, displayMultiOptionValue)
    }),
    index: {
      searchDefaultEnabled: true,
      bucketKeys: fastMultiOptionBucketKeys
    },
    calculation: {
      uniqueKey: (field, value) => {
        const optionIds = readMultiOptionIds(field, value)
        return optionIds
          ? `multi:${JSON.stringify(optionIds)}`
          : json.stableStringify(value)
      },
      optionIds: readMultiOptionIds
    },
    view: {
      groupUsesOptionColors: true,
      kanbanGroupPriority: 1
    },
    behavior: {
      canQuickToggle: false
    },
    option: multiValueOptionSpec
  },
  status: {
    create: {
      default: input => {
        const options = createDefaultStatusOptions()
        return {
          ...input,
          kind: 'status',
          options: toStatusOptionTable(options),
          defaultOptionId: options[0]?.id ?? null
        }
      },
      convert: field => {
        const options = cloneStatusOptions(field)
        return {
          ...cloneBase(field),
          kind: 'status',
          options: toStatusOptionTable(options),
          defaultOptionId: options[0]?.id ?? null
        }
      },
      defaultValue: field => {
        const current = field as StatusField
        return current.defaultOptionId ?? readFieldOptions(current)[0]?.id ?? null
      }
    },
    schema: {
      normalize: field => {
        const current = field as StatusField
        const options = readFieldOptions(current)
          .flatMap((option) => ('category' in option ? [option] : []))
          .map(normalizeStatusOption)
          .filter((option): option is StatusOption => Boolean(option))
        const nextOptions = options.length
          ? options
          : createDefaultStatusOptions()

        return {
          ...cloneBase(current),
          kind: 'status',
          options: toStatusOptionTable(nextOptions),
          defaultOptionId: normalizeStatusDefaultOptionId(nextOptions, current.defaultOptionId)
        }
      },
      validate: (field, path) => {
        const current = field as StatusField
        const options = readFieldOptions(current).flatMap((option) => (
          'category' in option
            ? [option]
            : []
        ))
        const issues = validateBaseOptions(options, `${path}.options`)
        options.forEach((option, index) => {
          if (!STATUS_CATEGORIES.includes(option.category)) {
            issues.push(createFieldSchemaIssue(
              `${path}.options.${index}.category`,
              `Status option category is invalid: ${String(option.category)}`
            ))
          }
        })
        if (current.defaultOptionId !== null && current.defaultOptionId !== undefined && typeof current.defaultOptionId !== 'string') {
          issues.push(createFieldSchemaIssue(
            `${path}.defaultOptionId`,
            'Status field defaultOptionId must be null or a non-empty string'
          ))
        } else if (
          typeof current.defaultOptionId === 'string'
          && (
            !string.isNonEmptyString(current.defaultOptionId)
            || !options.some(option => option.id === current.defaultOptionId)
          )
        ) {
          issues.push(createFieldSchemaIssue(
            `${path}.defaultOptionId`,
            'Status field defaultOptionId must reference an existing option'
          ))
        }
        return issues
      }
    },
    value: {
      display: displayOptionValue,
      parse: parseSingleOptionDraft,
      search: searchOptionValue,
      compare: (field, left, right) => compareStatusFieldValues(field, left, right)
    },
    group: createOptionGroup(['option', 'category'], 'option', {
      domain: (field, mode) => statusGroupDomain(field, mode, displayOptionValue),
      entries: (field, value, mode) => statusGroupEntries(field, value, mode, displayOptionValue)
    }),
    index: {
      searchDefaultEnabled: true,
      bucketKeys: fastSingleOptionBucketKeys
    },
    calculation: {
      uniqueKey: (_field, value) => `option:${asPlainString(value)}`,
      optionIds: readSingleOptionIds
    },
    view: {
      groupUsesOptionColors: true,
      kanbanGroupPriority: 3
    },
    behavior: {
      canQuickToggle: false
    },
    option: singleValueOptionSpec
  },
  date: {
    create: {
      default: input => ({
        ...input,
        kind: 'date',
        ...fieldDate.config.create()
      }),
      convert: field => ({
        ...cloneBase(field),
        kind: 'date',
        ...fieldDate.config.create()
      })
    },
    schema: {
      normalize: field => {
        const current = field as DateField
        const defaults = fieldDate.config.create()
        return {
          ...cloneBase(current),
          kind: 'date',
          displayDateFormat: fieldDate.formats.date.includes(current.displayDateFormat)
            ? current.displayDateFormat
            : defaults.displayDateFormat,
          displayTimeFormat: fieldDate.formats.time.includes(current.displayTimeFormat)
            ? current.displayTimeFormat
            : defaults.displayTimeFormat,
          defaultValueKind: fieldDate.formats.value.includes(current.defaultValueKind)
            ? current.defaultValueKind
            : defaults.defaultValueKind,
          defaultTimezone: typeof current.defaultTimezone === 'string'
            ? (
                fieldDate.timezone.isValid(current.defaultTimezone)
                  ? current.defaultTimezone.trim()
                  : defaults.defaultTimezone
              )
            : current.defaultTimezone === null
              ? null
              : defaults.defaultTimezone
        } satisfies DateField
      },
      validate: (field, path) => {
        const current = field as DateField
        const issues: FieldSchemaValidationIssue[] = []
        if (!fieldDate.formats.date.includes(current.displayDateFormat)) {
          issues.push(createFieldSchemaIssue(
            `${path}.displayDateFormat`,
            'Date field displayDateFormat is invalid'
          ))
        }
        if (!fieldDate.formats.time.includes(current.displayTimeFormat)) {
          issues.push(createFieldSchemaIssue(
            `${path}.displayTimeFormat`,
            'Date field displayTimeFormat is invalid'
          ))
        }
        if (!fieldDate.formats.value.includes(current.defaultValueKind)) {
          issues.push(createFieldSchemaIssue(
            `${path}.defaultValueKind`,
            'Date field defaultValueKind is invalid'
          ))
        }
        if (
          current.defaultTimezone !== null
          && (
            typeof current.defaultTimezone !== 'string'
            || !fieldDate.timezone.isValid(current.defaultTimezone)
          )
        ) {
          issues.push(createFieldSchemaIssue(
            `${path}.defaultTimezone`,
            'Date field defaultTimezone must be null or a valid IANA timezone'
          ))
        }
        return issues
      }
    },
    value: {
      display: (field, value) => fieldDate.display.value(field, value),
      parse: parseDateDraft,
      search: (field, value) => fieldDate.search.tokens(field, value),
      compare: (_field, left, right) => compareDateValues(left, right)
    },
    group: createValueGroup('valueAsc', false, {
      modes: ['day', 'week', 'month', 'quarter', 'year'],
      defaultMode: 'month',
      domain: defaultGroupDomain,
      entries: (field, value, mode) => dateGroupEntries(field, value, mode, (target, current) => fieldDate.display.value(target, current))
    }),
    index: {
      searchDefaultEnabled: false,
      sortScalar: fieldDate.value.comparableTimestamp
    },
    calculation: {
      uniqueKey: (_field, value) => json.stableStringify(value)
    },
    view: {
      groupUsesOptionColors: false,
      kanbanGroupPriority: 0
    },
    behavior: {
      canQuickToggle: false
    }
  },
  boolean: {
    create: {
      default: input => ({
        ...input,
        kind: 'boolean'
      }),
      convert: field => ({
        ...cloneBase(field),
        kind: 'boolean'
      })
    },
    schema: {
      normalize: field => ({
        ...cloneBase(field),
        kind: 'boolean'
      }),
      validate: () => []
    },
    value: {
      display: (_field, value) => displayBooleanValue(value),
      parse: parseBooleanDraft,
      search: (_field, value) => expandSearchableValue(value),
      compare: (_field, left, right) => compareBooleanValues(left, right)
    },
    group: createBooleanGroup({
      domain: () => booleanGroupDomain(),
      entries: (_field, value) => booleanGroupEntries(value)
    }),
    index: {
      searchDefaultEnabled: false,
      bucketKeys: fastBooleanBucketKeys
    },
    calculation: {
      uniqueKey: (_field, value) => {
        const booleanValue = parse.readBooleanLike(value)
        return booleanValue === undefined
          ? json.stableStringify(value)
          : `boolean:${booleanValue}`
      }
    },
    view: {
      groupUsesOptionColors: false,
      kanbanGroupPriority: 0
    },
    behavior: {
      canQuickToggle: true,
      toggle: toggleBooleanValue
    }
  },
  url: {
    create: {
      default: input => ({
        ...input,
        kind: 'url',
        ...createDefaultUrlFieldConfig()
      }),
      convert: field => ({
        ...cloneBase(field),
        kind: 'url',
        ...createDefaultUrlFieldConfig()
      })
    },
    schema: {
      normalize: field => {
        const current = field as UrlField
        return {
        ...cloneBase(current),
        kind: 'url',
        displayFullUrl: current.displayFullUrl === true
      } satisfies UrlField
      },
      validate: (field, path) => (
        typeof (field as UrlField).displayFullUrl === 'boolean'
          ? []
          : [createFieldSchemaIssue(
              `${path}.displayFullUrl`,
              'URL field displayFullUrl must be boolean'
            )]
      )
    },
    value: {
      display: (field, value) => {
        if (isEmptyValue(value)) {
          return undefined
        }

        return formatUrlDisplayValue(field, value)
      },
      parse: parseTextDraft,
      search: (_field, value) => expandSearchableValue(value),
      compare: compareTextValues
    },
    group: createLabelGroup('labelAsc', false, {
      domain: defaultGroupDomain,
      entries: (field, value) => defaultGroupEntries(field, value, (target, current) => {
        if (isEmptyValue(current)) {
          return undefined
        }

        return formatUrlDisplayValue(target, current)
      })
    }),
    index: {
      searchDefaultEnabled: true
    },
    calculation: {
      uniqueKey: (_field, value) => `text:${asPlainString(value)}`
    },
    view: {
      groupUsesOptionColors: false,
      kanbanGroupPriority: 0
    },
    behavior: {
      canQuickToggle: false
    }
  },
  email: {
    create: {
      default: input => ({
        ...input,
        kind: 'email'
      }),
      convert: field => ({
        ...cloneBase(field),
        kind: 'email'
      })
    },
    schema: {
      normalize: field => ({
        ...cloneBase(field),
        kind: 'email'
      }),
      validate: () => []
    },
    value: {
      display: (_field, value) => displayPlainValue(value),
      parse: parseTextDraft,
      search: (_field, value) => expandSearchableValue(value),
      compare: compareTextValues
    },
    group: createLabelGroup('labelAsc', false, {
      domain: defaultGroupDomain,
      entries: (field, value) => defaultGroupEntries(field, value, (_target, current) => displayPlainValue(current))
    }),
    index: {
      searchDefaultEnabled: true
    },
    calculation: {
      uniqueKey: (_field, value) => `text:${asPlainString(value)}`
    },
    view: {
      groupUsesOptionColors: false,
      kanbanGroupPriority: 0
    },
    behavior: {
      canQuickToggle: false
    }
  },
  phone: {
    create: {
      default: input => ({
        ...input,
        kind: 'phone'
      }),
      convert: field => ({
        ...cloneBase(field),
        kind: 'phone'
      })
    },
    schema: {
      normalize: field => ({
        ...cloneBase(field),
        kind: 'phone'
      }),
      validate: () => []
    },
    value: {
      display: (_field, value) => displayPlainValue(value),
      parse: parseTextDraft,
      search: (_field, value) => expandSearchableValue(value),
      compare: compareTextValues
    },
    group: createLabelGroup('labelAsc', false, {
      domain: defaultGroupDomain,
      entries: (field, value) => defaultGroupEntries(field, value, (_target, current) => displayPlainValue(current))
    }),
    index: {
      searchDefaultEnabled: true
    },
    calculation: {
      uniqueKey: (_field, value) => `text:${asPlainString(value)}`
    },
    view: {
      groupUsesOptionColors: false,
      kanbanGroupPriority: 0
    },
    behavior: {
      canQuickToggle: false
    }
  },
  asset: {
    create: {
      default: input => ({
        ...input,
        kind: 'asset',
        multiple: true,
        accept: 'any'
      }),
      convert: field => ({
        ...cloneBase(field),
        kind: 'asset',
        multiple: true,
        accept: 'any'
      })
    },
    schema: {
      normalize: field => {
        const current = field as AssetField
        return {
        ...cloneBase(current),
        kind: 'asset',
        multiple: current.multiple !== false,
        accept: ['any', 'image', 'video', 'audio', 'media'].includes(current.accept)
          ? current.accept
          : 'any'
      } satisfies AssetField
      },
      validate: (field, path) => {
        const current = field as AssetField
        const issues: FieldSchemaValidationIssue[] = []
        if (typeof current.multiple !== 'boolean') {
          issues.push(createFieldSchemaIssue(
            `${path}.multiple`,
            'Asset field multiple must be boolean'
          ))
        }
        if (!['any', 'image', 'video', 'audio', 'media'].includes(current.accept)) {
          issues.push(createFieldSchemaIssue(
            `${path}.accept`,
            'Asset field accept is invalid'
          ))
        }
        return issues
      }
    },
    value: {
      display: (_field, value) => displayPlainValue(value),
      parse: parseBinaryAssetDraft,
      search: (_field, value) => expandSearchableValue(value),
      compare: compareTextValues
    },
    group: createPresenceGroup({
      domain: () => presenceGroupDomain(),
      entries: (_field, value) => presenceGroupEntries(value)
    }),
    index: {
      searchDefaultEnabled: false
    },
    calculation: {
      uniqueKey: (_field, value) => json.stableStringify(value)
    },
    view: {
      groupUsesOptionColors: false,
      kanbanGroupPriority: 0
    },
    behavior: {
      canQuickToggle: false
    }
  }
} as const satisfies Record<CustomFieldKind, KindSpec>

const fieldKindIndex = spec.table(fieldKindSpec)

export const getKindSpec = (
  kind: CustomFieldKind
): KindSpec => fieldKindIndex.get(kind)

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
): CustomField => getKindSpec(kind).create.default(input)

export const convertFieldKind = (
  field: CustomField,
  kind: CustomFieldKind
): CustomField => getKindSpec(kind).create.convert(field)

export const hasFieldOptions = (
  field?: Pick<CustomField, 'kind'>
): field is Pick<CustomField, 'kind'> & {
  kind: OptionKind
} => Boolean(
  field
  && (
    field.kind === 'select'
    || field.kind === 'multiSelect'
    || field.kind === 'status'
  )
)
