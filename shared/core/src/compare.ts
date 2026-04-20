export type Compare<T> = (
  left: T,
  right: T
) => number

const DEFAULT_TEXT_COMPARE = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
})

export const comparePrimitive = <T extends string | number | boolean>(
  left: T,
  right: T
): number => {
  if (left === right) {
    return 0
  }

  return left > right
    ? 1
    : -1
}

export const compareNullableLast = <T,>(
  left: T | null | undefined,
  right: T | null | undefined,
  compare: Compare<T>
): number => {
  if (left == null || right == null) {
    return left == null
      ? (right == null ? 0 : 1)
      : -1
  }

  return compare(left, right)
}

export const createTextCompare = (
  options?: Intl.CollatorOptions
): Compare<string> => {
  if (!options) {
    return DEFAULT_TEXT_COMPARE.compare.bind(DEFAULT_TEXT_COMPARE)
  }

  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
    ...options
  })
  return collator.compare.bind(collator)
}

export const compareText = (
  left: string,
  right: string,
  options?: Intl.CollatorOptions
): number => (
  options
    ? createTextCompare(options)(left, right)
    : DEFAULT_TEXT_COMPARE.compare(left, right)
)

export const chainCompare = <T,>(
  ...steps: readonly Compare<T>[]
): Compare<T> => (left, right) => {
  for (let index = 0; index < steps.length; index += 1) {
    const result = steps[index]!(left, right)
    if (result !== 0) {
      return result
    }
  }

  return 0
}
