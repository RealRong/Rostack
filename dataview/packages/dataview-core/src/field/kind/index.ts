import type {
  BucketSort,
  CustomField,
  CustomFieldKind,
  ViewGroup
} from '@dataview/core/contracts'
import { KANBAN_EMPTY_BUCKET_KEY } from '@dataview/core/contracts/kanban'
import {
  createDateGroupKey,
  formatDateValue,
  readDateGroupStart,
  getDateSearchTokens,
  getDateSortKey,
  parseDateInputDraft,
  readDateComparableTimestamp,
  type DateGroupMode
} from '@dataview/core/field/kind/date'
import {
  compareStatusFieldValues,
  getStatusCategoryColor,
  getStatusCategoryOrder,
  getStatusDefaultOption,
  getStatusOptionCategory,
  STATUS_CATEGORIES
} from '@dataview/core/field/kind/status'
import {
  getFieldOption,
  getFieldOptions,
  getFieldOptionOrder,
  getFieldOptionTokens
} from '@dataview/core/field/options'
import {
  formatUrlDisplayValue
} from '@dataview/core/field/kind/url'
import {
  compareGroupSortValues,
  compareLabels,
  readBucketOrder,
  readBucketSortLabel,
  readBucketSortValue,
  type Bucket,
  type ResolvedBucket
} from '@dataview/core/field/kind/group'
import {
  kindSpecs,
  type KindSpec
} from '@dataview/core/field/kind/spec'
import {
  isEmptyFieldValue,
  normalizeSearchableValue,
  readBooleanValue,
  readLooseNumberDraft,
  readNumberValue,
  type FieldDraftParseResult
} from '@dataview/core/field/kind/shared'
import type {
  Token
} from '@shared/i18n'
import {
  tokenRef
} from '@shared/i18n'

type FieldInput = CustomField | undefined

export interface Kind extends KindSpec {
  parseDraft: (field: FieldInput, draft: string) => FieldDraftParseResult
  display: (field: FieldInput, value: unknown) => string | undefined
  search: (field: FieldInput, value: unknown) => string[]
  compare: (field: FieldInput, left: unknown, right: unknown) => number
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

export type { Bucket } from '@dataview/core/field/kind/group'

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

const systemValueToken = (
  id: import('@dataview/core/contracts').SystemValueId
): Token => tokenRef('dataview.systemValue', id)

const rawValueToken = (
  text: string
): Token => text

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
      label: systemValueToken('value.empty'),
      clearValue: true,
      empty: true,
      order,
      sortLabel: '',
      sortValue: null
    }
  }

  const displayValue = (getFieldKind(field) ?? getKind('text')).display(field, value)
  const normalizedStringValue = typeof value === 'string'
    ? value.trim()
    : undefined

  return {
    key: toScalarKey(value),
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
  label: option.name || option.id,
  value,
  clearValue: false,
  color: option.color ?? undefined,
  empty: false,
  order,
  sortLabel: option.name,
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
  key: createDateGroupKey(mode, start),
  label: tokenRef('dataview.dateBucket', undefined, {
    mode,
    start
  }),
  value: start,
  clearValue: false,
  empty: false,
  order: readDateComparableTimestamp({
    kind: 'date',
    start
  }) ?? Number.MAX_SAFE_INTEGER,
  sortLabel: start,
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
    label: systemValueToken(key === 'true' ? 'value.checked' : 'value.unchecked'),
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
  groupDomain: defaultGroupDomain,
  groupEntries: defaultGroupEntries
}

const numberRuntime = {
  parseDraft: parseNumberDraft,
  display: (_field: FieldInput, value: unknown) => displayPlainValue(value),
  search: (_field: FieldInput, value: unknown) => normalizeSearchableValue(value),
  compare: (_field: FieldInput, left: unknown, right: unknown) => compareNumberValues(left, right),
  groupDomain: defaultGroupDomain,
  groupEntries: numberGroupEntries
}

