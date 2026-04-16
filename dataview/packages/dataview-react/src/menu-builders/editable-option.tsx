import { MoreHorizontal } from 'lucide-react'
import type { MenuItemRow } from '@shared/ui/menu'
import { Button } from '@shared/ui/button'
import { meta } from '@dataview/meta'
import type { TokenTranslator } from '@shared/i18n'
import { OptionEditorPopover } from '@dataview/react/field/options'
import {
  buildOptionTagLabel,
  readOptionLabel,
  type MenuOptionLike
} from '@dataview/react/menu-builders/option'

export const buildEditableOptionItem = (input: {
  fieldId: string
  option: MenuOptionLike
  t: TokenTranslator
  open: boolean
  editing?: boolean
  variant?: 'default' | 'status'
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
  onSelect: () => void
  closeOnSelect?: boolean
}): MenuItemRow => ({
  kind: 'item',
  key: input.option.id,
  className: input.editing
    ? 'bg-hover text-fg'
    : undefined,
  label: buildOptionTagLabel(input.option, input.t, {
    variant: input.variant,
    className: 'max-w-full'
  }),
  accessory: (
    <OptionEditorPopover
      fieldId={input.fieldId}
      option={{
        ...input.option,
        color: input.option.color ?? undefined
      }}
      open={input.open}
      onOpenChange={input.onOpenChange}
      onDeleted={input.onDeleted}
      trigger={(
        <Button
          variant="plain"
          size="iconBare"
          aria-label={input.t(meta.ui.field.options.edit(readOptionLabel(input.option, input.t)))}
        >
          <MoreHorizontal className="size-4" size={16} strokeWidth={1.8} />
        </Button>
      )}
    />
  ),
  closeOnSelect: input.closeOnSelect,
  onSelect: input.onSelect
})
