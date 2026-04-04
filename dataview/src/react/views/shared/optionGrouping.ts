import type { GroupProperty } from '@dataview/core/contracts'

export const usesOptionGroupingColors = (
  property?: Pick<GroupProperty, 'kind'>
) => (
  property?.kind === 'select'
  || property?.kind === 'multiSelect'
  || property?.kind === 'status'
)
