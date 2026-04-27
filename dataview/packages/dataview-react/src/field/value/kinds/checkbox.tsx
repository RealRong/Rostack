import type { Field } from '@dataview/core/types'
import { field as fieldApi } from '@dataview/core/field'
import { cn } from '@shared/ui/utils'
import { CheckboxEditor } from '@dataview/react/field/value/editor/basic/CheckboxEditor'
import type { FieldValueSpec } from '@dataview/react/field/value/kinds/contracts'
import { renderEmpty } from '@dataview/react/field/value/kinds/shared'

const readCustomField = (
  field?: Field
) => fieldApi.kind.isCustom(field)
  ? field
  : undefined

export const checkboxFieldValueSpec: FieldValueSpec<string> = {
  capability: {
    quickToggle: true
  },
  panelWidth: 'default',
  Editor: CheckboxEditor,
  createDraft: (_field, value, seedDraft) => seedDraft ?? (
    value === true
      ? 'true'
      : value === false
        ? 'false'
        : value == null
          ? ''
          : String(value)
  ),
  parseDraft: (field, draft) => fieldApi.draft.parse(
    readCustomField(field),
    draft
  ),
  render: (_field, props) => {
    if (props.value !== true && props.value !== false) {
      return renderEmpty(props)
    }

    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
          props.value
            ? 'bg-green text-green'
            : 'bg-gray-muted text-gray',
          props.className
        )}
      >
        {props.value ? 'Checked' : 'Unchecked'}
      </span>
    )
  },
  toggle: (_field, value) => value === true ? false : true
}
