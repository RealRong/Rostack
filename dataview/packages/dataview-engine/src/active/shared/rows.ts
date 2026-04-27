import type {
  CalculationEntry
} from '@dataview/core/view'
import type {
  FieldId,
  RecordId
} from '@dataview/core/types'
import {
  createBucketSpecKey
} from '@dataview/engine/active/index/bucket'
import type {
  BucketSpec,
  BucketIndex,
  CalculationIndex,
  RecordIndex,
  SearchIndex
} from '@dataview/engine/active/index/contracts'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_BUCKET_KEYS = [] as readonly string[]
const SOURCE_CACHE = new WeakMap<Rows, {
  records: RecordIndex
  search: SearchIndex
  bucket: BucketIndex
  calculations: CalculationIndex
}>()

export interface ReadColumn<T> {
  at: (index: number) => T | undefined
  get: (id: RecordId) => T | undefined
}

export interface DenseReadColumn<T> extends ReadColumn<T> {
  dense?: readonly T[]
}

export interface Rows {
  ids: readonly RecordId[]
  indexOf: (id: RecordId) => number | undefined
  at: (index: number) => RecordId | undefined
  column: {
    value: (fieldId: FieldId) => ReadColumn<unknown> | undefined
    calc: (fieldId: FieldId) => ReadColumn<CalculationEntry> | undefined
    search: (fieldId: FieldId) => ReadColumn<string> | undefined
    bucket: (spec: BucketSpec) => ReadColumn<readonly string[]> | undefined
  }
}

const createEmptyColumn = <T,>(
  emptyValue?: T
): ReadColumn<T> => ({
  at: () => emptyValue,
  get: () => emptyValue
})

const EMPTY_VALUE_COLUMN = createEmptyColumn<unknown>()
const EMPTY_CALC_COLUMN = createEmptyColumn<CalculationEntry>()
const EMPTY_SEARCH_COLUMN = createEmptyColumn<string>()
const EMPTY_BUCKET_COLUMN = createEmptyColumn<readonly string[]>(EMPTY_BUCKET_KEYS)

export const EMPTY_ROWS: Rows = {
  ids: EMPTY_RECORD_IDS,
  indexOf: () => undefined,
  at: () => undefined,
  column: {
    value: () => undefined,
    calc: () => undefined,
    search: () => undefined,
    bucket: () => undefined
  }
}

const createMapColumn = <T>(input: {
  ids: readonly RecordId[]
  values: ReadonlyMap<RecordId, T>
  emptyValue?: T
}): ReadColumn<T> => ({
  at: index => {
    const recordId = input.ids[index]
    return recordId === undefined
      ? undefined
      : input.values.get(recordId) ?? input.emptyValue
  },
  get: id => input.values.get(id) ?? input.emptyValue
})

const createDenseColumn = <T>(input: {
  ids: readonly RecordId[]
  dense: readonly T[]
  values: ReadonlyMap<RecordId, T>
  emptyValue?: T
}): DenseReadColumn<T> => ({
  dense: input.dense,
  at: index => input.dense[index] ?? input.emptyValue,
  get: id => input.values.get(id) ?? input.emptyValue
})

export const createRows = (input: {
  records: RecordIndex
  search: SearchIndex
  bucket: BucketIndex
  calculations: CalculationIndex
  previous?: Rows
}): Rows => {
  const previousSource = input.previous
    ? SOURCE_CACHE.get(input.previous)
    : undefined
  if (
    input.previous
    && previousSource?.records === input.records
    && previousSource.search === input.search
    && previousSource.bucket === input.bucket
    && previousSource.calculations === input.calculations
  ) {
    return input.previous
  }

  const valueColumns = new Map<FieldId, ReadColumn<unknown> | undefined>()
  const calcColumns = new Map<FieldId, ReadColumn<CalculationEntry> | undefined>()
  const searchColumns = new Map<FieldId, ReadColumn<string> | undefined>()
  const bucketColumns = new Map<string, ReadColumn<readonly string[]> | undefined>()

  const rows: Rows = {
    ids: input.records.ids,
    indexOf: id => input.records.order.get(id),
    at: index => input.records.ids[index],
    column: {
      value: fieldId => {
        if (valueColumns.has(fieldId)) {
          return valueColumns.get(fieldId)
        }

        const values = input.records.values.get(fieldId)?.byRecord
        const column = values
          ? createMapColumn({
              ids: input.records.ids,
              values
            })
          : undefined
        valueColumns.set(fieldId, column)
        return column
      },
      calc: fieldId => {
        if (calcColumns.has(fieldId)) {
          return calcColumns.get(fieldId)
        }

        const field = input.calculations.fields.get(fieldId)
        const column = field
          ? createDenseColumn({
              ids: input.records.ids,
              dense: field.entriesByIndex,
              values: field.entries
            })
          : undefined
        calcColumns.set(fieldId, column)
        return column
      },
      search: fieldId => {
        if (searchColumns.has(fieldId)) {
          return searchColumns.get(fieldId)
        }

        const field = input.search.fields.get(fieldId)
        const column = field
          ? createMapColumn({
              ids: input.records.ids,
              values: field.texts
            })
          : undefined
        searchColumns.set(fieldId, column)
        return column
      },
      bucket: spec => {
        const key = createBucketSpecKey(spec)
        if (bucketColumns.has(key)) {
          return bucketColumns.get(key)
        }

        const field = input.bucket.fields.get(key)
        const column = field
          ? createMapColumn({
              ids: input.records.ids,
              values: field.keysByRecord,
              emptyValue: EMPTY_BUCKET_KEYS
            })
          : undefined
        bucketColumns.set(key, column)
        return column
      }
    }
  }

  SOURCE_CACHE.set(rows, {
    records: input.records,
    search: input.search,
    bucket: input.bucket,
    calculations: input.calculations
  })

  return rows
}

export const readDenseColumn = <T>(
  column: ReadColumn<T> | undefined
): readonly T[] | undefined => (column as DenseReadColumn<T> | undefined)?.dense

export const emptyRowsColumn = {
  value: () => EMPTY_VALUE_COLUMN,
  calc: () => EMPTY_CALC_COLUMN,
  search: () => EMPTY_SEARCH_COLUMN,
  bucket: () => EMPTY_BUCKET_COLUMN
}
