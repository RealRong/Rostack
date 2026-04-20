import type { CustomField } from '@dataview/core/contracts'
import {
  field as fieldApi
} from '@dataview/core/field'
import { FieldOptionTag } from '@dataview/react/field/options'
import { OptionPickerEditor } from '@dataview/react/field/value/editor/pickers/option/OptionPickerEditor'
import type { FieldValueDraftEditorProps } from '@dataview/react/field/value/editor'
import type { FieldValueSpec } from '@dataview/react/field/value/kinds/contracts'
import {
  renderEmpty
} from '@dataview/react/field/value/kinds/shared'

const SingleSelectEditor = (props: FieldValueDraftEditorProps<string>) => (
  <OptionPickerEditor {...props} mode="single" />
)

export const createSingleSelectPropertySpec = (
  field: CustomField | undefined
): FieldValueSpec<string> => ({
  capability: {},
  panelWidth: 'picker',
  Editor: SingleSelectEditor,
  createDraft: (value, seedDraft) => seedDraft ?? (value === undefined || value === null ? '' : String(value)),
  parseDraft: draft => fieldApi.draft.parse(field, draft),
  render: props => {
    const display = fieldApi.display.value(field, props.value)
    const selected = field ? fieldApi.option.get(field, props.value) : undefined
    if (!display) {
      return renderEmpty(props)
    }

    return (
      <FieldOptionTag
        label={display}
        color={selected?.color ?? undefined}
        appearance={props.optionTagAppearance}
        className={props.className}
      />
    )
  }
})
