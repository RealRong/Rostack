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

export const createStatusPropertySpec = (
  property: CustomField | undefined
): FieldValueSpec<string> => ({
  capability: {},
  panelWidth: 'picker',
  Editor: StatusValueEditor,
  createDraft: (value, seedDraft) => seedDraft ?? (value === undefined || value === null ? '' : String(value)),
  parseDraft: draft => parseFieldDraft(property, draft),
  render: props => {
    const display = getFieldDisplayValue(property, props.value)
    const selected = property ? getFieldOption(property, props.value) : undefined
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
