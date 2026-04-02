import type { GroupProperty } from '@dataview/core/contracts'
import { getPropertyOptions } from '@dataview/core/property'
import type { RenderProps } from './contracts'

export const renderEmpty = (props: RenderProps) => (
  props.emptyPlaceholder
    ? <>{props.emptyPlaceholder}</>
    : null
)

export const optionForValue = (
  property: GroupProperty | undefined,
  optionId: unknown
) => {
  if (!property || typeof optionId !== 'string') {
    return undefined
  }

  return getPropertyOptions(property).find(item => item.id === optionId)
}
