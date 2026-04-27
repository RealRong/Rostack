import type { Field } from '@dataview/core/types'
import { field as fieldApi } from '@dataview/core/field'
import { FieldOptionTag } from '@dataview/react/field/options'
import { cn } from '@shared/ui/utils'
import { OptionPickerEditor } from '@dataview/react/field/value/editor/pickers/option/OptionPickerEditor'
import type { FieldValueDraftEditorProps } from '@dataview/react/field/value/editor'
import type { FieldValueSpec } from '@dataview/react/field/value/kinds/contracts'
import {
  renderEmpty
} from '@dataview/react/field/value/kinds/shared'

const MultiSelectEditor = (props: FieldValueDraftEditorProps<string>) => (
  <OptionPickerEditor {...props} mode="multi" />
)

const readCustomField = (
  field?: Field
) => fieldApi.kind.isCustom(field)
  ? field
  : undefined

export const multiSelectFieldValueSpec: FieldValueSpec<string> = {
  capability: {},
  panelWidth: 'picker',
  Editor: MultiSelectEditor,
  createDraft: (_field, value, seedDraft) => seedDraft ?? (
    Array.isArray(value)
      ? value.join(', ')
      : ''
  ),
  parseDraft: (field, draft) => fieldApi.draft.parse(
    readCustomField(field),
    draft
  ),
  render: (field, props) => {
    const customField = readCustomField(field)
    if (!Array.isArray(props.value) || !props.value.length) {
      return renderEmpty(props)
    }

    const values = props.value.map(item => ({
      id: item,
      label: customField
        ? fieldApi.option.read.get(customField, item)?.name ?? String(item)
        : String(item),
      color: customField
        ? fieldApi.option.read.get(customField, item)?.color
        : undefined
    }))
    const visible = props.wrap
      ? values
      : values.slice(0, 2)
    const rest = values.length - visible.length

    return (
      <span
        className={cn(
          props.wrap
            ? 'inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1.5'
            : 'inline-flex max-w-full items-center gap-1 overflow-hidden',
          props.className
        )}
      >
        {visible.map(item => (
          <FieldOptionTag
            key={String(item.id)}
            label={item.label}
            color={item.color ?? undefined}
            appearance={props.optionTagAppearance}
            className="max-w-[8rem]"
          />
        ))}
        {rest > 0 ? (
          <span className="text-[11px] text-muted-foreground">+{rest}</span>
        ) : null}
      </span>
    )
  }
}
