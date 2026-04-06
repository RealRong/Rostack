import type { ComponentType } from 'react'
import type { GroupProperty } from '@dataview/core/contracts'
import {
  getPropertyDisplayValue,
  parsePropertyDraft
} from '@dataview/core/property'
import { cn } from '@ui/utils'
import {
  InputEditor,
  type InputKind
} from '../editor/basic/InputEditor'
import type { PropertyValueDraftEditorProps } from '../editor'
import type { PropertyValueSpec } from './contracts'
import { renderEmpty } from './shared'

const resolveInputKind = (
  property?: GroupProperty
): InputKind => {
  switch (property?.kind) {
    case 'number':
      return 'number'
    default:
      return 'text'
  }
}

const toInputDraft = (
  type: InputKind,
  value: unknown
) => {
  if (value === undefined || value === null) {
    return ''
  }

  return String(value)
}

const TextInputEditor = (props: PropertyValueDraftEditorProps<string>) => (
  <InputEditor {...props} type="text" />
)

const NumberInputEditor = (props: PropertyValueDraftEditorProps<string>) => (
  <InputEditor {...props} type="number" />
)

const inputEditors: Record<InputKind, ComponentType<PropertyValueDraftEditorProps<string>>> = {
  text: TextInputEditor,
  number: NumberInputEditor
}

export const createTextPropertySpec = (
  property: GroupProperty | undefined
): PropertyValueSpec<string> => {
  const type = resolveInputKind(property)

  return {
    capability: {},
    panelWidth: 'default',
    Editor: inputEditors[type],
    createDraft: (value, seedDraft) => seedDraft ?? toInputDraft(type, value),
    parseDraft: draft => parsePropertyDraft(property, draft),
    render: props => {
      const display = getPropertyDisplayValue(property, props.value)
      if (!display) {
        return renderEmpty(props)
      }

      return (
        <span className={cn('block truncate', props.className)}>
          {display}
        </span>
      )
    }
  }
}
