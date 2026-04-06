import type { Field } from '@dataview/core/contracts'

export const usesOptionGroupingColors = (
  property?: Pick<Field, 'kind'>
) => {
  if (!property || property.kind === 'title') {
    return false
  }

  return (
    property.kind === 'select'
    || property.kind === 'multiSelect'
    || property.kind === 'status'
  )
}
