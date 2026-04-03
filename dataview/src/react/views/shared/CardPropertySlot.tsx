import type {
  GroupProperty,
  PropertyId
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
  fieldPropertyIds: readonly PropertyId[]
  mode: 'view' | 'edit'
  className?: string
  valueClassName?: string
  density?: 'default' | 'compact'
  onSelect?: () => void
}

export const CardPropertySlot = (props: CardPropertySlotProps) => {
  const empty = isEmptyPropertyValue(props.value)
  if (empty) {
    return props.mode === 'edit'
      ? (
        <AddCardPropertyTrigger
          field={props.field}
          property={props.property}
          fieldPropertyIds={props.fieldPropertyIds}
          className={props.className}
          onSelect={props.onSelect}
        />
      )
      : null
  }

  return (
    <CardField
      field={props.field}
      property={props.property}
      value={props.value}
      fieldPropertyIds={props.fieldPropertyIds}
      className={props.className}
      valueClassName={props.valueClassName}
      density={props.density}
      onSelect={props.onSelect}
    />
  )
}
