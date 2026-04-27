import type { ReactNode } from 'react'
import type { Field } from '@dataview/core/types'
import { meta } from '@dataview/meta'
import type { MenuItem, MenuReorderItem } from '@shared/ui/menu'

const buildFieldContent = (field: Field, input?: {
  label?: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
}) => {
  const kind = meta.field.kind.get(field.kind)
  const Icon = kind.Icon

  return {
    label: input?.label ?? field.name,
    leading: input?.leading ?? <Icon className="size-4 shrink-0" size={16} strokeWidth={1.8} />,
    ...(input?.suffix !== undefined ? { suffix: input.suffix } : {})
  }
}

export const buildFieldToggleItem = (field: Field, input: {
  checked: boolean
  onSelect: () => void
  key?: string
  suffix?: ReactNode
  disabled?: boolean
  accessory?: ReactNode
  className?: string
}): MenuItem => ({
  kind: 'toggle',
  key: input.key ?? field.id,
  ...buildFieldContent(field, {
    suffix: input.suffix
  }),
  checked: input.checked,
  disabled: input.disabled,
  accessory: input.accessory,
  className: input.className,
  onSelect: input.onSelect
})

export const buildFieldActionItem = (field: Field, input: {
  onSelect: () => void
  key?: string
  suffix?: ReactNode
  disabled?: boolean
  accessory?: ReactNode
  trailing?: ReactNode
  className?: string
}): MenuItem => ({
  kind: 'action',
  key: input.key ?? field.id,
  ...buildFieldContent(field, {
    suffix: input.suffix
  }),
  disabled: input.disabled,
  accessory: input.accessory,
  trailing: input.trailing,
  className: input.className,
  onSelect: input.onSelect
})

export const buildFieldReorderItem = (field: Field, input: {
  handleAriaLabel: string
  onSelect: () => void
  key?: string
  suffix?: ReactNode
  disabled?: boolean
  accessory?: ReactNode
  trailing?: ReactNode
  className?: string
}): MenuReorderItem => ({
  key: input.key ?? field.id,
  ...buildFieldContent(field, {
    suffix: input.suffix
  }),
  handleAriaLabel: input.handleAriaLabel,
  disabled: input.disabled,
  accessory: input.accessory,
  trailing: input.trailing,
  className: input.className,
  onSelect: input.onSelect
})
