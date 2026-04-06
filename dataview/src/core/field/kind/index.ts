import type {
  GroupBucketSort,
  GroupFilterOperator,
  GroupFilterRule,
  GroupGroupBy,
  GroupProperty,
  GroupPropertyKind
} from '../../contracts/state'
import { GROUP_KANBAN_EMPTY_BUCKET_KEY } from '../../contracts/kanban'
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
  compareStatusPropertyValues,
  getStatusCategoryColor,
  getStatusCategoryLabel,
  getStatusCategoryOrder,
  getStatusDefaultOption,
  getStatusOptionCategory,
  GROUP_STATUS_CATEGORIES,
  isStatusFilterEffective,
  matchStatusFilter
} from './status'
import {
  containsPropertyOptionToken,
  getPropertyOption,
  getPropertyOptions,
  getPropertyOptionOrder,
  getPropertyOptionTokens,
  matchesPropertyOptionValue
} from '../option'
import {
  formatUrlDisplayValue
} from './url'
import {
  compareGroupSortValues,
  compareLabels,
  readBucketOrder,
  readBucketSortValue,
  type GroupBucket,
  type ResolvedGroupBucket
} from './group'
import {
  kindSpecs,
  type KindFilterPreset,
  type KindSpec
} from './spec'
import {
  isEmptyPropertyValue,
  normalizeSearchableValue,
  readBooleanValue,
  readLooseNumberDraft,
  readNumberValue,
  type PropertyDraftParseResult
} from './shared'

type PropertyInput = Pick<GroupProperty, 'kind' | 'config'> | undefined

export interface Kind extends KindSpec {
  parseDraft: (property: PropertyInput, draft: string) => PropertyDraftParseResult
  display: (property: PropertyInput, value: unknown) => string | undefined
  search: (property: PropertyInput, value: unknown) => string[]
  compare: (property: PropertyInput, left: unknown, right: unknown) => number
  createFilterValue: (property: PropertyInput, op: GroupFilterOperator) => unknown
  isFilterEffective: (property: PropertyInput, op: GroupFilterOperator, value: unknown) => boolean
  match: (property: PropertyInput, value: unknown, op: GroupFilterOperator, expected: unknown) => boolean
  groupDomain: (property: PropertyInput, mode: string) => readonly GroupBucket[]
  groupEntries: (
    property: PropertyInput,
    value: unknown,
    mode: string,
    bucketInterval?: number
  ) => readonly GroupBucket[]
}

