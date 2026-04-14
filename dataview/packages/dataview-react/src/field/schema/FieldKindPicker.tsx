import type { CustomFieldKind } from '@dataview/core/contracts'
import { Menu, type MenuItem } from '@shared/ui/menu'
import { meta, renderMessage } from '@dataview/meta'
import { buildChoiceToggleItems } from '@dataview/react/menu-builders'

export interface FieldKindPickerProps {
  kind?: CustomFieldKind
  isTitleProperty: boolean
  onSelect: (kind: CustomFieldKind) => void
}

export const buildFieldKindMenuItems = (props: FieldKindPickerProps): readonly MenuItem[] => (
  buildChoiceToggleItems({
    options: meta.field.kind.list.map(item => {
      const Icon = item.Icon

      return {
        id: item.id as CustomFieldKind,
        label: renderMessage(item.message),
        leading: <Icon className="size-4" size={16} strokeWidth={1.8} />,
        disabled: props.isTitleProperty && item.id !== 'text'
      }
    }),
    value: props.kind,
    onSelect: props.onSelect
  })
)

export const FieldKindPicker = (props: FieldKindPickerProps) => {
  return (
    <div className="px-2 py-2">
      <Menu
        items={buildFieldKindMenuItems(props)}
        autoFocus={false}
      />
    </div>
  )
}
