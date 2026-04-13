import type { CustomField } from '@dataview/core/contracts'
import {
  getFieldOption,
  getFieldDisplayValue,
  parseFieldDraft
} from '@dataview/core/field'
import { FieldOptionTag } from '#react/field/options/index.ts'
import { StatusValueEditor } from '#react/field/value/editor/pickers/status/StatusValueEditor.tsx'
import type { FieldValueSpec } from '#react/field/value/kinds/contracts.ts'
import {
  renderEmpty
} from '#react/field/value/kinds/shared.tsx'

export const createStatusFieldSpec = (
  field: CustomField | undefined
): FieldValueSpec<string> => ({
  capability: {},
  panelWidth: 'picker',
  Editor: StatusValueEditor,
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
        variant="status"
        className={props.className}
      />
    )
  }
})
