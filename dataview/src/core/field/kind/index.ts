import type {
  BucketSort,
  FilterOperator,
  FilterRule,
  CustomField,
  CustomFieldKind,
  ViewGroup
} from '../../contracts/state'
import { KANBAN_EMPTY_BUCKET_KEY } from '../../contracts/kanban'
import {
  createDateGroupKey,
  formatDateGroupTitle,
  formatDateValue,
  readDateGroupStart,
  getDateSearchTokens,
  getDateSortKey,
  parseDateInputDraft,
  readDateComparableTimestamp,
  type DateGroupMode
} from './date'
import {
  createEmptyStatusFilterValue,
  compareStatusFieldValues,
  getStatusCategoryColor,
  getStatusCategoryLabel,
  getStatusCategoryOrder,
  getStatusDefaultOption,
  getStatusOptionCategory,
  STATUS_CATEGORIES,
  isStatusFilterEffective,
  matchStatusFilter
} from './status'
import {
  containsFieldOptionToken,
  getFieldOption,
  getFieldOptions,
  getFieldOptionOrder,
  getFieldOptionTokens,
  matchesFieldOptionValue
} from '../options'
import {
  formatUrlDisplayValue
} from './url'
import {
  compareGroupSortValues,
  compareLabels,
  readBucketOrder,
  readBucketSortValue,
  type Bucket,
  type ResolvedBucket
} from './group'
import {
  kindSpecs,
  type KindFilterPreset,
  type KindSpec
} from './spec'
import {
  isEmptyFieldValue,
  normalizeSearchableValue,
  readBooleanValue,
  readLooseNumberDraft,
  readNumberValue,
  type FieldDraftParseResult
} from './shared'

type FieldInput = CustomField | undefined

export interface Kind extends KindSpec {
  parseDraft: (field: FieldInput, draft: string) => FieldDraftParseResult
  display: (field: FieldInput, value: unknown) => string | undefined
  search: (field: FieldInput, value: unknown) => string[]
  compare: (field: FieldInput, left: unknown, right: unknown) => number
  createFilterValue: (field: FieldInput, op: FilterOperator) => unknown
  isFilterEffective: (field: FieldInput, op: FilterOperator, value: unknown) => boolean
  match: (field: FieldInput, value: unknown, op: FilterOperator, expected: unknown) => boolean
  groupDomain: (field: FieldInput, mode: string) => readonly Bucket[]
  groupEntries: (
    field: FieldInput,
    value: unknown,
    mode: string,
    bucketInterval?: number
  ) => readonly Bucket[]
}

export interface FieldGroupMeta {
  modes: readonly string[]
  mode: string
  sorts: readonly BucketSort[]
  sort: BucketSort | ''
  supportsInterval: boolean
  bucketInterval?: number
  showEmpty: boolean
}

const textCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
})

const comparePrimitive = (
  left: string | number | boolean,
  right: string | number | boolean
) => {
  if (left === right) {
    return 0
  }

  return left > right ? 1 : -1
}

export type { Bucket } from './group'

const compareText = (
  left: unknown,
  right: unknown
) => textCollator.compare(
  normalizeSearchableValue(left).join(', ').toLowerCase(),
  normalizeSearchableValue(right).join(', ').toLowerCase()
)

const displayPlainValue = (value: unknown): string | undefined => {
  if (isEmptyFieldValue(value)) {
    return undefined
  }

  return Array.isArray(value)
    ? value.map(item => String(item)).join(', ')
    : String(value)
}

const getOptionDisplay = (
  field: FieldInput,
  optionId: unknown
) => {
  const option = getFieldOption(field, optionId)
  return option?.name ?? (typeof optionId === 'string' ? optionId : undefined)
}

const displayOptionValue = (
  field: FieldInput,
  value: unknown
) => isEmptyFieldValue(value)
  ? undefined
  : getOptionDisplay(field, value)

const displayMultiOptionValue = (
  field: FieldInput,
  value: unknown
) => {
  if (isEmptyFieldValue(value)) {
    return undefined
  }

  return Array.isArray(value)
    ? value.map(item => getOptionDisplay(field, item) ?? String(item)).join(', ')
    : undefined
}

const displayBooleanValue = (value: unknown) => {
  if (isEmptyFieldValue(value)) {
    return undefined
  }

  const booleanValue = readBooleanValue(value)
  return booleanValue === undefined ? String(value) : booleanValue ? 'True' : 'False'
}

const searchOptionValue = (
  field: FieldInput,
  value: unknown
) => getFieldOptionTokens(field, value)

const searchMultiOptionValue = (
  field: FieldInput,
  value: unknown
) => Array.isArray(value)
  ? value.flatMap(item => getFieldOptionTokens(field, item))
  : []

const parseTextDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => ({ type: 'set', value: draft })

const parseNumberDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => {
  if (!draft.trim()) {
    return { type: 'clear' }
  }

  const numeric = readLooseNumberDraft(draft)
  return Number.isFinite(numeric)
    ? { type: 'set', value: numeric }
    : { type: 'clear' }
}

const parseDateDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => {
  if (!draft.trim()) {
    return { type: 'clear' }
  }

  const parsed = parseDateInputDraft(draft)
  return parsed
    ? { type: 'set', value: parsed }
    : { type: 'invalid' }
}

const parseSingleOptionDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => (
  draft.trim()
    ? { type: 'set', value: draft.trim() }
    : { type: 'clear' }
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
    ? { type: 'set', value }
    : { type: 'clear' }
}

const parseBooleanDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => {
  if (!draft.trim()) {
    return { type: 'clear' }
  }

  const booleanValue = readBooleanValue(draft)
  return booleanValue === undefined
    ? { type: 'invalid' }
    : { type: 'set', value: booleanValue }
}

const parseBinaryAssetDraft = (
  _field: FieldInput,
  draft: string
): FieldDraftParseResult => (
  !draft.trim()
    ? { type: 'clear' }
    : { type: 'invalid' }
)

const compareDisplayText = (
  field: FieldInput,
  left: unknown,
  right: unknown
) => compareText(
  getFieldKind(field)?.display(field, left),
  getFieldKind(field)?.display(field, right)
)

const compareNumberValues = (
  left: unknown,
  right: unknown
) => {
  const leftNumber = readNumberValue(left)
  const rightNumber = readNumberValue(right)
  if (leftNumber !== undefined && rightNumber !== undefined) {
    return comparePrimitive(leftNumber, rightNumber)
  }

  return compareText(left, right)
}

const compareDateValues = (
  left: unknown,
  right: unknown
) => {
  const leftTimestamp = readDateComparableTimestamp(left)
  const rightTimestamp = readDateComparableTimestamp(right)
  if (leftTimestamp !== undefined && rightTimestamp !== undefined) {
    return comparePrimitive(leftTimestamp, rightTimestamp)
  }

  return compareText(left, right)
}

const compareBooleanValues = (
  left: unknown,
  right: unknown
) => {
  const leftBoolean = readBooleanValue(left)
  const rightBoolean = readBooleanValue(right)
  if (leftBoolean !== undefined && rightBoolean !== undefined) {
    return comparePrimitive(leftBoolean ? 1 : 0, rightBoolean ? 1 : 0)
  }

  return compareText(left, right)
}

const compareOptionValues = (
  field: FieldInput,
  left: unknown,
  right: unknown
) => {
  const leftOrder = getFieldOptionOrder(field, left)
  const rightOrder = getFieldOptionOrder(field, right)
  if (leftOrder !== undefined && rightOrder !== undefined) {
    return comparePrimitive(leftOrder, rightOrder)
  }

  return compareDisplayText(field, left, right)
}

const compareTextValues = (
  _field: FieldInput,
  left: unknown,
  right: unknown
) => {
  const leftDateKey = left && typeof left === 'object'
    ? getDateSortKey(left)
    : undefined
  const rightDateKey = right && typeof right === 'object'
    ? getDateSortKey(right)
    : undefined

  if (leftDateKey && rightDateKey) {
    return comparePrimitive(leftDateKey, rightDateKey)
  }

  return compareText(left, right)
}

