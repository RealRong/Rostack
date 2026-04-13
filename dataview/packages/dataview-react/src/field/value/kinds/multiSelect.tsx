import type { CustomField } from '@dataview/core/contracts'
import { getFieldOption, parseFieldDraft } from '@dataview/core/field'
import { FieldOptionTag } from '#dataview-react/field/options'
import { cn } from '@shared/ui/utils'
import { OptionPickerEditor } from '#dataview-react/field/value/editor/pickers/option/OptionPickerEditor'
import type { FieldValueDraftEditorProps } from '#dataview-react/field/value/editor'
import type { FieldValueSpec } from '#dataview-react/field/value/kinds/contracts'
import {
  renderEmpty
} from '#dataview-react/field/value/kinds/shared'

const MultiSelectEditor = (props: FieldValueDraftEditorProps<string>) => (
  <OptionPickerEditor {...props} mode="multi" />
)

export const createMultiSelectPropertySpec = (
  field: CustomField | undefined
): FieldValueSpec<string> => ({
  capability: {},
  panelWidth: 'picker',
  Editor: MultiSelectEditor,
  createDraft: (value, seedDraft) => seedDraft ?? (Array.isArray(value) ? value.join(', ') : ''),
  parseDraft: draft => parseFieldDraft(field, draft),
  render: props => {
    if (!Array.isArray(props.value) || !props.value.length) {
      return renderEmpty(props)
    }

    const values = props.value.map(item => ({
      id: item,
      label: getFieldOption(field, item)?.name ?? String(item),
      color: getFieldOption(field, item)?.color
    }))
    const visible = values.slice(0, 2)
    const rest = values.length - visible.length

    return (
      <span className={cn('inline-flex max-w-full items-center gap-1 overflow-hidden', props.className)}>
        {visible.map(item => (
          <FieldOptionTag
            key={String(item.id)}
            label={item.label}
            color={item.color ?? undefined}
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
