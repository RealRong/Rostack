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
  IndexDemand,
  NormalizedIndexDemand
} from '#engine/active/index/contracts'

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
): NormalizedIndexDemand => {
  const groups = uniqueGroups(demand?.groups)
  const sortFields = uniqueSorted(demand?.sortFields ?? [])

  return {
    recordFields: sortFields,
    search: {
      all: demand?.search?.all === true,
      fields: uniqueSorted(demand?.search?.fields ?? [])
    },
    groups,
    sortFields,
    calculationFields: uniqueSorted(demand?.calculationFields ?? [])
  }
}

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
