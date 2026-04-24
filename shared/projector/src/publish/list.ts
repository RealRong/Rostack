const isSameValue = <TValue>(
  left: TValue,
  right: TValue
): boolean => Object.is(left, right)

export const isListEqual = <TValue>(
  left: readonly TValue[],
  right: readonly TValue[],
  isEqual: (left: TValue, right: TValue) => boolean = isSameValue
): boolean => {
  if (left === right) {
    return true
  }

  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!isEqual(left[index]!, right[index]!)) {
      return false
    }
  }

  return true
}
