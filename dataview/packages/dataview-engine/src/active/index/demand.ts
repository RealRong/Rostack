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
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import { createBucketSpecKey } from '@dataview/engine/active/index/bucket'

const EMPTY_NORMALIZED_INDEX_DEMAND: NormalizedIndexDemand = {
  recordFields: [],
  search: [],
  buckets: [],
  sortFields: [],
  calculations: []
}

export const emptyNormalizedIndexDemand = (): NormalizedIndexDemand => EMPTY_NORMALIZED_INDEX_DEMAND

const uniqueBucketSpecs = (
  specs: readonly BucketSpec[] = []
): readonly BucketSpec[] => {
  const seen = new Map<string, BucketSpec>()
  specs.forEach(spec => {
    seen.set(createBucketSpecKey(spec), spec)
  })

  return [...seen.values()]
    .sort((left, right) => createBucketSpecKey(left).localeCompare(createBucketSpecKey(right)))
}

export const resolveDefaultSearchFieldIds = (
  context: Pick<IndexReadContext, 'document' | 'reader'>,
): readonly FieldId[] => {
  const fieldIds: FieldId[] = ['title']
  for (let index = 0; index < context.document.fields.order.length; index += 1) {
    const fieldId = context.document.fields.order[index]!
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
