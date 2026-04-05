import type { ReactNode } from 'react'
import type {
  GroupProperty,
  RecordId
} from '@dataview/core/contracts'
import {
  resolvePropertyPrimaryAction
} from '@dataview/core/property'
import {
  useDataView,
} from '@dataview/react/dataview'
import {
  PropertyValueContent
} from '@dataview/react/properties/value'
import {
  fieldAttrs
} from '@dataview/dom/field'
import type {
  ViewFieldRef
} from '@dataview/engine/projection/view'
import { cn } from '@ui/utils'
import { openCardField } from './openCardField'

export interface CardFieldProps {
  field: ViewFieldRef
  property?: GroupProperty
  value: unknown
  emptyPlaceholder?: ReactNode
  className?: string
  valueClassName?: string
  density?: 'default' | 'compact'
  openOnClick?: boolean
}

const applyRecordValue = (input: {
  setValue: (recordId: RecordId, propertyId: string, value: unknown) => void
  clearValue: (recordId: RecordId, propertyId: string) => void
  recordId: RecordId
  propertyId: string
  value: unknown | undefined
}) => {
  if (input.value === undefined) {
    input.clearValue(input.recordId, input.propertyId)
    return
  }

  input.setValue(input.recordId, input.propertyId, input.value)
}

export const CardField = (props: CardFieldProps) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const valueEditor = dataView.valueEditor

  if (!props.property) {
    return (
      <PropertyValueContent
        property={props.property}
        value={props.value}
        emptyPlaceholder={props.emptyPlaceholder}
        className={props.valueClassName}
        density={props.density}
      />
    )
  }
  const property = props.property

  const onQuickToggle = () => {
    const action = resolvePropertyPrimaryAction({
      exists: true,
      property,
      value: props.value
    })
    if (action.kind !== 'quickToggle') {
      return
    }

    dataView.selection.set([props.field.appearanceId])
    applyRecordValue({
      setValue: engine.records.setValue,
      clearValue: engine.records.clearValue,
      recordId: props.field.recordId,
      propertyId: property.id,
      value: action.value
    })
  }

  const action = resolvePropertyPrimaryAction({
    exists: true,
    property,
    value: props.value
  })

  const open = (element: HTMLElement) => {
    openCardField({
      valueEditor,
      field: props.field,
      element,
      focusOwner: () => {
        dataView.selection.set([props.field.appearanceId])
      }
    })
  }

  if (action.kind === 'quickToggle') {
    return (
      <div className={cn('min-w-0', props.className)}>
        <PropertyValueContent
          property={property}
          value={props.value}
          emptyPlaceholder={props.emptyPlaceholder}
          className={props.valueClassName}
          density={props.density}
          onQuickToggle={onQuickToggle}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      {...fieldAttrs(props.field)}
      onClick={event => {
        if (props.openOnClick) {
          event.preventDefault()
          event.stopPropagation()
          open(event.currentTarget)
          return
        }

        event.stopPropagation()
        dataView.selection.set([props.field.appearanceId])
      }}
      onDoubleClick={event => {
        if (props.openOnClick) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        event.preventDefault()
        event.stopPropagation()
        dataView.selection.set([props.field.appearanceId])
        open(event.currentTarget)
      }}
      className={cn('min-w-0 select-none text-left', props.className)}
    >
      <PropertyValueContent
        property={property}
        value={props.value}
        emptyPlaceholder={props.emptyPlaceholder}
        className={props.valueClassName}
        density={props.density}
      />
    </button>
  )
}
