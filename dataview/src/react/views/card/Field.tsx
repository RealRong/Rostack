import type { ReactNode } from 'react'
import type {
  GroupProperty,
  PropertyId,
  RecordId
} from '@dataview/core/contracts'
import {
  resolvePropertyPrimaryAction
} from '@dataview/core/property'
import {
  useCurrentView,
  useEngine
} from '@dataview/react/editor'
import {
  PropertyValueContent
} from '@dataview/react/properties/value'
import {
  belowFieldAnchor,
  createPropertyEditOpener,
  fieldAttrs,
  resolveOpenAnchor,
  usePropertyEdit,
  type PropertyEditTarget
} from '@dataview/react/propertyEdit'
import {
  stepViewFieldByIntent
} from '@dataview/react/view/field'
import type {
  ViewFieldRef
} from '@dataview/react/view'
import { cn } from '@ui/utils'

export interface CardFieldProps {
  field: ViewFieldRef
  property?: GroupProperty
  value: unknown
  fieldPropertyIds: readonly PropertyId[]
  emptyPlaceholder?: ReactNode
  className?: string
  onSelect?: () => void
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
  const engine = useEngine()
  const propertyEdit = usePropertyEdit()
  const currentView = useCurrentView(view => (
    view?.view.id === props.field.viewId
      ? view
      : undefined
  ))
  if (!currentView) {
    throw new Error('Card field requires an active current view.')
  }

  if (!props.property) {
    return (
      <PropertyValueContent
        property={props.property}
        value={props.value}
        emptyPlaceholder={props.emptyPlaceholder}
        className={props.className}
      />
    )
  }
  const property = props.property

  const openField = createPropertyEditOpener<PropertyEditTarget>({
    propertyEdit,
    anchor: target => resolveOpenAnchor({
      field: target.field,
      element: target.element,
      fallback: belowFieldAnchor
    }),
    next: (target, intent) => {
      const field = stepViewFieldByIntent({
        field: target.field,
        scope: {
          appearanceIds: [target.field.appearanceId],
          propertyIds: props.fieldPropertyIds
        },
        appearances: currentView.appearances,
        intent
      })

      return field
        ? { field }
        : null
    }
  })

  const onQuickToggle = () => {
    const action = resolvePropertyPrimaryAction({
      exists: true,
      property,
      value: props.value
    })
    if (action.kind !== 'quickToggle') {
      return
    }

    props.onSelect?.()
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

  if (action.kind === 'quickToggle') {
    return (
      <div className={cn('min-w-0', props.className)}>
        <PropertyValueContent
          property={property}
          value={props.value}
          emptyPlaceholder={props.emptyPlaceholder}
          className={props.className}
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
        event.stopPropagation()
        props.onSelect?.()
      }}
      onDoubleClick={event => {
        event.preventDefault()
        event.stopPropagation()
        props.onSelect?.()

        openField({
          field: props.field,
          element: event.currentTarget
        })
      }}
      className={cn('min-w-0 select-none text-left', props.className)}
    >
      <PropertyValueContent
        property={property}
        value={props.value}
        emptyPlaceholder={props.emptyPlaceholder}
        className={props.className}
      />
    </button>
  )
}
