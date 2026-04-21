import type {
  Token
} from '@shared/i18n'
import { compare } from '@shared/core'



export interface Bucket {
  key: string
  label: Token
  value?: unknown
  clearValue: boolean
  empty: boolean
  color?: string
  sortLabel?: string
}

export type BucketSortValue = string | number | boolean | null | undefined

export interface ResolvedBucket extends Bucket {
  order: number
  sortValue?: BucketSortValue
}

export const compareLabels = (
  left: string,
  right: string
) => compare.compareText(left, right)

export const readBucketSortLabel = (
  bucket: Bucket
) => bucket.sortLabel ?? (
  typeof bucket.label === 'string'
    ? bucket.label
    : bucket.key
)

export const compareGroupSortValues = (
  left: BucketSortValue,
  right: BucketSortValue
): number => compare.compareNullableLast(left, right, (resolvedLeft, resolvedRight) => {
  if (typeof resolvedLeft === 'string' && typeof resolvedRight === 'string') {
    return compareLabels(resolvedLeft, resolvedRight)
  }

  if (typeof resolvedLeft === 'number' && typeof resolvedRight === 'number') {
    return compare.comparePrimitive(resolvedLeft, resolvedRight)
  }

  if (typeof resolvedLeft === 'boolean' && typeof resolvedRight === 'boolean') {
    return compare.comparePrimitive(Number(resolvedLeft), Number(resolvedRight))
  }

  return compareLabels(String(resolvedLeft), String(resolvedRight))
})

export const readBucketOrder = (bucket: Bucket) => (
  (bucket as ResolvedBucket).order ?? Number.MAX_SAFE_INTEGER
)

export const readBucketSortValue = (bucket: Bucket) => (
  (bucket as ResolvedBucket).sortValue
)
