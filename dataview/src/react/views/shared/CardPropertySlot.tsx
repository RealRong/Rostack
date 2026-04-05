import type {
  GroupProperty
} from '@dataview/core/contracts'
import {
  isEmptyPropertyValue
} from '@dataview/core/property'
import type {
  ViewFieldRef
} from '@dataview/engine/projection/view'
import { CardField } from './CardField'
import { AddCardPropertyTrigger } from './AddCardPropertyTrigger'

export interface CardPropertySlotProps {
  field: ViewFieldRef
  property: GroupProperty
  value: unknown
  mode: 'view' | 'edit'
  className?: string
  valueClassName?: string
  density?: 'default' | 'compact'
  openOnClick?: boolean
}

export const CardPropertySlot = (props: CardPropertySlotProps) => {
  const empty = isEmptyPropertyValue(props.value)
  if (empty) {
    return props.mode === 'edit'
      ? (
        <AddCardPropertyTrigger
          field={props.field}
          property={props.property}
          className={props.className}
          openOnClick={props.openOnClick}
        />
      )
      : null
  }

  return (
    <CardField
      field={props.field}
      property={props.property}
      value={props.value}
      className={props.className}
      valueClassName={props.valueClassName}
      density={props.density}
      openOnClick={props.openOnClick}
    />
  )
}
