import type { GroupPropertyKind } from '@dataview/core/contracts'
import { meta, renderMessage } from '@dataview/meta'
import { Menu } from '@dataview/react/ui'

export interface PropertyKindPickerProps {
  kind?: GroupPropertyKind
  isTitleProperty: boolean
  onSelect: (kind: GroupPropertyKind) => void
}

export const PropertyKindPicker = (props: PropertyKindPickerProps) => {
  return <Menu
    items={meta.property.kind.list.map(item => {
      const Icon = item.Icon

      return {
        kind: 'toggle' as const,
        key: item.id,
        label: renderMessage(item.message),
        leading: <Icon className="size-4" size={16} strokeWidth={1.8} />,
        checked: props.kind === item.id,
        disabled: props.isTitleProperty && item.id !== 'text',
        onSelect: () => props.onSelect(item.id as GroupPropertyKind)
      }
    })}
  />
}