const toScalarKey = (value: unknown): string => {
  if (value === undefined || value === null) {
    return KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length ? normalized : KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (value && typeof value === 'object') {
    const dateKey = getDateSortKey(value)
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
) => {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length ? normalized : null
  }

  if (value && typeof value === 'object') {
    return getDateSortKey(value) ?? null
  }

  return String(value)
}

const createObservedScalarBucket = (
  field: FieldInput,
  value: unknown,
  order = Number.MAX_SAFE_INTEGER
): ResolvedBucket => {
  if (isEmptyFieldValue(value)) {
    return {
      key: KANBAN_EMPTY_BUCKET_KEY,
      title: 'Empty',
      clearValue: true,
      empty: true,
      order,
      sortValue: null
    }
  }

  const displayValue = (getFieldKind(field) ?? getKind('text')).display(field, value)
  const normalizedStringValue = typeof value === 'string'
    ? value.trim()
    : undefined

  return {
    key: toScalarKey(value),
    title: normalizedStringValue && normalizedStringValue.length
      ? normalizedStringValue
      : displayValue ?? String(value),
    value,
    clearValue: false,
    empty: false,
    order,
    sortValue: scalarSortValue(value)
  }
}

const createObservedBuckets = (
  field: FieldInput,
  value: unknown
): readonly Bucket[] => (
  Array.isArray(value)
    ? value.map((item, index) => createObservedScalarBucket(field, item, index))
    : [createObservedScalarBucket(field, value)]
)

const createOptionBucket = (
  option: { id: string; name: string; color?: string | null },
  order: number,
  value: unknown = option.id
): ResolvedBucket => ({
  key: option.id,
  title: option.name,
  value,
  clearValue: false,
  color: option.color ?? undefined,
  empty: false,
  order,
  sortValue: option.name
})

const integerRangeTitle = (start: number, interval: number) => {
  if (interval === 1) {
    return String(start)
  }

  return `${start}-${start + interval - 1}`
}

const decimalRangeTitle = (start: number, interval: number) => (
  `${start}-${start + interval}`
)

const createNumberRangeBucket = (
  start: number,
  interval: number
): ResolvedBucket => ({
  key: `range:${start}:${interval}`,
  title: Number.isInteger(start) && Number.isInteger(interval)
    ? integerRangeTitle(start, interval)
    : decimalRangeTitle(start, interval),
  value: {
    start,
    end: start + interval
  },
  clearValue: false,
  empty: false,
  order: start,
  sortValue: start
})

const createDateGroupBucket = (
  mode: DateGroupMode,
  start: string
): ResolvedBucket => ({
  key: createDateGroupKey(mode, start),
  title: formatDateGroupTitle(start, mode),
  value: start,
  clearValue: false,
  empty: false,
  order: readDateComparableTimestamp({
    kind: 'date',
    start
  }) ?? Number.MAX_SAFE_INTEGER,
  sortValue: readDateComparableTimestamp({
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
      title: 'Empty',
      clearValue: true,
      empty: true,
      order,
      sortValue: null
    }
  }

  return {
    key,
      title: key === 'true' ? 'Checked' : 'Unchecked',
    value: key === 'true',
    clearValue: false,
    empty: false,
    order,
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
        title: 'Empty',
        clearValue: true,
        empty: true,
        order,
        sortValue: null
      }
    : {
        key,
        title: 'Has value',
        value: true,
        clearValue: false,
        empty: false,
        order,
        sortValue: true
      }
)

const createStatusCategoryBucket = (
  field: FieldInput,
  category: typeof STATUS_CATEGORIES[number]
): ResolvedBucket => ({
  key: category,
  title: getStatusCategoryLabel(category),
  value: getStatusDefaultOption(field, category)?.id,
  clearValue: false,
  color: getStatusCategoryColor(category),
  empty: false,
  order: getStatusCategoryOrder(category),
  sortValue: getStatusCategoryLabel(category)
})

const hasNonEmptyArrayValue = (value: unknown) => (
  Array.isArray(value) && value.some(item => !isEmptyFieldValue(item))
)

const BUCKET_SORTS = new Set<BucketSort>([
  'manual',
  'labelAsc',
  'labelDesc',
  'valueAsc',
  'valueDesc'
])

const normalizeGroupBucketInterval = (
  value: number | undefined
) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined
  }

  return value
}

const createEmptyFilterValue = (
  _field: FieldInput,
  _op: FilterOperator
) => undefined

const createTextFilterValue = (
  _field: FieldInput,
  _op: FilterOperator
) => ''

const createStatusFilterValue = (
  _field: FieldInput,
  _op: FilterOperator
) => createEmptyStatusFilterValue()

const isBaseFilterEffective = (
  op: FilterOperator,
  value: unknown
): boolean => {
  if (op === 'custom') {
    return false
  }

  if (op === 'exists') {
    return true
  }

  if (op === 'in') {
    return hasNonEmptyArrayValue(value)
  }

  return !isEmptyFieldValue(value)
}

const isNumberFilterEffective = (
  op: FilterOperator,
  value: unknown
) => {
  if (op === 'custom') {
    return false
  }

  if (op === 'exists') {
    return true
  }

  if (op === 'in') {
    return hasNonEmptyArrayValue(value)
  }

  return readNumberValue(value) !== undefined
}

const isDateFilterEffective = (
  op: FilterOperator,
  value: unknown
) => {
  if (op === 'custom') {
    return false
  }

  if (op === 'exists') {
    return true
  }

  if (op === 'in') {
    return hasNonEmptyArrayValue(value)
  }

  return readDateComparableTimestamp(value) !== undefined
}

const isBooleanFilterEffective = (
  op: FilterOperator,
  value: unknown
) => {
  if (op === 'custom') {
    return false
  }

  if (op === 'exists') {
    return true
  }

  if (op === 'in') {
    return hasNonEmptyArrayValue(value)
  }

  return readBooleanValue(value) !== undefined
}

