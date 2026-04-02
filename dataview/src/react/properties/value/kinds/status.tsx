import type { GroupProperty } from '@dataview/core/contracts'
import {
  getPropertyDisplayValue,
  parsePropertyDraft
} from '@dataview/core/property'
import { PropertyOptionTag } from '@dataview/react/properties/options'
import { StatusValueEditor } from '../editor/pickers/status/StatusValueEditor'
import type { PropertyValueSpec } from './contracts'
import {
  optionForValue,
  renderEmpty
} from './shared'

export const createStatusPropertySpec = (
  property: GroupProperty | undefined
): PropertyValueSpec<string> => ({
  capability: {},
  panelWidth: 'picker',
  Editor: StatusValueEditor,
  createDraft: (value, seedDraft) => seedDraft ?? (value === undefined || value === null ? '' : String(value)),
  parseDraft: draft => parsePropertyDraft(property, draft),
  render: props => {
    const display = getPropertyDisplayValue(property, props.value)
    const selected = optionForValue(property, props.value)
    if (!display) {
      return renderEmpty(props)
    }

    return (
      <PropertyOptionTag
        label={display}
        color={selected?.color}
        className={props.className}
      />
    )
  }
})
