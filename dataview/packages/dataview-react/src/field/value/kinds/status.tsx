import type { CustomField } from '@dataview/core/types'
import {
  field as fieldApi
} from '@dataview/core/field'
import { FieldOptionTag } from '@dataview/react/field/options'
import { StatusValueEditor } from '@dataview/react/field/value/editor/pickers/status/StatusValueEditor'
import type { FieldValueSpec } from '@dataview/react/field/value/kinds/contracts'
import {
  renderEmpty
} from '@dataview/react/field/value/kinds/shared'

export const createStatusFieldSpec = (
  field: CustomField | undefined
): FieldValueSpec<string> => ({
  capability: {},
  panelWidth: 'picker',
  Editor: StatusValueEditor,
  createDraft: (value, seedDraft) => seedDraft ?? (value === undefined || value === null ? '' : String(value)),
  parseDraft: draft => fieldApi.draft.parse(field, draft),
  render: props => {
    const display = fieldApi.display.value(field, props.value)
    const selected = field ? fieldApi.option.read.get(field, props.value) : undefined
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
})