const isMultiSelectFilterEffective = (
  op: FilterOperator,
  value: unknown
) => {
  if (op === 'custom' || op === 'exists' || op === 'in') {
    return isBaseFilterEffective(op, value)
  }

  return hasNonEmptyArrayValue(value) || !isEmptyFieldValue(value)
}

const containsText = (
  value: unknown,
  expected: unknown
): boolean => {
  if (Array.isArray(value)) {
    return value.some(item => containsText(item, expected))
  }

  const query = String(expected ?? '').trim().toLowerCase()
  if (!query) {
    return false
  }

  return normalizeSearchableValue(value).some(token => (
    token.toLowerCase().includes(query)
  ))
}

const matchDefaultEq = (
  value: unknown,
  expected: unknown
) => value === expected

const matchNumberEq = (
  value: unknown,
  expected: unknown
) => {
  const leftNumber = readNumberValue(value)
  const rightNumber = readNumberValue(expected)
  if (leftNumber !== undefined && rightNumber !== undefined) {
    return leftNumber === rightNumber
  }

  return value === expected
}

const matchDateEq = (
  value: unknown,
  expected: unknown
) => {
  const leftTimestamp = readDateComparableTimestamp(value)
  const rightTimestamp = readDateComparableTimestamp(expected)
  if (leftTimestamp !== undefined && rightTimestamp !== undefined) {
    return leftTimestamp === rightTimestamp
  }

  return value === expected
}

const matchBooleanEq = (
  value: unknown,
  expected: unknown
) => {
  const leftBoolean = readBooleanValue(value)
  const rightBoolean = readBooleanValue(expected)
  if (leftBoolean !== undefined && rightBoolean !== undefined) {
    return leftBoolean === rightBoolean
  }

  return value === expected
}

const matchMultiSelectEq = (
  field: FieldInput,
  value: unknown,
  expected: unknown
) => Array.isArray(value) && Array.isArray(expected)
  ? value.length === expected.length
    && value.every((item, index) => matchesFieldOptionValue(field, item, expected[index]))
  : false

const matchDefaultContains = (
  value: unknown,
  expected: unknown
) => containsText(value, expected)

const matchMultiSelectContains = (
  field: FieldInput,
  value: unknown,
  expected: unknown
) => Array.isArray(value)
  ? value.some(item => matchesFieldOptionValue(field, item, expected))
  : false

const defaultGroupDomain = (
  _field: FieldInput,
  _mode: string
): readonly Bucket[] => []

const defaultGroupEntries = (
  field: FieldInput,
  value: unknown
): readonly Bucket[] => createObservedBuckets(field, value)

const numberGroupEntries = (
  field: FieldInput,
  value: unknown,
  mode: string,
  bucketInterval?: number
): readonly Bucket[] => {
  const interval = bucketInterval ?? 10
  if (mode === 'range' && typeof value === 'number' && Number.isFinite(value)) {
    const start = Math.floor(value / interval) * interval
    return [createNumberRangeBucket(start, interval)]
  }

  return [createObservedScalarBucket(field, value)]
}

const dateGroupEntries = (
  field: FieldInput,
  value: unknown,
  mode: string
): readonly Bucket[] => {
  const normalizedMode = mode as DateGroupMode
  const start = readDateGroupStart(value, normalizedMode)

  return start
    ? [createDateGroupBucket(normalizedMode, start)]
    : [createObservedScalarBucket(field, value)]
}

const selectGroupDomain = (
  field: FieldInput
): readonly Bucket[] => {
  const options = getFieldOptions(field)

  return [
    ...options.map((option, index) => createOptionBucket(option, index)),
    createObservedScalarBucket(field, undefined, options.length)
  ]
}

const selectGroupEntries = (
  field: FieldInput,
  value: unknown
): readonly Bucket[] => {
  const options = getFieldOptions(field)
  const option = typeof value === 'string'
    ? options.find(item => item.id === value)
    : undefined

  return [option
    ? createOptionBucket(option, options.indexOf(option))
    : createObservedScalarBucket(field, value)]
}

const multiSelectGroupDomain = (
  field: FieldInput
): readonly Bucket[] => {
  const options = getFieldOptions(field)

  return [
    ...options.map((option, index) => createOptionBucket(option, index, [option.id])),
    createObservedScalarBucket(field, undefined, options.length)
  ]
}

