import type {
  FieldId
} from '@dataview/core/contracts'
import {
  sameOrder,
  uniqueSorted
} from '@shared/core'
import type {
  GroupDemand,
  IndexDemand,
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import {
  normalizeCalculationDemands,
  sameCalculationDemand
} from '@dataview/engine/active/shared/calculation'

const uniqueGroups = (
  groups: readonly GroupDemand[] = []
): readonly GroupDemand[] => {
  const seen = new Map<string, GroupDemand>()

  groups.forEach(group => {
    seen.set([
      group.capability,
      group.fieldId,
      group.mode ?? '',
      group.bucketSort ?? '',
      group.bucketInterval ?? ''
    ].join('\u0000'), group)
  })

  return [...seen.values()]
    .sort((left, right) => [
      left.capability,
      left.fieldId,
      left.mode ?? '',
      left.bucketSort ?? '',
      left.bucketInterval ?? ''
    ].join('\u0000').localeCompare([
      right.capability,
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
    calculations: normalizeCalculationDemands(demand?.calculations)
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
      && group.capability === next.capability
      && group.fieldId === next.fieldId
      && group.mode === next.mode
      && group.bucketSort === next.bucketSort
      && group.bucketInterval === next.bucketInterval
  })

export {
  sameCalculationDemand
}
