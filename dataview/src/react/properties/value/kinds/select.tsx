import type { GroupProperty } from '@/core/contracts'
import {
  getPropertyDisplayValue,
  parsePropertyDraft
} from '@/core/property'
import { PropertyOptionTag } from '@/react/properties/options'
import { OptionPickerEditor } from '../editor/pickers/option/OptionPickerEditor'
import type { PropertyValueDraftEditorProps } from '../editor'
import type { PropertyValueSpec } from './contracts'
import {
  optionForValue,
  renderEmpty
} from './shared'

const SingleSelectEditor = (props: PropertyValueDraftEditorProps<string>) => (
  <OptionPickerEditor {...props} mode="single" />
)

export const createSingleSelectPropertySpec = (
  property: GroupProperty | undefined
): PropertyValueSpec<string> => ({
  capability: {},
  panelWidth: 'picker',
  Editor: SingleSelectEditor,
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
