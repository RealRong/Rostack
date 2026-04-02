import type { GroupProperty } from '@dataview/core/contracts'
import { getPropertyDisplayValue, parsePropertyDraft } from '@dataview/core/property'
import { PropertyOptionTag } from '@dataview/react/properties/options'
import { cn } from '@dataview/react/ui'
import { OptionPickerEditor } from '../editor/pickers/option/OptionPickerEditor'
import type { PropertyValueDraftEditorProps } from '../editor'
import type { PropertyValueSpec } from './contracts'
import {
  optionForValue,
  renderEmpty
} from './shared'

const MultiSelectEditor = (props: PropertyValueDraftEditorProps<string>) => (
  <OptionPickerEditor {...props} mode="multi" />
)

export const createMultiSelectPropertySpec = (
  property: GroupProperty | undefined
): PropertyValueSpec<string> => ({
  capability: {},
  panelWidth: 'picker',
  Editor: MultiSelectEditor,
  createDraft: (value, seedDraft) => seedDraft ?? (Array.isArray(value) ? value.join(', ') : ''),
  parseDraft: draft => parsePropertyDraft(property, draft),
  render: props => {
    if (!Array.isArray(props.value) || !props.value.length) {
      return renderEmpty(props)
    }

    const values = props.value.map(item => ({
      id: item,
      label: getPropertyDisplayValue(property, item) ?? String(item),
      color: optionForValue(property, item)?.color
    }))
    const visible = values.slice(0, 2)
    const rest = values.length - visible.length

    return (
      <span className={cn('inline-flex max-w-full items-center gap-1 overflow-hidden', props.className)}>
        {visible.map(item => (
          <PropertyOptionTag
            key={String(item.id)}
            label={item.label}
            color={item.color}
            className="max-w-[8rem]"
          />
        ))}
        {rest > 0 ? (
          <span className="text-[11px] text-muted-foreground">+{rest}</span>
        ) : null}
      </span>
    )
  }
})
