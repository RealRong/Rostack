import type { ReactNode } from 'react'
import type {
  CustomField,
  RecordId
} from '@dataview/core/contracts'
import {
  resolveCustomFieldPrimaryAction
} from '@dataview/core/field'
import {
  useDataView,
} from '@dataview/react/dataview'
import {
  FieldValueContent
} from '@dataview/react/field/value'
import {
  fieldAttrs
} from '@dataview/react/dom/field'
import type {
  ViewFieldRef
} from '@dataview/engine'
import { cn } from '@ui/utils'
import { openCardField } from './openCardField'

export interface CardFieldProps {
  field: ViewFieldRef
  customField?: CustomField
  value: unknown
  emptyPlaceholder?: ReactNode
  className?: string
  valueClassName?: string
  density?: 'default' | 'compact'
  openOnClick?: boolean
}

const applyRecordValue = (input: {
  set: (recordId: RecordId, fieldId: string, value: unknown) => void
  clear: (recordId: RecordId, fieldId: string) => void
  recordId: RecordId
  fieldId: string
  value: unknown | undefined
}) => {
  if (input.value === undefined) {
    input.clear(input.recordId, input.fieldId)
    return
  }

  input.set(input.recordId, input.fieldId, input.value)
}

export const CardField = (props: CardFieldProps) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const valueEditor = dataView.valueEditor

  if (!props.customField) {
    return (
      <FieldValueContent
        field={props.customField}
        value={props.value}
        emptyPlaceholder={props.emptyPlaceholder}
        className={props.valueClassName}
        density={props.density}
      />
    )
  }
  const customField = props.customField

  const onQuickToggle = () => {
    const action = resolveCustomFieldPrimaryAction({
      exists: true,
      field: customField,
      value: props.value
    })
    if (action.kind !== 'quickToggle') {
      return
    }

    dataView.selection.set([props.field.itemId])
    applyRecordValue({
      set: engine.records.values.set,
      clear: engine.records.values.clear,
      recordId: props.field.recordId,
      fieldId: customField.id,
      value: action.value
    })
  }

  const action = resolveCustomFieldPrimaryAction({
    exists: true,
    field: customField,
    value: props.value
  })

  const open = (element: HTMLElement) => {
    openCardField({
      valueEditor,
      field: props.field,
      element,
      focusOwner: () => {
        dataView.selection.set([props.field.itemId])
      }
    })
  }

  if (action.kind === 'quickToggle') {
    return (
      <div className={cn('min-w-0', props.className)}>
        <FieldValueContent
          field={customField}
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
        dataView.selection.set([props.field.itemId])
      }}
      onDoubleClick={event => {
        if (props.openOnClick) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        event.preventDefault()
        event.stopPropagation()
        dataView.selection.set([props.field.itemId])
        open(event.currentTarget)
      }}
      className={cn('min-w-0 select-none text-left', props.className)}
    >
      <FieldValueContent
        field={customField}
        value={props.value}
        emptyPlaceholder={props.emptyPlaceholder}
        className={props.valueClassName}
        density={props.density}
      />
    </button>
  )
}
