import type { CustomFieldKind } from '@dataview/core/contracts'
import { Menu, type MenuItem } from '@shared/ui/menu'
import { meta } from '@dataview/meta'
import { useTranslation } from '@shared/i18n/react'
import type { TokenTranslator } from '@shared/i18n'
import { buildChoiceToggleItems } from '@dataview/react/menu-builders'

export interface FieldKindPickerProps {
  kind?: CustomFieldKind
  isTitleProperty: boolean
  onSelect: (kind: CustomFieldKind) => void
}

export const buildFieldKindMenuItems = (
  props: FieldKindPickerProps & {
    t: TokenTranslator
  }
): readonly MenuItem[] => (
  buildChoiceToggleItems({
    options: meta.field.kind.list.map(item => {
      const Icon = item.Icon

      return {
        id: item.id as CustomFieldKind,
        label: props.t(item.token),
        leading: <Icon className="size-4" size={16} strokeWidth={1.8} />,
        disabled: props.isTitleProperty && item.id !== 'text'
      }
    }),
    value: props.kind,
    onSelect: props.onSelect
  })
)

export const FieldKindPicker = (props: FieldKindPickerProps) => {
  const { t } = useTranslation()

  return (
    <div className="px-2 py-2">
      <Menu
        items={buildFieldKindMenuItems({
          ...props,
          t
        })}
        autoFocus={false}
      />
    </div>
  )
}
