import type { GroupProperty } from '@/core/contracts'
import { parsePropertyDraft } from '@/core/property'
import {
  cn,
  uiTone
} from '@/react/ui'
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
          uiTone.checkbox(props.value),
          props.className
        )}
      >
        {props.value ? 'Checked' : 'Unchecked'}
      </span>
    )
  },
  toggle: value => value === true ? false : true
})