export interface PropertyGroupMeta {
  modes: readonly string[]
  mode: string
  sorts: readonly GroupBucketSort[]
  sort: GroupBucketSort | ''
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

export type { GroupBucket } from './group'

const compareText = (
  left: unknown,
  right: unknown
) => textCollator.compare(
  normalizeSearchableValue(left).join(', ').toLowerCase(),
  normalizeSearchableValue(right).join(', ').toLowerCase()
)

const displayPlainValue = (value: unknown): string | undefined => {
  if (isEmptyPropertyValue(value)) {
    return undefined
  }

  return Array.isArray(value)
    ? value.map(item => String(item)).join(', ')
    : String(value)
}

const getOptionDisplay = (
  property: PropertyInput,
  optionId: unknown
) => {
  const option = getPropertyOption(property, optionId)
  return option?.name ?? (typeof optionId === 'string' ? optionId : undefined)
}

const displayOptionValue = (
  property: PropertyInput,
  value: unknown
) => isEmptyPropertyValue(value)
  ? undefined
  : getOptionDisplay(property, value)

const displayMultiOptionValue = (
  property: PropertyInput,
  value: unknown
) => {
  if (isEmptyPropertyValue(value)) {
    return undefined
  }

  return Array.isArray(value)
    ? value.map(item => getOptionDisplay(property, item) ?? String(item)).join(', ')
    : undefined
}

const displayCheckboxValue = (value: unknown) => {
  if (isEmptyPropertyValue(value)) {
    return undefined
  }

  const booleanValue = readBooleanValue(value)
  return booleanValue === undefined ? String(value) : booleanValue ? 'True' : 'False'
}

const searchOptionValue = (
  property: PropertyInput,
  value: unknown
) => getPropertyOptionTokens(property, value)

const searchMultiOptionValue = (
  property: PropertyInput,
  value: unknown
) => Array.isArray(value)
  ? value.flatMap(item => getPropertyOptionTokens(property, item))
  : []

const parseTextDraft = (
  _property: PropertyInput,
  draft: string
): PropertyDraftParseResult => ({ type: 'set', value: draft })

const parseNumberDraft = (
  _property: PropertyInput,
  draft: string
): PropertyDraftParseResult => {
  if (!draft.trim()) {
    return { type: 'clear' }
  }

  const numeric = readLooseNumberDraft(draft)
  return Number.isFinite(numeric)
    ? { type: 'set', value: numeric }
    : { type: 'clear' }
}

const parseDateDraft = (
  _property: PropertyInput,
  draft: string
): PropertyDraftParseResult => {
  if (!draft.trim()) {
    return { type: 'clear' }
  }

  const parsed = parseDateInputDraft(draft)
  return parsed
    ? { type: 'set', value: parsed }
    : { type: 'invalid' }
}

const parseSingleOptionDraft = (
  _property: PropertyInput,
  draft: string
): PropertyDraftParseResult => (
  draft.trim()
    ? { type: 'set', value: draft.trim() }
    : { type: 'clear' }
)

const parseMultiOptionDraft = (
  _property: PropertyInput,
  draft: string
): PropertyDraftParseResult => {
  const value = draft
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  return value.length
    ? { type: 'set', value }
    : { type: 'clear' }
}

const parseCheckboxDraft = (
  _property: PropertyInput,
  draft: string
): PropertyDraftParseResult => {
  if (!draft.trim()) {
    return { type: 'clear' }
  }

  const booleanValue = readBooleanValue(draft)
  return booleanValue === undefined
    ? { type: 'invalid' }
    : { type: 'set', value: booleanValue }
}

const parseBinaryAssetDraft = (
  _property: PropertyInput,
  draft: string
): PropertyDraftParseResult => (
  !draft.trim()
    ? { type: 'clear' }
    : { type: 'invalid' }
)

const compareDisplayText = (
  property: PropertyInput,
  left: unknown,
  right: unknown
) => compareText(
  getPropertyKind(property)?.display(property, left),
  getPropertyKind(property)?.display(property, right)
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

const compareCheckboxValues = (
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
  property: PropertyInput,
  left: unknown,
  right: unknown
) => {
  const leftOrder = getPropertyOptionOrder(property, left)
  const rightOrder = getPropertyOptionOrder(property, right)
  if (leftOrder !== undefined && rightOrder !== undefined) {
    return comparePrimitive(leftOrder, rightOrder)
  }

  return compareDisplayText(property, left, right)
}

const compareTextValues = (
  _property: PropertyInput,
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
    return GROUP_KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length ? normalized : GROUP_KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : GROUP_KANBAN_EMPTY_BUCKET_KEY
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
  property: PropertyInput,
  value: unknown,
  order = Number.MAX_SAFE_INTEGER
): ResolvedGroupBucket => {
  if (isEmptyPropertyValue(value)) {
    return {
      key: GROUP_KANBAN_EMPTY_BUCKET_KEY,
      title: 'Empty',
      clearValue: true,
      empty: true,
      order,
      sortValue: null
    }
  }

  const displayValue = (getPropertyKind(property) ?? getKind('text')).display(property, value)
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
  property: PropertyInput,
  value: unknown
): readonly GroupBucket[] => (
  Array.isArray(value)
    ? value.map((item, index) => createObservedScalarBucket(property, item, index))
    : [createObservedScalarBucket(property, value)]
)

const createOptionBucket = (
  option: { id: string; name: string; color?: string },
  order: number,
  value: unknown = option.id
): ResolvedGroupBucket => ({
  key: option.id,
  title: option.name,
  value,
  clearValue: false,
  color: option.color,
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
): ResolvedGroupBucket => ({
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
): ResolvedGroupBucket => ({
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

const createCheckboxBucket = (
  key: 'true' | 'false' | '(empty)',
  order: number
): ResolvedGroupBucket => {
  if (key === GROUP_KANBAN_EMPTY_BUCKET_KEY) {
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
): ResolvedGroupBucket => (
  key === GROUP_KANBAN_EMPTY_BUCKET_KEY
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
  property: PropertyInput,
  category: typeof GROUP_STATUS_CATEGORIES[number]
): ResolvedGroupBucket => ({
  key: category,
  title: getStatusCategoryLabel(category),
  value: getStatusDefaultOption(property, category)?.id,
  clearValue: false,
  color: getStatusCategoryColor(category),
  empty: false,
  order: getStatusCategoryOrder(category),
  sortValue: getStatusCategoryLabel(category)
})

const hasNonEmptyArrayValue = (value: unknown) => (
  Array.isArray(value) && value.some(item => !isEmptyPropertyValue(item))
)

const GROUP_BUCKET_SORTS = new Set<GroupBucketSort>([
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
  _property: PropertyInput,
  _op: GroupFilterOperator
) => undefined

const createTextFilterValue = (
  _property: PropertyInput,
  _op: GroupFilterOperator
) => ''

const createStatusFilterValue = (
  _property: PropertyInput,
  _op: GroupFilterOperator
) => createEmptyStatusFilterValue()

const isBaseFilterEffective = (
  op: GroupFilterOperator,
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

  return !isEmptyPropertyValue(value)
}

const isNumberFilterEffective = (
  op: GroupFilterOperator,
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
  op: GroupFilterOperator,
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

const isCheckboxFilterEffective = (
  op: GroupFilterOperator,
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
  op: GroupFilterOperator,
  value: unknown
) => {
  if (op === 'custom' || op === 'exists' || op === 'in') {
    return isBaseFilterEffective(op, value)
  }

  return hasNonEmptyArrayValue(value) || !isEmptyPropertyValue(value)
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

const matchCheckboxEq = (
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
  property: PropertyInput,
  value: unknown,
  expected: unknown
) => Array.isArray(value) && Array.isArray(expected)
  ? value.length === expected.length
    && value.every((item, index) => matchesPropertyOptionValue(property, item, expected[index]))
  : false

const matchDefaultContains = (
  value: unknown,
  expected: unknown
) => containsText(value, expected)

const matchMultiSelectContains = (
  property: PropertyInput,
  value: unknown,
  expected: unknown
) => Array.isArray(value)
  ? value.some(item => matchesPropertyOptionValue(property, item, expected))
  : false

const defaultGroupDomain = (
  _property: PropertyInput,
  _mode: string
): readonly GroupBucket[] => []

const defaultGroupEntries = (
  property: PropertyInput,
  value: unknown
): readonly GroupBucket[] => createObservedBuckets(property, value)

const numberGroupEntries = (
  property: PropertyInput,
  value: unknown,
  mode: string,
  bucketInterval?: number
): readonly GroupBucket[] => {
  const interval = bucketInterval ?? 10
  if (mode === 'range' && typeof value === 'number' && Number.isFinite(value)) {
    const start = Math.floor(value / interval) * interval
    return [createNumberRangeBucket(start, interval)]
  }

  return [createObservedScalarBucket(property, value)]
}

const dateGroupEntries = (
  property: PropertyInput,
  value: unknown,
  mode: string
): readonly GroupBucket[] => {
  const normalizedMode = mode as DateGroupMode
  const start = readDateGroupStart(value, normalizedMode)

  return start
    ? [createDateGroupBucket(normalizedMode, start)]
    : [createObservedScalarBucket(property, value)]
}

const selectGroupDomain = (
  property: PropertyInput
): readonly GroupBucket[] => {
  const options = getPropertyOptions(property)

  return [
    ...options.map((option, index) => createOptionBucket(option, index)),
    createObservedScalarBucket(property, undefined, options.length)
  ]
}

const selectGroupEntries = (
  property: PropertyInput,
  value: unknown
): readonly GroupBucket[] => {
  const options = getPropertyOptions(property)
  const option = typeof value === 'string'
    ? options.find(item => item.id === value)
    : undefined

  return [option
    ? createOptionBucket(option, options.indexOf(option))
    : createObservedScalarBucket(property, value)]
}

const multiSelectGroupDomain = (
  property: PropertyInput
): readonly GroupBucket[] => {
  const options = getPropertyOptions(property)

  return [
    ...options.map((option, index) => createOptionBucket(option, index, [option.id])),
    createObservedScalarBucket(property, undefined, options.length)
  ]
}

const multiSelectGroupEntries = (
  property: PropertyInput,
  value: unknown
): readonly GroupBucket[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return [createObservedScalarBucket(property, undefined)]
  }

  const options = getPropertyOptions(property)
  return value.map((item, index) => {
    const option = typeof item === 'string'
      ? options.find(candidate => candidate.id === item)
      : undefined

    return option
      ? createOptionBucket(option, options.indexOf(option), [option.id])
      : createObservedScalarBucket(property, item, index)
  })
}

const statusGroupDomain = (
  property: PropertyInput,
  mode: string
): readonly GroupBucket[] => {
  if (mode === 'category') {
    return [
      ...GROUP_STATUS_CATEGORIES
        .map(category => createStatusCategoryBucket(property, category)),
      createObservedScalarBucket(property, undefined, GROUP_STATUS_CATEGORIES.length)
    ]
  }

  const options = getPropertyOptions(property)

  return [
    ...options.map((option, index) => createOptionBucket(option, index)),
    createObservedScalarBucket(property, undefined, options.length)
  ]
}

const statusGroupEntries = (
  property: PropertyInput,
  value: unknown,
  mode: string
): readonly GroupBucket[] => {
  const options = getPropertyOptions(property)
  const option = typeof value === 'string'
    ? options.find(item => item.id === value)
    : undefined

  if (mode === 'category') {
    if (!option) {
      return [createObservedScalarBucket(property, value)]
    }

    const category = getStatusOptionCategory(property, option.id)
    return category
      ? [createStatusCategoryBucket(property, category)]
      : [createObservedScalarBucket(property, value)]
  }

  return [option
    ? createOptionBucket(option, options.indexOf(option))
    : createObservedScalarBucket(property, value)]
}

const checkboxGroupDomain = (
  _property: PropertyInput,
  _mode: string
): readonly GroupBucket[] => [
  createCheckboxBucket('true', 0),
  createCheckboxBucket('false', 1),
  createCheckboxBucket(GROUP_KANBAN_EMPTY_BUCKET_KEY, 2)
]

const checkboxGroupEntries = (
  _property: PropertyInput,
  value: unknown
): readonly GroupBucket[] => {
  if (value === true) {
    return [createCheckboxBucket('true', 0)]
  }

  if (value === false) {
    return [createCheckboxBucket('false', 1)]
  }

  return [createCheckboxBucket(GROUP_KANBAN_EMPTY_BUCKET_KEY, 2)]
}

const presenceGroupDomain = (
  _property: PropertyInput,
  _mode: string
): readonly GroupBucket[] => [
  createPresenceBucket('present', 0),
  createPresenceBucket(GROUP_KANBAN_EMPTY_BUCKET_KEY, 1)
]

const presenceGroupEntries = (
  _property: PropertyInput,
  value: unknown
): readonly GroupBucket[] => (
  isEmptyPropertyValue(value)
    ? [createPresenceBucket(GROUP_KANBAN_EMPTY_BUCKET_KEY, 1)]
    : [createPresenceBucket('present', 0)]
)

const textRuntime = {
  parseDraft: parseTextDraft,
  display: (_property: PropertyInput, value: unknown) => displayPlainValue(value),
  search: (_property: PropertyInput, value: unknown) => normalizeSearchableValue(value),
  compare: compareTextValues,
  createFilterValue: createTextFilterValue,
  isFilterEffective: (_property: PropertyInput, op: GroupFilterOperator, value: unknown) => isBaseFilterEffective(op, value),
  matchEq: (_property: PropertyInput, value: unknown, expected: unknown) => matchDefaultEq(value, expected),
  matchContains: (_property: PropertyInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: defaultGroupDomain,
  groupEntries: defaultGroupEntries
}

const numberRuntime = {
  parseDraft: parseNumberDraft,
  display: (_property: PropertyInput, value: unknown) => displayPlainValue(value),
  search: (_property: PropertyInput, value: unknown) => normalizeSearchableValue(value),
  compare: (_property: PropertyInput, left: unknown, right: unknown) => compareNumberValues(left, right),
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_property: PropertyInput, op: GroupFilterOperator, value: unknown) => isNumberFilterEffective(op, value),
  matchEq: (_property: PropertyInput, value: unknown, expected: unknown) => matchNumberEq(value, expected),
  matchContains: (_property: PropertyInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: defaultGroupDomain,
  groupEntries: numberGroupEntries
}

const dateRuntime = {
  parseDraft: parseDateDraft,
  display: (property: PropertyInput, value: unknown) => formatDateValue(property, value),
  search: (property: PropertyInput, value: unknown) => getDateSearchTokens(property, value),
  compare: (_property: PropertyInput, left: unknown, right: unknown) => compareDateValues(left, right),
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_property: PropertyInput, op: GroupFilterOperator, value: unknown) => isDateFilterEffective(op, value),
  matchEq: (_property: PropertyInput, value: unknown, expected: unknown) => matchDateEq(value, expected),
  matchContains: (_property: PropertyInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: defaultGroupDomain,
  groupEntries: dateGroupEntries
}

const singleOptionRuntime = {
  parseDraft: parseSingleOptionDraft,
  display: (property: PropertyInput, value: unknown) => displayOptionValue(property, value),
  search: (property: PropertyInput, value: unknown) => searchOptionValue(property, value),
  compare: (property: PropertyInput, left: unknown, right: unknown) => compareOptionValues(property, left, right),
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_property: PropertyInput, op: GroupFilterOperator, value: unknown) => isBaseFilterEffective(op, value),
  matchEq: (property: PropertyInput, value: unknown, expected: unknown) => matchesPropertyOptionValue(property, value, expected),
  matchContains: (property: PropertyInput, value: unknown, expected: unknown) => containsPropertyOptionToken(property, value, expected),
  groupDomain: selectGroupDomain,
  groupEntries: selectGroupEntries
}

const multiOptionRuntime = {
  parseDraft: parseMultiOptionDraft,
  display: (property: PropertyInput, value: unknown) => displayMultiOptionValue(property, value),
  search: (property: PropertyInput, value: unknown) => searchMultiOptionValue(property, value),
  compare: (property: PropertyInput, left: unknown, right: unknown) => compareDisplayText(property, left, right),
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_property: PropertyInput, op: GroupFilterOperator, value: unknown) => isMultiSelectFilterEffective(op, value),
  matchEq: (property: PropertyInput, value: unknown, expected: unknown) => matchMultiSelectEq(property, value, expected),
  matchContains: (property: PropertyInput, value: unknown, expected: unknown) => matchMultiSelectContains(property, value, expected),
  groupDomain: multiSelectGroupDomain,
  groupEntries: multiSelectGroupEntries
}

const statusRuntime = {
  parseDraft: parseSingleOptionDraft,
  display: (property: PropertyInput, value: unknown) => displayOptionValue(property, value),
  search: (property: PropertyInput, value: unknown) => searchOptionValue(property, value),
  compare: (property: PropertyInput, left: unknown, right: unknown) => compareStatusPropertyValues(property, left, right),
  createFilterValue: createStatusFilterValue,
  isFilterEffective: (property: PropertyInput, op: GroupFilterOperator, value: unknown) => {
    if (op === 'custom' || op === 'exists') {
      return isBaseFilterEffective(op, value)
    }

    if (op === 'in') {
      return hasNonEmptyArrayValue(value)
    }

    return isStatusFilterEffective(property, value)
  },
  matchEq: (property: PropertyInput, value: unknown, expected: unknown) => matchStatusFilter(property, value, expected),
  matchContains: (property: PropertyInput, value: unknown, expected: unknown) => containsPropertyOptionToken(property, value, expected),
  groupDomain: statusGroupDomain,
  groupEntries: statusGroupEntries
}

const checkboxRuntime = {
  parseDraft: parseCheckboxDraft,
  display: (_property: PropertyInput, value: unknown) => displayCheckboxValue(value),
  search: (_property: PropertyInput, value: unknown) => normalizeSearchableValue(value),
  compare: (_property: PropertyInput, left: unknown, right: unknown) => compareCheckboxValues(left, right),
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_property: PropertyInput, op: GroupFilterOperator, value: unknown) => isCheckboxFilterEffective(op, value),
  matchEq: (_property: PropertyInput, value: unknown, expected: unknown) => matchCheckboxEq(value, expected),
  matchContains: (_property: PropertyInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: checkboxGroupDomain,
  groupEntries: checkboxGroupEntries
}

const urlRuntime = {
  parseDraft: parseTextDraft,
  display: (property: PropertyInput, value: unknown) => {
    if (isEmptyPropertyValue(value)) {
      return undefined
    }

    return formatUrlDisplayValue(property, value)
  },
  search: (_property: PropertyInput, value: unknown) => normalizeSearchableValue(value),
  compare: compareTextValues,
  createFilterValue: createTextFilterValue,
  isFilterEffective: (_property: PropertyInput, op: GroupFilterOperator, value: unknown) => isBaseFilterEffective(op, value),
  matchEq: (_property: PropertyInput, value: unknown, expected: unknown) => matchDefaultEq(value, expected),
  matchContains: (_property: PropertyInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: defaultGroupDomain,
  groupEntries: defaultGroupEntries
}

const binaryRuntime = {
  parseDraft: parseBinaryAssetDraft,
  display: (_property: PropertyInput, value: unknown) => displayPlainValue(value),
  search: (_property: PropertyInput, value: unknown) => normalizeSearchableValue(value),
  compare: compareTextValues,
  createFilterValue: createEmptyFilterValue,
  isFilterEffective: (_property: PropertyInput, op: GroupFilterOperator, value: unknown) => isBaseFilterEffective(op, value),
  matchEq: (_property: PropertyInput, value: unknown, expected: unknown) => matchDefaultEq(value, expected),
  matchContains: (_property: PropertyInput, value: unknown, expected: unknown) => matchDefaultContains(value, expected),
  groupDomain: presenceGroupDomain,
  groupEntries: presenceGroupEntries
}

interface KindRuntimeCore {
  parseDraft: (property: PropertyInput, draft: string) => PropertyDraftParseResult
  display: (property: PropertyInput, value: unknown) => string | undefined
  search: (property: PropertyInput, value: unknown) => string[]
  compare: (property: PropertyInput, left: unknown, right: unknown) => number
  createFilterValue: (property: PropertyInput, op: GroupFilterOperator) => unknown
  isFilterEffective: (property: PropertyInput, op: GroupFilterOperator, value: unknown) => boolean
  matchEq: (property: PropertyInput, value: unknown, expected: unknown) => boolean
  matchContains: (property: PropertyInput, value: unknown, expected: unknown) => boolean
  groupDomain: (property: PropertyInput, mode: string) => readonly GroupBucket[]
  groupEntries: (
    property: PropertyInput,
    value: unknown,
    mode: string,
    bucketInterval?: number
  ) => readonly GroupBucket[]
}

const kindRuntime = {
  text: textRuntime,
  number: numberRuntime,
  select: singleOptionRuntime,
  multiSelect: multiOptionRuntime,
  status: statusRuntime,
  date: dateRuntime,
  checkbox: checkboxRuntime,
  url: urlRuntime,
  email: textRuntime,
  phone: textRuntime,
  file: binaryRuntime,
  media: binaryRuntime
} as const satisfies Record<GroupPropertyKind, KindRuntimeCore>

const createMatch = (runtime: KindRuntimeCore): Kind['match'] => (
  property: PropertyInput,
  value: unknown,
  op: GroupFilterOperator,
  expected: unknown
) => {
  if (op === 'custom') {
    return false
  }

  if (op === 'exists') {
    return expected === false
      ? isEmptyPropertyValue(value)
      : !isEmptyPropertyValue(value)
  }

  if (op === 'eq') {
    return runtime.matchEq(property, value, expected)
  }

  if (op === 'neq') {
    return !runtime.matchEq(property, value, expected)
  }

  if (op === 'contains') {
    return runtime.matchContains(property, value, expected)
  }

  if (op === 'in') {
    return Array.isArray(expected)
      ? expected.some(item => runtime.matchEq(property, value, item))
      : false
  }

  if (isEmptyPropertyValue(value) || isEmptyPropertyValue(expected)) {
    return false
  }

  const result = runtime.compare(property, value, expected)
  if (op === 'gt') return result > 0
  if (op === 'gte') return result >= 0
  if (op === 'lt') return result < 0
  return result <= 0
}

const createKind = (
  kind: GroupPropertyKind,
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
  checkbox: createKind('checkbox', kindRuntime.checkbox),
  url: createKind('url', kindRuntime.url),
  email: createKind('email', kindRuntime.email),
  phone: createKind('phone', kindRuntime.phone),
  file: createKind('file', kindRuntime.file),
  media: createKind('media', kindRuntime.media)
} as const satisfies Record<GroupPropertyKind, Kind>

export const getKind = (
  kind: GroupPropertyKind
): Kind => kinds[kind]

export const getPropertyKind = (
  property?: Pick<GroupProperty, 'kind'>
): Kind | undefined => (
  property
    ? getKind(property.kind)
    : undefined
)

export const isGroupBucketSort = (
  value: unknown
): value is GroupBucketSort => (
  typeof value === 'string' && GROUP_BUCKET_SORTS.has(value as GroupBucketSort)
)

export const getPropertyGroupMeta = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  group?: Partial<Pick<GroupGroupBy, 'mode' | 'bucketSort' | 'bucketInterval'>>
): PropertyGroupMeta => {
  const kind = getPropertyKind(property)
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
  property?: Pick<GroupProperty, 'kind'>
) => getPropertyKind(property) ?? getKind('text')

export const resolveGroupBucketDomain = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  group?: Partial<Pick<GroupGroupBy, 'mode'>>
): readonly GroupBucket[] => {
  if (!property) {
    return []
  }

  const meta = getPropertyGroupMeta(property, group)
  return getRuntimeKind(property).groupDomain(property, meta.mode)
}

export const resolveGroupBucketEntries = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  value: unknown,
  group?: Partial<Pick<GroupGroupBy, 'mode' | 'bucketInterval'>>
): readonly GroupBucket[] => {
  const meta = getPropertyGroupMeta(property, group)
  return getRuntimeKind(property).groupEntries(
    property,
    value,
    meta.mode,
    meta.bucketInterval
  )
}

export const compareGroupBuckets = (
  left: GroupBucket,
  right: GroupBucket,
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  group?: Partial<Pick<GroupGroupBy, 'bucketSort' | 'mode'>>
): number => {
  if (left.empty !== right.empty) {
    return left.empty ? 1 : -1
  }

  const bucketSort = getPropertyGroupMeta(property, group).sort || 'manual'
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
  rule: GroupFilterRule
) => (
  preset.operator === rule.op
  && (preset.value === undefined || Object.is(preset.value, rule.value))
)

export const isFilterRuleEffective = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  op: GroupFilterOperator,
  value: unknown
): boolean => getRuntimeKind(property).isFilterEffective(property, op, value)

export const matchPropertyFilter = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  value: unknown,
  op: GroupFilterOperator,
  expected: unknown
): boolean => {
  const kind = getRuntimeKind(property)
  if (op !== 'custom' && !kind.isFilterEffective(property, op, expected)) {
    return true
  }

  return kind.match(property, value, op, expected)
}

export const getPropertyFilterOps = (
  property?: Pick<GroupProperty, 'kind'>
): readonly GroupFilterOperator[] => getRuntimeKind(property).filter.ops

export const getPropertyFilterPresets = (
  property?: Pick<GroupProperty, 'kind'>
): readonly KindFilterPreset[] => getRuntimeKind(property).filter.presets

export const getPropertyFilterPreset = (
  property?: Pick<GroupProperty, 'kind' | 'config'>,
  rule?: GroupFilterRule
): KindFilterPreset | undefined => {
  const presets = getRuntimeKind(property).filter.presets
  return rule
    ? presets.find(preset => matchesFilterPreset(preset, rule)) ?? presets[0]
    : presets[0]
}

export const createDefaultPropertyFilterRule = (
  property: Pick<GroupProperty, 'id' | 'kind' | 'config'>
): GroupFilterRule => {
  const kind = getRuntimeKind(property)
  const preset = kind.filter.presets[0]
  const op = preset?.operator ?? kind.filter.ops[0] ?? 'contains'

  return {
    property: property.id,
    op,
    value: preset?.value !== undefined
      ? preset.value
      : kind.createFilterValue(property, op)
  }
}

export const applyPropertyFilterPreset = (
  rule: GroupFilterRule,
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  preset: Pick<KindFilterPreset, 'operator' | 'value'>
): GroupFilterRule => {
  const kind = getRuntimeKind(property)
  const currentPreset = getPropertyFilterPreset(property, rule)

  return {
    property: rule.property,
    op: preset.operator,
    value: preset.value !== undefined
      ? preset.value
      : currentPreset?.value === undefined
        ? rule.value
        : kind.createFilterValue(property, preset.operator)
  }
}
