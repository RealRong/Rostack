export interface Bucket {
  key: string
  title: string
  value?: unknown
  clearValue: boolean
  empty: boolean
  color?: string
}

export type BucketSortValue = string | number | boolean | null | undefined

export interface ResolvedBucket extends Bucket {
  order: number
  sortValue?: BucketSortValue
}

const labelCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
})

const comparePrimitive = (
  left: string | number | boolean,
  right: string | number | boolean
) => {
  if (left === right) {
    return 0
  }

  return left > right ? 1 : -1
}

export const compareLabels = (
  left: string,
  right: string
) => labelCollator.compare(left, right)

export const compareGroupSortValues = (
  left: BucketSortValue,
  right: BucketSortValue
): number => {
  if (left == null || right == null) {
    return left == null
      ? (right == null ? 0 : 1)
      : -1
  }

  if (typeof left === 'string' && typeof right === 'string') {
    return compareLabels(left, right)
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return comparePrimitive(left, right)
  }

  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return comparePrimitive(Number(left), Number(right))
  }

  return compareLabels(String(left), String(right))
}

export const readBucketOrder = (bucket: Bucket) => (
  (bucket as ResolvedBucket).order ?? Number.MAX_SAFE_INTEGER
)

export const readBucketSortValue = (bucket: Bucket) => (
  (bucket as ResolvedBucket).sortValue
)