const multiSelectGroupEntries = (
  field: FieldInput,
  value: unknown
): readonly Bucket[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return [createObservedScalarBucket(field, undefined)]
  }

  const options = getFieldOptions(field)
  return value.map((item, index) => {
    const option = typeof item === 'string'
      ? options.find(candidate => candidate.id === item)
      : undefined

    return option
      ? createOptionBucket(option, options.indexOf(option), [option.id])
      : createObservedScalarBucket(field, item, index)
  })
}

const statusGroupDomain = (
  field: FieldInput,
  mode: string
): readonly Bucket[] => {
  if (mode === 'category') {
    return [
      ...STATUS_CATEGORIES
        .map(category => createStatusCategoryBucket(field, category)),
      createObservedScalarBucket(field, undefined, STATUS_CATEGORIES.length)
    ]
  }

  const options = getFieldOptions(field)

  return [
    ...options.map((option, index) => createOptionBucket(option, index)),
    createObservedScalarBucket(field, undefined, options.length)
  ]
}

const statusGroupEntries = (
  field: FieldInput,
  value: unknown,
  mode: string
): readonly Bucket[] => {
  const options = getFieldOptions(field)
  const option = typeof value === 'string'
    ? options.find(item => item.id === value)
    : undefined

  if (mode === 'category') {
    if (!option) {
      return [createObservedScalarBucket(field, value)]
    }

    const category = getStatusOptionCategory(field, option.id)
    return category
      ? [createStatusCategoryBucket(field, category)]
      : [createObservedScalarBucket(field, value)]
  }

  return [option
    ? createOptionBucket(option, options.indexOf(option))
    : createObservedScalarBucket(field, value)]
}

const booleanGroupDomain = (
  _field: FieldInput,
  _mode: string
): readonly Bucket[] => [
  createBooleanBucket('true', 0),
  createBooleanBucket('false', 1),
  createBooleanBucket(KANBAN_EMPTY_BUCKET_KEY, 2)
]

const booleanGroupEntries = (
  _field: FieldInput,
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

const presenceGroupDomain = (
  _field: FieldInput,
  _mode: string
): readonly Bucket[] => [
  createPresenceBucket('present', 0),
  createPresenceBucket(KANBAN_EMPTY_BUCKET_KEY, 1)
]

const presenceGroupEntries = (
  _field: FieldInput,
  value: unknown
): readonly Bucket[] => (
  isEmptyFieldValue(value)
    ? [createPresenceBucket(KANBAN_EMPTY_BUCKET_KEY, 1)]
    : [createPresenceBucket('present', 0)]
)

const textRuntime = {
  parseDraft: parseTextDraft,
  display: (_field: FieldInput, value: unknown) => displayPlainValue(value),
  search: (_field: FieldInput, value: unknown) => normalizeSearchableValue(value),
  compare: compareTextValues,
  createFilterValue: createTextFilterValue,
  isFilterEffective: (_field: FieldInput, op: FilterOperator, value: unknown) => isBaseFilterEffective(op, value),
  matchEq: (_field: FieldInput, value: unknown, expected: unknown) => matchDefaultEq(value, expected),
  matchContains: (_field: FieldInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: defaultGroupDomain,
  groupEntries: defaultGroupEntries
}

const numberRuntime = {
  parseDraft: parseNumberDraft,
  display: (_field: FieldInput, value: unknown) => displayPlainValue(value),
  search: (_field: FieldInput, value: unknown) => normalizeSearchableValue(value),
  compare: (_field: FieldInput, left: unknown, right: unknown) => compareNumberValues(left, right),
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_field: FieldInput, op: FilterOperator, value: unknown) => isNumberFilterEffective(op, value),
  matchEq: (_field: FieldInput, value: unknown, expected: unknown) => matchNumberEq(value, expected),
  matchContains: (_field: FieldInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: defaultGroupDomain,
  groupEntries: numberGroupEntries
}

const dateRuntime = {
  parseDraft: parseDateDraft,
  display: (field: FieldInput, value: unknown) => formatDateValue(field, value),
  search: (field: FieldInput, value: unknown) => getDateSearchTokens(field, value),
  compare: (_field: FieldInput, left: unknown, right: unknown) => compareDateValues(left, right),
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_field: FieldInput, op: FilterOperator, value: unknown) => isDateFilterEffective(op, value),
  matchEq: (_field: FieldInput, value: unknown, expected: unknown) => matchDateEq(value, expected),
  matchContains: (_field: FieldInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: defaultGroupDomain,
  groupEntries: dateGroupEntries
}

const singleOptionRuntime = {
  parseDraft: parseSingleOptionDraft,
  display: (field: FieldInput, value: unknown) => displayOptionValue(field, value),
  search: (field: FieldInput, value: unknown) => searchOptionValue(field, value),
  compare: (field: FieldInput, left: unknown, right: unknown) => compareOptionValues(field, left, right),
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_field: FieldInput, op: FilterOperator, value: unknown) => isBaseFilterEffective(op, value),
  matchEq: (field: FieldInput, value: unknown, expected: unknown) => matchesFieldOptionValue(field, value, expected),
  matchContains: (field: FieldInput, value: unknown, expected: unknown) => containsFieldOptionToken(field, value, expected),
  groupDomain: selectGroupDomain,
  groupEntries: selectGroupEntries
}

const multiOptionRuntime = {
  parseDraft: parseMultiOptionDraft,
  display: (field: FieldInput, value: unknown) => displayMultiOptionValue(field, value),
  search: (field: FieldInput, value: unknown) => searchMultiOptionValue(field, value),
  compare: (field: FieldInput, left: unknown, right: unknown) => compareDisplayText(field, left, right),
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_field: FieldInput, op: FilterOperator, value: unknown) => isMultiSelectFilterEffective(op, value),
  matchEq: (field: FieldInput, value: unknown, expected: unknown) => matchMultiSelectEq(field, value, expected),
  matchContains: (field: FieldInput, value: unknown, expected: unknown) => matchMultiSelectContains(field, value, expected),
  groupDomain: multiSelectGroupDomain,
  groupEntries: multiSelectGroupEntries
}

