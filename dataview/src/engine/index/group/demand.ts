import type {
  ViewGroup
} from '@dataview/core/contracts'
import type {
  GroupDemand,
  GroupFieldIndex,
  GroupIndex
} from '../types'

const GROUP_SEPARATOR = '\u0000'

export const createGroupDemand = (
  group: Pick<ViewGroup, 'field' | 'mode' | 'bucketSort' | 'bucketInterval'>
): GroupDemand => ({
  fieldId: group.field,
  ...(group.mode === undefined ? {} : { mode: group.mode }),
  ...(group.bucketSort === undefined ? {} : { bucketSort: group.bucketSort }),
  ...(group.bucketInterval === undefined ? {} : { bucketInterval: group.bucketInterval })
})

export const toGroupOptions = (
  demand: GroupDemand
): Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>> => ({
  ...(demand.mode === undefined ? {} : { mode: demand.mode }),
  ...(demand.bucketSort === undefined ? {} : { bucketSort: demand.bucketSort }),
  ...(demand.bucketInterval === undefined ? {} : { bucketInterval: demand.bucketInterval })
})

export const createGroupDemandKey = (
  demand: GroupDemand
): string => [
  demand.fieldId,
  demand.mode ?? '',
  demand.bucketSort ?? '',
  demand.bucketInterval ?? ''
].join(GROUP_SEPARATOR)

export const readGroupFieldIndex = (
  index: GroupIndex,
  group: Pick<ViewGroup, 'field' | 'mode' | 'bucketSort' | 'bucketInterval'>
): GroupFieldIndex | undefined => index.groups.get(
  createGroupDemandKey(createGroupDemand(group))
)
