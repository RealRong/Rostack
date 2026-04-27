import type { Field } from '@dataview/core/types'
import {
  field as fieldApi
} from '@dataview/core/field'
import { FieldOptionTag } from '@dataview/react/field/options'
import { StatusValueEditor } from '@dataview/react/field/value/editor/pickers/status/StatusValueEditor'
import type { FieldValueSpec } from '@dataview/react/field/value/kinds/contracts'
import {
  renderEmpty
} from '@dataview/react/field/value/kinds/shared'

const readCustomField = (
  field?: Field
) => fieldApi.kind.isCustom(field)
  ? field
  : undefined

export const statusFieldValueSpec: FieldValueSpec<string> = {
  capability: {},
  panelWidth: 'picker',
  Editor: StatusValueEditor,
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
        variant="status"
        appearance={props.optionTagAppearance}
        className={props.className}
      />
    )
  }
}
