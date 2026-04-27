import type { Field } from '@dataview/core/types'
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

const readCustomField = (
  field?: Field
) => fieldApi.kind.isCustom(field)
  ? field
  : undefined

export const selectFieldValueSpec: FieldValueSpec<string> = {
  capability: {},
  panelWidth: 'picker',
  Editor: SingleSelectEditor,
  createDraft: (_field, value, seedDraft) => seedDraft ?? (
    value === undefined || value === null
      ? ''
      : String(value)
  ),
  parseDraft: (field, draft) => fieldApi.draft.parse(
    readCustomField(field),
    draft
  ),
  render: (field, props) => {
    const customField = readCustomField(field)
    const display = fieldApi.display.value(customField, props.value)
    const selected = customField
      ? fieldApi.option.read.get(customField, props.value)
      : undefined
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
}
