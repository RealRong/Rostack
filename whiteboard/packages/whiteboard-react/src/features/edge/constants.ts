export const resolveEdgeDash = (
  value: 'solid' | 'dashed' | 'dotted' | undefined
) => {
  if (value === 'dashed') {
    return '8 6'
  }
  if (value === 'dotted') {
    return '2 4'
  }
  return undefined
}
