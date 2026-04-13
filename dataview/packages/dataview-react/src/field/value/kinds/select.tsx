import type { CustomField } from '@dataview/core/contracts'
import {
  getFieldOption,
  getFieldDisplayValue,
  parseFieldDraft
} from '@dataview/core/field'
import { FieldOptionTag } from '#dataview-react/field/options'
import { OptionPickerEditor } from '#dataview-react/field/value/editor/pickers/option/OptionPickerEditor'
import type { FieldValueDraftEditorProps } from '#dataview-react/field/value/editor'
import type { FieldValueSpec } from '#dataview-react/field/value/kinds/contracts'
import {
  renderEmpty
} from '#dataview-react/field/value/kinds/shared'

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
  parseDraft: draft => parseFieldDraft(field, draft),
  render: props => {
    const display = getFieldDisplayValue(field, props.value)
    const selected = field ? getFieldOption(field, props.value) : undefined
    if (!display) {
      return renderEmpty(props)
    }

    return (
      <FieldOptionTag
        label={display}
        color={selected?.color ?? undefined}
        className={props.className}
      />
    )
  }
})
