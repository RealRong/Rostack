import type {
  FieldId
} from '@dataview/core/contracts'
import {
  isDefaultSearchField
} from '@dataview/core/search'
import {
  uniqueSorted
} from '@shared/core'
import type {
  BucketSpec,
  IndexDemand,
  IndexReadContext,
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import {
  normalizeCalculationDemands,
  sameCalculationDemand
} from '@dataview/engine/active/shared/calculation'

export const createBucketSpecKey = (
  spec: BucketSpec
): string => [
  spec.fieldId,
  spec.mode ?? '',
  spec.interval ?? ''
].join('\u0000')

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
    if (field && field.kind !== 'title' && isDefaultSearchField(field)) {
      fieldIds.push(fieldId)
    }
  }

  return uniqueSorted(fieldIds)
}

export const normalizeIndexDemand = (
  context: Pick<IndexReadContext, 'document' | 'reader'>,
  demand?: IndexDemand
): NormalizedIndexDemand => {
  const buckets = uniqueBucketSpecs(demand?.buckets)
  const sortFields = uniqueSorted(demand?.sortFields ?? [])
  const searchFields = uniqueSorted(demand?.search?.fieldIds ?? [])
  const displayFields = uniqueSorted(demand?.displayFields ?? [])
  const calculationFields = uniqueSorted(
    (demand?.calculations ?? []).map(item => item.fieldId)
  )
  const bucketFields = uniqueSorted(buckets.map(item => item.fieldId))
  const recordFields = uniqueSorted([
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
    calculations: normalizeCalculationDemands(demand?.calculations)
  }
}

export const sameBucketSpecs = (
  left: readonly BucketSpec[],
  right: readonly BucketSpec[]
) => left.length === right.length
  && left.every((spec, index) => {
    const next = right[index]
    return next !== undefined
      && spec.fieldId === next.fieldId
      && spec.mode === next.mode
      && spec.interval === next.interval
  })

export {
  sameCalculationDemand
}
