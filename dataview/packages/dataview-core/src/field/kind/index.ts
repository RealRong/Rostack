import type {
  BucketSort,
  CustomField,
  CustomFieldKind,
  ViewGroup
} from '@dataview/core/contracts'
import {
  compareGroupSortValues,
  compareLabels,
  readBucketOrder,
  readBucketSortLabel,
  readBucketSortValue,
  type Bucket
} from '@dataview/core/field/kind/group'
import {
  getFieldKindSpec,
  getKindSpec,
  type KindSpec
} from '@dataview/core/field/kind/spec'

export type { Bucket } from '@dataview/core/field/kind/group'

export interface FieldGroupMeta {
  modes: readonly string[]
  mode: string
  sorts: readonly BucketSort[]
  sort: BucketSort | ''
  supportsInterval: boolean
  bucketInterval?: number
  showEmpty: boolean
}

export type Kind = KindSpec

const BUCKET_SORTS = new Set<BucketSort>([
  'manual',
  'labelAsc',
  'labelDesc',
  'valueAsc',
  'valueDesc'
])

const normalizeGroupBucketInterval = (
  value: number | undefined
) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined
  }

  return value
}

export const getKind = (
  kind: CustomFieldKind
): Kind => getKindSpec(kind)

export const getFieldKind = (
  field?: Pick<CustomField, 'kind'>
): Kind | undefined => getFieldKindSpec(field)

export const isGroupBucketSort = (
  value: unknown
): value is BucketSort => (
  typeof value === 'string' && BUCKET_SORTS.has(value as BucketSort)
)

export const getFieldGroupMeta = (
  field: CustomField | undefined,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>>
): FieldGroupMeta => {
  const kind = getFieldKind(field)
  if (!kind) {
    return {
      modes: [],
      mode: '',
      sorts: [],
      sort: '',
      supportsInterval: false,
      showEmpty: false
    }
  }

  const modes = kind.group.modes
  const mode = group?.mode && modes.includes(group.mode)
    ? group.mode
    : kind.group.defaultMode
  const sorts = kind.group.sorts
  const sort = group?.bucketSort && sorts.includes(group.bucketSort)
    ? group.bucketSort
    : kind.group.defaultSort
  const supportsInterval = kind.group.intervalModes?.includes(mode) ?? false
  const bucketInterval = supportsInterval
    ? normalizeGroupBucketInterval(group?.bucketInterval) ?? kind.group.defaultInterval
    : undefined

  return {
    modes,
    mode,
    sorts,
    sort,
    supportsInterval,
    ...(bucketInterval !== undefined ? { bucketInterval } : {}),
    showEmpty: kind.group.showEmpty
  }
}

export const resolveGroupBucketDomain = (
  field: CustomField | undefined,
  group?: Partial<Pick<ViewGroup, 'mode'>>
): readonly Bucket[] => {
  if (!field) {
    return []
  }

  const meta = getFieldGroupMeta(field, group)
  return getKindSpec(field.kind).group.domain(field, meta.mode)
}

export const resolveGroupBucketEntries = (
  field: CustomField | undefined,
  value: unknown,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketInterval'>>
): readonly Bucket[] => {
  const kind = getFieldKind(field)
  if (!kind) {
    return []
  }

  const meta = getFieldGroupMeta(field, group)
  return kind.group.entries(
    field,
    value,
    meta.mode,
    meta.bucketInterval
  )
}

export const compareGroupBuckets = (
  left: Bucket,
  right: Bucket,
  field: CustomField | undefined,
  group?: Partial<Pick<ViewGroup, 'bucketSort' | 'mode'>>
): number => {
  if (left.empty !== right.empty) {
    return left.empty ? 1 : -1
  }

  const bucketSort = getFieldGroupMeta(field, group).sort || 'manual'
  const leftOrder = readBucketOrder(left)
  const rightOrder = readBucketOrder(right)

  switch (bucketSort) {
    case 'labelAsc':
      return compareLabels(readBucketSortLabel(left), readBucketSortLabel(right)) || leftOrder - rightOrder
    case 'labelDesc':
      return compareLabels(readBucketSortLabel(right), readBucketSortLabel(left)) || leftOrder - rightOrder
    case 'valueAsc':
      return compareGroupSortValues(readBucketSortValue(left), readBucketSortValue(right))
        || compareLabels(readBucketSortLabel(left), readBucketSortLabel(right))
        || leftOrder - rightOrder
    case 'valueDesc':
      return compareGroupSortValues(readBucketSortValue(right), readBucketSortValue(left))
        || compareLabels(readBucketSortLabel(left), readBucketSortLabel(right))
        || leftOrder - rightOrder
    case 'manual':
    default:
      return leftOrder - rightOrder || compareLabels(readBucketSortLabel(left), readBucketSortLabel(right))
  }
}
