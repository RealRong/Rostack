export const readUniformValue = <TItem, TValue>(
  items: readonly TItem[],
  read: (item: TItem) => TValue,
  equal: (left: TValue, right: TValue) => boolean = Object.is
): TValue | undefined => {
  if (!items.length) {
    return undefined
  }

  const first = read(items[0]!)
  return items.every((item) => equal(first, read(item)))
    ? first
    : undefined
}