const statusRuntime = {
  parseDraft: parseSingleOptionDraft,
  display: (field: FieldInput, value: unknown) => displayOptionValue(field, value),
  search: (field: FieldInput, value: unknown) => searchOptionValue(field, value),
  compare: (field: FieldInput, left: unknown, right: unknown) => compareStatusFieldValues(field, left, right),
  createFilterValue: createStatusFilterValue,
  isFilterEffective: (field: FieldInput, op: FilterOperator, value: unknown) => {
    if (op === 'custom' || op === 'exists') {
      return isBaseFilterEffective(op, value)
    }

    if (op === 'in') {
      return hasNonEmptyArrayValue(value)
    }

    return isStatusFilterEffective(field, value)
  },
  matchEq: (field: FieldInput, value: unknown, expected: unknown) => matchStatusFilter(field, value, expected),
  matchContains: (field: FieldInput, value: unknown, expected: unknown) => containsFieldOptionToken(field, value, expected),
  groupDomain: statusGroupDomain,
  groupEntries: statusGroupEntries
}

const booleanRuntime = {
  parseDraft: parseBooleanDraft,
  display: (_field: FieldInput, value: unknown) => displayBooleanValue(value),
  search: (_field: FieldInput, value: unknown) => normalizeSearchableValue(value),
  compare: (_field: FieldInput, left: unknown, right: unknown) => compareBooleanValues(left, right),
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_field: FieldInput, op: FilterOperator, value: unknown) => isBooleanFilterEffective(op, value),
  matchEq: (_field: FieldInput, value: unknown, expected: unknown) => matchBooleanEq(value, expected),
  matchContains: (_field: FieldInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: booleanGroupDomain,
  groupEntries: booleanGroupEntries
}

