import type {
  CustomField
} from '@dataview/core/contracts'
import {
  isEmptyFieldValue
} from '@dataview/core/field'
import type {
  ViewFieldRef
} from '@dataview/engine'
import { CardField } from '#react/views/shared/CardField.tsx'
import { AddCardFieldTrigger } from '#react/views/shared/AddCardFieldTrigger.tsx'

export interface CardFieldSlotProps {
  field: ViewFieldRef
  customField: CustomField
  value: unknown
  mode: 'view' | 'edit'
  className?: string
  valueClassName?: string
  density?: 'default' | 'compact'
  openOnClick?: boolean
}

export const CardFieldSlot = (props: CardFieldSlotProps) => {
  const empty = isEmptyFieldValue(props.value)
  if (empty) {
    return props.mode === 'edit'
      ? (
        <AddCardFieldTrigger
          field={props.field}
          customField={props.customField}
          className={props.className}
          openOnClick={props.openOnClick}
        />
      )
      : null
  }

  return (
    <CardField
      field={props.field}
      customField={props.customField}
      value={props.value}
      className={props.className}
      valueClassName={props.valueClassName}
      density={props.density}
      openOnClick={props.openOnClick}
    />
  )
}
