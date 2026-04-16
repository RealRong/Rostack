import type {
  FieldId
} from '@dataview/core/contracts'
import {
  isDefaultSearchField
} from '@dataview/core/search'
import {
  sameOrder,
  uniqueSorted
} from '@shared/core'
import type {
  GroupDemand,
  IndexDemand,
  IndexReadContext,
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

const resolveSearchFieldIds = (
  context: Pick<IndexReadContext, 'document' | 'reader'>,
  demand?: IndexDemand
): readonly FieldId[] => {
  if (demand?.search?.fields?.length) {
    return uniqueSorted(demand.search.fields)
  }

  if (!demand?.search?.all) {
    return []
  }

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
  const groups = uniqueGroups(demand?.groups)
  const sortFields = uniqueSorted(demand?.sortFields ?? [])
  const searchFields = resolveSearchFieldIds(context, demand)
  const displayFields = uniqueSorted(demand?.displayFields ?? [])
  const calculationFields = uniqueSorted(
    (demand?.calculations ?? []).map(item => item.fieldId)
  )
  const groupFields = uniqueSorted(groups.map(item => item.fieldId))
  const recordFields = uniqueSorted([
    ...displayFields,
    ...sortFields,
    ...searchFields,
    ...groupFields,
    ...calculationFields
  ])

  return {
    recordFields,
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
