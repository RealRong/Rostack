import type { Field } from '@dataview/core/types'
import {
  field as fieldApi
} from '@dataview/core/field'
import { cn } from '@shared/ui/utils'
import {
  InputEditor,
  type InputKind
} from '@dataview/react/field/value/editor/basic/InputEditor'
import type { FieldValueDraftEditorProps } from '@dataview/react/field/value/editor'
import type { FieldValueSpec } from '@dataview/react/field/value/kinds/contracts'
import { renderEmpty } from '@dataview/react/field/value/kinds/shared'

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
  value: unknown
) => {
  if (value === undefined || value === null) {
    return ''
  }

  return String(value)
}

const TextValueEditor = (props: FieldValueDraftEditorProps<string>) => (
  <InputEditor
    {...props}
    type={resolveInputKind(props.field)}
  />
)

export const textFieldValueSpec: FieldValueSpec<string> = {
  capability: {},
  panelWidth: 'default',
  Editor: TextValueEditor,
  createDraft: (field, value, seedDraft) => seedDraft ?? toInputDraft(value),
  parseDraft: (field, draft) => fieldApi.draft.parse(field, draft),
  render: (field, props) => {
    const display = fieldApi.display.value(field, props.value)
    if (!display) {
      return renderEmpty(props)
    }

    return (
      <span
        className={cn(
          'block',
          props.wrap
            ? 'whitespace-normal break-words [overflow-wrap:anywhere]'
            : 'truncate',
          props.className
        )}
      >
        {display}
      </span>
    )
  }
}
