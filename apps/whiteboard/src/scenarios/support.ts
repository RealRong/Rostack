type CountBucket<TKey extends string> = {
  key: TKey
  min?: number
  weight: number
}

const distributeRemainder = <TKey extends string>(
  counts: Record<TKey, number>,
  buckets: ReadonlyArray<CountBucket<TKey> & { fraction: number }>,
  total: number
) => {
  let assigned = (Object.values(counts) as number[]).reduce<number>(
    (sum, value) => sum + value,
    0
  )
  if (assigned >= total || buckets.length === 0) {
    return
  }

  const ranked = [...buckets].sort((left, right) => {
    if (right.fraction !== left.fraction) {
      return right.fraction - left.fraction
    }
    return right.weight - left.weight
  })

  let cursor = 0
  while (assigned < total) {
    const bucket = ranked[cursor % ranked.length]
    counts[bucket.key] += 1
    assigned += 1
    cursor += 1
  }
}

export const allocateCounts = <TKey extends string>(
  total: number,
  buckets: ReadonlyArray<CountBucket<TKey>>
): Record<TKey, number> => {
  const minimum = buckets.reduce((sum, bucket) => sum + (bucket.min ?? 0), 0)
  if (total < minimum) {
    throw new Error(`Cannot allocate ${total} items with minimum ${minimum}`)
  }

  const counts = Object.fromEntries(
    buckets.map((bucket) => [bucket.key, bucket.min ?? 0])
  ) as Record<TKey, number>

  const remaining = total - minimum
  if (remaining === 0) {
    return counts
  }

  const weightTotal = buckets.reduce((sum, bucket) => sum + bucket.weight, 0)
  const ranked = buckets.map((bucket) => {
    const exact = remaining * (bucket.weight / weightTotal)
    const whole = Math.floor(exact)
    counts[bucket.key] += whole
    return {
      ...bucket,
      fraction: exact - whole
    }
  })

  distributeRemainder(counts, ranked, total)
  return counts
}

export const distributeEvenly = (
  total: number,
  count: number
): number[] => {
  if (count <= 0) {
    return []
  }

  const base = Math.floor(total / count)
  const remainder = total % count
  return Array.from({ length: count }, (_value, index) => (
    base + (index < remainder ? 1 : 0)
  ))
}

export const indexFromSeed = (
  seed: string
): number => {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export const createSeededRandom = (
  seed: string
) => {
  let state = indexFromSeed(seed) || 0x9e3779b9

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int: (maxExclusive: number) => {
      if (maxExclusive <= 1) {
        return 0
      }
      return Math.floor(next() * maxExclusive)
    },
    range: (min: number, max: number) => min + (max - min) * next(),
    jitter: (value: number, radius: number) => value + (next() * 2 - 1) * radius,
    pick: <TValue,>(values: readonly TValue[]) => {
      if (values.length === 0) {
        throw new Error('Cannot pick from an empty list')
      }
      return values[Math.floor(next() * values.length)]!
    }
  }
}

export const cycle = <TValue,>(
  values: readonly TValue[],
  index: number
): TValue => {
  if (values.length === 0) {
    throw new Error('Cannot cycle an empty list')
  }

  const offset = index % values.length
  return values[offset < 0 ? offset + values.length : offset]!
}
