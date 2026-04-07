import type { CustomField } from '@dataview/core/contracts'
import {
  getFieldOption,
  getFieldDisplayValue,
  parseFieldDraft
} from '@dataview/core/field'
import { FieldOptionTag } from '@dataview/react/field/options'
import { StatusValueEditor } from '../editor/pickers/status/StatusValueEditor'
import type { FieldValueSpec } from './contracts'
import {
  renderEmpty
} from './shared'

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
        className={props.className}
      />
    )
  }
})
