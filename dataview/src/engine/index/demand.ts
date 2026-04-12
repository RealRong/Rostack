import type {
  FieldId
} from '@dataview/core/contracts'
import {
  sameOrder,
  uniqueBy,
  uniqueSorted
} from '@shared/core'
import type {
  GroupDemand,
  IndexDemand
} from './types'

export interface NormalizedIndexDemand {
  search: {
    all: boolean
    fields: readonly FieldId[]
  }
  groups: readonly GroupDemand[]
  sortFields: readonly FieldId[]
  calculationFields: readonly FieldId[]
}

const uniqueGroups = (
  groups: readonly GroupDemand[] = []
): readonly GroupDemand[] => {
  return uniqueBy(groups, group => [
      group.fieldId,
      group.mode ?? '',
      group.bucketSort ?? '',
      group.bucketInterval ?? ''
    ].join('\u0000'))
    .sort((left, right) => [
      left.fieldId,
      left.mode ?? '',
      left.bucketSort ?? '',
      left.bucketInterval ?? ''
    ].join('\u0000').localeCompare([
      right.fieldId,
      right.mode ?? '',
      right.bucketSort ?? '',
      right.bucketInterval ?? ''
    ].join('\u0000')))
}

export const normalizeIndexDemand = (
  demand?: IndexDemand
): NormalizedIndexDemand => ({
  search: {
    all: demand?.search?.all === true,
    fields: uniqueSorted(demand?.search?.fields ?? [])
  },
  groups: uniqueGroups(demand?.groups),
  sortFields: uniqueSorted(demand?.sortFields ?? []),
  calculationFields: uniqueSorted(demand?.calculationFields ?? [])
})

export const sameFieldIdList = (
  left: readonly FieldId[],
  right: readonly FieldId[]
) => sameOrder(left, right)

export const sameSearchDemand = (
  left: NormalizedIndexDemand['search'],
  right: NormalizedIndexDemand['search']
) => left.all === right.all
  && sameFieldIdList(left.fields, right.fields)

export const sameGroupDemand = (
  left: readonly GroupDemand[],
  right: readonly GroupDemand[]
) => left.length === right.length
  && left.every((group, index) => {
    const next = right[index]
    return next !== undefined
      && group.fieldId === next.fieldId
      && group.mode === next.mode
      && group.bucketSort === next.bucketSort
      && group.bucketInterval === next.bucketInterval
  })
