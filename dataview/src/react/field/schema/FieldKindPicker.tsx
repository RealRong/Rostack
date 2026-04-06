import type { CustomFieldKind } from '@dataview/core/contracts'
import { Menu, type MenuItem } from '@ui/menu'
import { meta, renderMessage } from '@dataview/meta'

export interface FieldKindPickerProps {
  kind?: CustomFieldKind
  isTitleProperty: boolean
  onSelect: (kind: CustomFieldKind) => void
}

export const buildFieldKindMenuItems = (props: FieldKindPickerProps): readonly MenuItem[] => (
  meta.field.kind.list.map(item => {
    const Icon = item.Icon

    return {
      kind: 'toggle' as const,
      key: item.id,
      label: renderMessage(item.message),
      leading: <Icon className="size-4" size={16} strokeWidth={1.8} />,
      checked: props.kind === item.id,
      disabled: props.isTitleProperty && item.id !== 'text',
      onSelect: () => props.onSelect(item.id as CustomFieldKind)
    }
  })
)

export const FieldKindPicker = (props: FieldKindPickerProps) => {
  return <Menu
    items={buildFieldKindMenuItems(props)}
  />
}
