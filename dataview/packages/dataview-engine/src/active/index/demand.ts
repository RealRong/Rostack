import type {
  FieldId
} from '@dataview/core/types'
import {
  calculation
} from '@dataview/core/view'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import { collection } from '@shared/core'
import type {
  BucketSpec,
  IndexDemand,
  IndexReadContext,
  IndexDemandDelta,
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import { bucket } from '@dataview/engine/active/index/bucket'

const EMPTY_NORMALIZED_INDEX_DEMAND: NormalizedIndexDemand = {
  recordFields: [],
  search: [],
  buckets: [],
  sortFields: [],
  calculations: []
}

export const emptyNormalizedIndexDemand = (): NormalizedIndexDemand => EMPTY_NORMALIZED_INDEX_DEMAND

export const writeNormalizedIndexDemandKey = (
  demand: NormalizedIndexDemand
): string => JSON.stringify({
  recordFields: demand.recordFields,
  search: demand.search,
  buckets: demand.buckets.map(spec => bucket.key.write(spec)),
  sortFields: demand.sortFields,
  calculations: calculation.demand.normalize(demand.calculations)
})

const diffValues = <T,>(
  previous: readonly T[],
  next: readonly T[],
  keyOf: (value: T) => string
) => {
  const previousByKey = new Map(previous.map(value => [keyOf(value), value] as const))
  const nextByKey = new Map(next.map(value => [keyOf(value), value] as const))
  const added: T[] = []
  const removed: T[] = []

  nextByKey.forEach((value, keyValue) => {
    if (!previousByKey.has(keyValue)) {
      added.push(value)
    }
  })

  previousByKey.forEach((value, keyValue) => {
    if (!nextByKey.has(keyValue)) {
      removed.push(value)
    }
  })

  return {
    added,
    removed
  }
}

const diffChangedValues = <T,>(
  previous: readonly T[],
  next: readonly T[],
  identityOf: (value: T) => string,
  versionOf: (value: T) => string
) => {
  const base = diffValues(previous, next, identityOf)
  const previousByIdentity = new Map(previous.map(value => [identityOf(value), value] as const))
  const changed: T[] = []

  next.forEach(value => {
    const previousValue = previousByIdentity.get(identityOf(value))
    if (previousValue && versionOf(previousValue) !== versionOf(value)) {
      changed.push(value)
    }
  })

  return {
    ...base,
    changed
  }
}

const diffBucketSpecs = (
  previous: readonly BucketSpec[],
  next: readonly BucketSpec[]
) => {
  const base = diffValues(previous, next, spec => bucket.key.write(spec))
  const previousKeysByField = new Map<FieldId, Set<string>>()
  previous.forEach(spec => {
    const current = previousKeysByField.get(spec.fieldId)
    if (current) {
      current.add(bucket.key.write(spec))
      return
    }

    previousKeysByField.set(spec.fieldId, new Set([bucket.key.write(spec)]))
  })

  const changed: BucketSpec[] = []
  next.forEach(spec => {
    const previousKeys = previousKeysByField.get(spec.fieldId)
    if (
      previousKeys
      && !previousKeys.has(bucket.key.write(spec))
    ) {
      changed.push(spec)
    }
  })

  return {
    ...base,
    changed
  }
}

export const indexDemandDeltaChanged = (
  delta: IndexDemandDelta
): boolean => (
  delta.recordFields.added.length > 0
  || delta.recordFields.removed.length > 0
  || delta.search.added.length > 0
  || delta.search.removed.length > 0
  || delta.buckets.added.length > 0
  || delta.buckets.removed.length > 0
  || delta.buckets.changed.length > 0
  || delta.sort.added.length > 0
  || delta.sort.removed.length > 0
  || delta.calculations.added.length > 0
  || delta.calculations.removed.length > 0
  || delta.calculations.changed.length > 0
)

export const diffNormalizedIndexDemand = (
  previous: NormalizedIndexDemand,
  next: NormalizedIndexDemand
): IndexDemandDelta => ({
  recordFields: diffValues(previous.recordFields, next.recordFields, value => value),
  search: diffValues(previous.search, next.search, value => value),
  buckets: diffBucketSpecs(previous.buckets, next.buckets),
  sort: diffValues(previous.sortFields, next.sortFields, value => value),
  calculations: diffChangedValues(
    previous.calculations,
    next.calculations,
    demand => demand.fieldId,
    demand => JSON.stringify(calculation.demand.normalize([demand]))
  )
})

const uniqueBucketSpecs = (
  specs: readonly BucketSpec[] = []
): readonly BucketSpec[] => {
  const seen = new Map<string, BucketSpec>()
  specs.forEach(spec => {
    seen.set(bucket.key.write(spec), spec)
  })

  return [...seen.values()]
    .sort((left, right) => bucket.key.write(left).localeCompare(bucket.key.write(right)))
}

export const resolveDefaultSearchFieldIds = (
  context: Pick<IndexReadContext, 'document' | 'reader'>,
): readonly FieldId[] => {
  const fieldIds: FieldId[] = ['title']
  for (let index = 0; index < context.document.fields.ids.length; index += 1) {
    const fieldId = context.document.fields.ids[index]!
    const field = context.reader.fields.get(fieldId)
    if (fieldSpec.index.searchDefaultEnabled(field)) {
      fieldIds.push(fieldId)
    }
  }

  return collection.uniqueSorted(fieldIds)
}

export const normalizeIndexDemand = (
  context: Pick<IndexReadContext, 'document' | 'reader'>,
  demand?: IndexDemand
): NormalizedIndexDemand => {
  const buckets = uniqueBucketSpecs(demand?.buckets)
  const sortFields = collection.uniqueSorted(demand?.sortFields ?? [])
  const searchFields = collection.uniqueSorted(demand?.search?.fieldIds ?? [])
  const displayFields = collection.uniqueSorted(demand?.displayFields ?? [])
  const calculationFields = collection.uniqueSorted(
    (demand?.calculations ?? []).map(item => item.fieldId)
  )
  const bucketFields = collection.uniqueSorted(buckets.map(item => item.fieldId))
  const recordFields = collection.uniqueSorted([
    ...displayFields,
    ...sortFields,
    ...searchFields,
    ...bucketFields,
    ...calculationFields
  ])

  return {
    recordFields,
    search: searchFields,
    buckets,
    sortFields,
    calculations: calculation.demand.normalize(demand?.calculations)
  }
}

export const sameCalculationDemand = calculation.demand.same
