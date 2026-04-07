import type { ComponentType } from 'react'
import type { Field } from '@dataview/core/contracts'
import {
  getFieldDisplayValue,
  parseFieldDraft
} from '@dataview/core/field'
import { cn } from '@ui/utils'
import {
  InputEditor,
  type InputKind
} from '../editor/basic/InputEditor'
import type { FieldValueDraftEditorProps } from '../editor'
import type { FieldValueSpec } from './contracts'
import { renderEmpty } from './shared'

const resolveInputKind = (
  field?: Field
): InputKind => {
  switch (field?.kind) {
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

const TextInputEditor = (props: FieldValueDraftEditorProps<string>) => (
  <InputEditor {...props} type="text" />
)

const NumberInputEditor = (props: FieldValueDraftEditorProps<string>) => (
  <InputEditor {...props} type="number" />
)

const inputEditors: Record<InputKind, ComponentType<FieldValueDraftEditorProps<string>>> = {
  text: TextInputEditor,
  number: NumberInputEditor
}

export const createTextPropertySpec = (
  field: Field | undefined
): FieldValueSpec<string> => {
  const type = resolveInputKind(field)

  return {
    capability: {},
    panelWidth: 'default',
    Editor: inputEditors[type],
    createDraft: (value, seedDraft) => seedDraft ?? toInputDraft(type, value),
    parseDraft: draft => parseFieldDraft(field, draft),
    render: props => {
      const display = getFieldDisplayValue(field, props.value)
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
