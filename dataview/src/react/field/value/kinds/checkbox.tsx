import type { GroupProperty } from '@dataview/core/contracts'
import { parsePropertyDraft } from '@dataview/core/property'
import { cn } from '@ui/utils'
import { CheckboxEditor } from '../editor/basic/CheckboxEditor'
import type { PropertyValueSpec } from './contracts'
import { renderEmpty } from './shared'

export const createCheckboxPropertySpec = (
  property: GroupProperty | undefined
): PropertyValueSpec<string> => ({
  capability: {
    quickToggle: true
  },
  panelWidth: 'default',
  Editor: CheckboxEditor,
  createDraft: (value, seedDraft) => seedDraft ?? (
    value === true
      ? 'true'
      : value === false
        ? 'false'
        : value == null
          ? ''
          : String(value)
  ),
  parseDraft: draft => parsePropertyDraft(property, draft),
  render: props => {
    if (props.value !== true && props.value !== false) {
      return renderEmpty(props)
    }

    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
          props.value
            ? 'bg-green text-green'
            : 'bg-gray-muted text-gray',
          props.className
        )}
      >
        {props.value ? 'Checked' : 'Unchecked'}
      </span>
    )
  },
  toggle: value => value === true ? false : true
})