const dateRuntime = {
  parseDraft: parseDateDraft,
  display: (field: FieldInput, value: unknown) => formatDateValue(field, value),
  search: (field: FieldInput, value: unknown) => getDateSearchTokens(field, value),
  compare: (_field: FieldInput, left: unknown, right: unknown) => compareDateValues(left, right),
  groupDomain: defaultGroupDomain,
  groupEntries: dateGroupEntries
}

const singleOptionRuntime = {
  parseDraft: parseSingleOptionDraft,
  display: (field: FieldInput, value: unknown) => displayOptionValue(field, value),
  search: (field: FieldInput, value: unknown) => searchOptionValue(field, value),
  compare: (field: FieldInput, left: unknown, right: unknown) => compareOptionValues(field, left, right),
  groupDomain: selectGroupDomain,
  groupEntries: selectGroupEntries
}

const multiOptionRuntime = {
  parseDraft: parseMultiOptionDraft,
  display: (field: FieldInput, value: unknown) => displayMultiOptionValue(field, value),
  search: (field: FieldInput, value: unknown) => searchMultiOptionValue(field, value),
  compare: (field: FieldInput, left: unknown, right: unknown) => compareDisplayText(field, left, right),
  groupDomain: multiSelectGroupDomain,
  groupEntries: multiSelectGroupEntries
}

const statusRuntime = {
  parseDraft: parseSingleOptionDraft,
  display: (field: FieldInput, value: unknown) => displayOptionValue(field, value),
  search: (field: FieldInput, value: unknown) => searchOptionValue(field, value),
  compare: (field: FieldInput, left: unknown, right: unknown) => compareStatusFieldValues(field, left, right),
  groupDomain: statusGroupDomain,
  groupEntries: statusGroupEntries
}

const booleanRuntime = {
  parseDraft: parseBooleanDraft,
  display: (_field: FieldInput, value: unknown) => displayBooleanValue(value),
  search: (_field: FieldInput, value: unknown) => normalizeSearchableValue(value),
  compare: (_field: FieldInput, left: unknown, right: unknown) => compareBooleanValues(left, right),
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
  groupDomain: defaultGroupDomain,
  groupEntries: defaultGroupEntries
}

const binaryRuntime = {
  parseDraft: parseBinaryAssetDraft,
  display: (_field: FieldInput, value: unknown) => displayPlainValue(value),
  search: (_field: FieldInput, value: unknown) => normalizeSearchableValue(value),
  compare: compareTextValues,
  groupDomain: presenceGroupDomain,
  groupEntries: presenceGroupEntries
}

interface KindRuntimeCore {
  parseDraft: (field: FieldInput, draft: string) => FieldDraftParseResult
  display: (field: FieldInput, value: unknown) => string | undefined
  search: (field: FieldInput, value: unknown) => string[]
  compare: (field: FieldInput, left: unknown, right: unknown) => number
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

const createKind = (
  kind: CustomFieldKind,
  runtime: KindRuntimeCore
): Kind => ({
  ...kindSpecs[kind],
  parseDraft: runtime.parseDraft,
  display: runtime.display,
  search: runtime.search,
  compare: runtime.compare,
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
      return compareLabels(readBucketSortLabel(left), readBucketSortLabel(right)) || leftOrder - rightOrder
    case 'labelDesc':
      return compareLabels(readBucketSortLabel(right), readBucketSortLabel(left)) || leftOrder - rightOrder
    case 'valueAsc':
      return compareGroupSortValues(readBucketSortValue(left), readBucketSortValue(right))
        || compareLabels(readBucketSortLabel(left), readBucketSortLabel(right))
        || leftOrder - rightOrder
    case 'valueDesc':
      return compareGroupSortValues(readBucketSortValue(right), readBucketSortValue(left))
        || compareLabels(readBucketSortLabel(left), readBucketSortLabel(right))
        || leftOrder - rightOrder
    case 'manual':
    default:
      return leftOrder - rightOrder || compareLabels(readBucketSortLabel(left), readBucketSortLabel(right))
  }
}
