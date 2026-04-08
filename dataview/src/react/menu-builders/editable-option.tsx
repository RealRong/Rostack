import { MoreHorizontal } from 'lucide-react'
import type { MenuItemRow } from '@ui/menu'
import { Button } from '@ui/button'
import { meta, renderMessage } from '@dataview/meta'
import { OptionEditorPopover } from '@dataview/react/field/options'
import {
  buildOptionTagLabel,
  readOptionLabel,
  type MenuOptionLike
} from './option'

export const buildEditableOptionItem = (input: {
  fieldId: string
  option: MenuOptionLike
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
  label: buildOptionTagLabel(input.option, {
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
          aria-label={renderMessage(meta.ui.field.options.edit(readOptionLabel(input.option)))}
        >
          <MoreHorizontal className="size-4" size={16} strokeWidth={1.8} />
        </Button>
      )}
    />
  ),
  closeOnSelect: input.closeOnSelect,
  onSelect: input.onSelect
})
