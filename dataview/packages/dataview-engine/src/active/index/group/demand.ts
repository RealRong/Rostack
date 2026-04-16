import type {
  ViewGroup
} from '@dataview/core/contracts'
import type {
  FilterBucketIndex,
  GroupDemand,
  GroupFieldIndex,
  GroupIndex,
  SectionGroupIndex
} from '@dataview/engine/active/index/contracts'

const GROUP_SEPARATOR = '\u0000'

export const createGroupDemand = (
  group: Pick<ViewGroup, 'field'>
    & Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>>,
  capability: GroupDemand['capability']
): GroupDemand => ({
  fieldId: group.field,
  capability,
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
  demand.capability,
  demand.fieldId,
  demand.mode ?? '',
  demand.bucketSort ?? '',
  demand.bucketInterval ?? ''
].join(GROUP_SEPARATOR)

export const readGroupFieldIndex = (
  index: GroupIndex,
  demand: GroupDemand
): GroupFieldIndex | undefined => index.groups.get(
  createGroupDemandKey(demand)
)

export const readFilterBucketIndex = (
  index: GroupIndex,
  fieldId: GroupDemand['fieldId']
): FilterBucketIndex | undefined => readGroupFieldIndex(index, {
  fieldId,
  capability: 'filter'
}) as FilterBucketIndex | undefined

export const readSectionGroupIndex = (
  index: GroupIndex,
  group: Pick<ViewGroup, 'field'>
    & Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>>
): SectionGroupIndex | undefined => readGroupFieldIndex(index, createGroupDemand(
  group,
  'section'
)) as SectionGroupIndex | undefined

export const readSectionGroupDemand = (
  groups: readonly GroupDemand[]
): GroupDemand | undefined => groups.find(group => group.capability === 'section')