const urlRuntime = {
  parseDraft: parseTextDraft,
  display: (field: FieldInput, value: unknown) => {
    if (isEmptyFieldValue(value)) {
      return undefined
    }

    return formatUrlDisplayValue(field, value)
  },
  search: (_field: FieldInput, value: unknown) => normalizeSearchableValue(value),
  compare: compareTextValues,
  createFilterValue: createTextFilterValue,
  isFilterEffective: (_field: FieldInput, op: FilterOperator, value: unknown) => isBaseFilterEffective(op, value),
  matchEq: (_field: FieldInput, value: unknown, expected: unknown) => matchDefaultEq(value, expected),
  matchContains: (_field: FieldInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: defaultGroupDomain,
  groupEntries: defaultGroupEntries
}

const binaryRuntime = {
  parseDraft: parseBinaryAssetDraft,
  display: (_field: FieldInput, value: unknown) => displayPlainValue(value),
  search: (_field: FieldInput, value: unknown) => normalizeSearchableValue(value),
  compare: compareTextValues,
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_field: FieldInput, op: FilterOperator, value: unknown) => isBaseFilterEffective(op, value),
  matchEq: (_field: FieldInput, value: unknown, expected: unknown) => matchDefaultEq(value, expected),
  matchContains: (_field: FieldInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: presenceGroupDomain,
  groupEntries: presenceGroupEntries
}

interface KindRuntimeCore {
  parseDraft: (field: FieldInput, draft: string) => FieldDraftParseResult
  display: (field: FieldInput, value: unknown) => string | undefined
  search: (field: FieldInput, value: unknown) => string[]
  compare: (field: FieldInput, left: unknown, right: unknown) => number
  createFilterValue: (field: FieldInput, op: FilterOperator) => unknown
  isFilterEffective: (field: FieldInput, op: FilterOperator, value: unknown) => boolean
  matchEq: (field: FieldInput, value: unknown, expected: unknown) => boolean
  matchContains: (field: FieldInput, value: unknown, expected: unknown) => boolean
  groupDomain: (field: FieldInput, mode: string) => readonly Bucket[]
  groupEntries: (
    field: FieldInput,
    value: unknown,
    mode: string,
    bucketInterval?: number
  ) => readonly Bucket[]
}

const kindRuntime = {
  text: textRuntime,
  number: numberRuntime,
  select: singleOptionRuntime,
  multiSelect: multiOptionRuntime,
  status: statusRuntime,
  date: dateRuntime,
  boolean: booleanRuntime,
  url: urlRuntime,
  email: textRuntime,
  phone: textRuntime,
  asset: binaryRuntime
} as const satisfies Record<CustomFieldKind, KindRuntimeCore>

const createMatch = (runtime: KindRuntimeCore): Kind['match'] => (
  field: FieldInput,
  value: unknown,
  op: FilterOperator,
  expected: unknown
) => {
  if (op === 'custom') {
    return false
  }

  if (op === 'exists') {
    return expected === false
      ? isEmptyFieldValue(value)
      : !isEmptyFieldValue(value)
  }

  if (op === 'eq') {
    return runtime.matchEq(field, value, expected)
  }

  if (op === 'neq') {
    return !runtime.matchEq(field, value, expected)
  }

  if (op === 'contains') {
    return runtime.matchContains(field, value, expected)
  }

  if (op === 'in') {
    return Array.isArray(expected)
      ? expected.some(item => runtime.matchEq(field, value, item))
      : false
  }

  if (isEmptyFieldValue(value) || isEmptyFieldValue(expected)) {
    return false
  }

  const result = runtime.compare(field, value, expected)
  if (op === 'gt') return result > 0
  if (op === 'gte') return result >= 0
  if (op === 'lt') return result < 0
  return result <= 0
}

const createKind = (
  kind: CustomFieldKind,
  runtime: KindRuntimeCore
): Kind => ({
  ...kindSpecs[kind],
  parseDraft: runtime.parseDraft,
  display: runtime.display,
  search: runtime.search,
  compare: runtime.compare,
  createFilterValue: runtime.createFilterValue,
  isFilterEffective: runtime.isFilterEffective,
  match: createMatch(runtime),
  groupDomain: runtime.groupDomain,
  groupEntries: runtime.groupEntries
})

export const kinds = {
  text: createKind('text', kindRuntime.text),
  number: createKind('number', kindRuntime.number),
  select: createKind('select', kindRuntime.select),
  multiSelect: createKind('multiSelect', kindRuntime.multiSelect),
  status: createKind('status', kindRuntime.status),
  date: createKind('date', kindRuntime.date),
  boolean: createKind('boolean', kindRuntime.boolean),
  url: createKind('url', kindRuntime.url),
  email: createKind('email', kindRuntime.email),
  phone: createKind('phone', kindRuntime.phone),
  asset: createKind('asset', kindRuntime.asset)
} as const satisfies Record<CustomFieldKind, Kind>

export const getKind = (
  kind: CustomFieldKind
): Kind => kinds[kind]

export const getFieldKind = (
  field?: Pick<CustomField, 'kind'>
): Kind | undefined => (
  field
    ? getKind(field.kind)
    : undefined
)

export const isGroupBucketSort = (
  value: unknown
): value is BucketSort => (
  typeof value === 'string' && BUCKET_SORTS.has(value as BucketSort)
)

export const getFieldGroupMeta = (
  field: CustomField | undefined,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>>
): FieldGroupMeta => {
  const kind = getFieldKind(field)
  if (!kind) {
    return {
      modes: [],
      mode: '',
      sorts: [],
      sort: '',
      supportsInterval: false,
      showEmpty: false
    }
  }

  const modes = kind.group.modes
  const defaultMode = kind.group.mode
  const mode = (
    group?.mode
    && modes.includes(group.mode)
  )
    ? group.mode
    : defaultMode
  const sorts = kind.group.sorts
  const defaultSort = kind.group.sort
  const sort = (
    group?.bucketSort
    && sorts.includes(group.bucketSort)
  )
    ? group.bucketSort
    : defaultSort
  const supportsInterval = kind.group.intervalModes?.includes(mode) ?? false
  const bucketInterval = supportsInterval
    ? normalizeGroupBucketInterval(group?.bucketInterval) ?? kind.group.bucketInterval
    : undefined

  return {
    modes,
    mode,
    sorts,
    sort,
    supportsInterval,
    ...(bucketInterval !== undefined
      ? { bucketInterval }
      : {}),
    showEmpty: kind.group.showEmpty
  }
}

const getRuntimeKind = (
  field?: Pick<CustomField, 'kind'>
) => getFieldKind(field) ?? getKind('text')

export const resolveGroupBucketDomain = (
  field: CustomField | undefined,
  group?: Partial<Pick<ViewGroup, 'mode'>>
): readonly Bucket[] => {
  if (!field) {
    return []
  }

  const meta = getFieldGroupMeta(field, group)
  return getRuntimeKind(field).groupDomain(field, meta.mode)
}

export const resolveGroupBucketEntries = (
  field: CustomField | undefined,
  value: unknown,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketInterval'>>
): readonly Bucket[] => {
  const meta = getFieldGroupMeta(field, group)
  return getRuntimeKind(field).groupEntries(
    field,
    value,
    meta.mode,
    meta.bucketInterval
  )
}

export const compareGroupBuckets = (
  left: Bucket,
  right: Bucket,
  field: CustomField | undefined,
  group?: Partial<Pick<ViewGroup, 'bucketSort' | 'mode'>>
): number => {
  if (left.empty !== right.empty) {
    return left.empty ? 1 : -1
  }

  const bucketSort = getFieldGroupMeta(field, group).sort || 'manual'
  const leftOrder = readBucketOrder(left)
  const rightOrder = readBucketOrder(right)

  switch (bucketSort) {
    case 'labelAsc':
      return compareLabels(left.title, right.title) || leftOrder - rightOrder
    case 'labelDesc':
      return compareLabels(right.title, left.title) || leftOrder - rightOrder
    case 'valueAsc':
      return compareGroupSortValues(readBucketSortValue(left), readBucketSortValue(right))
        || compareLabels(left.title, right.title)
        || leftOrder - rightOrder
    case 'valueDesc':
      return compareGroupSortValues(readBucketSortValue(right), readBucketSortValue(left))
        || compareLabels(left.title, right.title)
        || leftOrder - rightOrder
    case 'manual':
    default:
      return leftOrder - rightOrder || compareLabels(left.title, right.title)
  }
}

const matchesFilterPreset = (
  preset: KindFilterPreset,
  rule: FilterRule
) => (
  preset.operator === rule.op
  && (preset.value === undefined || Object.is(preset.value, rule.value))
)

export const isFilterRuleEffective = (
  field: CustomField | undefined,
  op: FilterOperator,
  value: unknown
): boolean => getRuntimeKind(field).isFilterEffective(field, op, value)

export const matchFieldFilter = (
  field: CustomField | undefined,
  value: unknown,
  op: FilterOperator,
  expected: unknown
): boolean => {
  const kind = getRuntimeKind(field)
  if (op !== 'custom' && !kind.isFilterEffective(field, op, expected)) {
    return true
  }

  return kind.match(field, value, op, expected)
}

export const getFieldFilterOps = (
  field?: Pick<CustomField, 'kind'>
): readonly FilterOperator[] => getRuntimeKind(field).filter.ops

export const getFieldFilterPresets = (
  field?: Pick<CustomField, 'kind'>
): readonly KindFilterPreset[] => getRuntimeKind(field).filter.presets

export const getFieldFilterPreset = (
  field?: CustomField,
  rule?: FilterRule
): KindFilterPreset | undefined => {
  const presets = getRuntimeKind(field).filter.presets
  return rule
    ? presets.find(preset => matchesFilterPreset(preset, rule)) ?? presets[0]
    : presets[0]
}

export const createDefaultFieldFilterRule = (
  field: CustomField
): FilterRule => {
  const kind = getRuntimeKind(field)
  const preset = kind.filter.presets[0]
  const op = preset?.operator ?? kind.filter.ops[0] ?? 'contains'

  return {
    field: field.id,
    op,
    value: preset?.value !== undefined
      ? preset.value
      : kind.createFilterValue(field, op)
  }
}

export const applyFieldFilterPreset = (
  rule: FilterRule,
  field: CustomField | undefined,
  preset: Pick<KindFilterPreset, 'operator' | 'value'>
): FilterRule => {
  const kind = getRuntimeKind(field)
  const currentPreset = getFieldFilterPreset(field, rule)

  return {
    field: rule.field,
    op: preset.operator,
    value: preset.value !== undefined
      ? preset.value
      : currentPreset?.value === undefined
        ? rule.value
        : kind.createFilterValue(field, preset.operator)
  }
}
