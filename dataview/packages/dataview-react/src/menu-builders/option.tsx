import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import type { StatusCategory } from '@dataview/core/contracts'
import { getStatusCategoryLabel } from '@dataview/core/field'
import { meta } from '@dataview/meta'
import type { TokenTranslator } from '@shared/i18n'
import { resolveOptionDotStyle, resolveOptionColorToken } from '@shared/ui/color'
import type { MenuItem, MenuReorderItem, MenuSurfaceSize } from '@shared/ui/menu'
import { FieldOptionTag, type FieldOptionTagProps } from '@dataview/react/field/options'

export interface MenuOptionLike {
  id: string
  name: string
  color?: string | null
}

export const readOptionLabel = (
  option: Pick<MenuOptionLike, 'name'>,
  t: TokenTranslator
) => (
  option.name.trim() || t(meta.ui.field.options.untitled)
)

export const buildOptionTagLabel = (
  option: MenuOptionLike,
  t: TokenTranslator,
  input?: {
    variant?: FieldOptionTagProps['variant']
    className?: string
  }
) => (
  <FieldOptionTag
    label={readOptionLabel(option, t)}
    color={option.color ?? undefined}
    variant={input?.variant}
    className={input?.className ?? 'max-w-full'}
  />
)

export const buildOptionPanelItem = (input: {
  option: MenuOptionLike
  t: TokenTranslator
  content: () => ReactNode
  key?: string
  leading?: ReactNode
  size?: MenuSurfaceSize
  surface?: 'list' | 'panel'
  presentation?: 'cascade' | 'dropdown'
  placement?: import('@floating-ui/react').Placement
  offset?: import('@shared/ui/popover').PopoverOffset
  trailing?: ReactNode
  className?: string
  variant?: FieldOptionTagProps['variant']
  contentClassName?: string
}): MenuItem => ({
  kind: 'submenu',
  key: input.key ?? input.option.id,
  label: buildOptionTagLabel(input.option, input.t, {
    variant: input.variant,
    className: 'max-w-full'
  }),
  leading: input.leading,
  size: input.size,
  surface: input.surface,
  presentation: input.presentation,
  placement: input.placement,
  offset: input.offset,
  trailing: input.trailing,
  className: input.className,
  contentClassName: input.contentClassName,
  content: input.content
})

export const buildOptionPanelReorderItem = (input: {
  option: MenuOptionLike
  t: TokenTranslator
  content: () => ReactNode
  handleAriaLabel: string
  leading?: ReactNode
  size?: MenuSurfaceSize
  presentation?: 'cascade' | 'dropdown'
  placement?: import('@floating-ui/react').Placement
  offset?: import('@shared/ui/popover').PopoverOffset
  trailing?: ReactNode
  className?: string
  variant?: FieldOptionTagProps['variant']
  contentClassName?: string
}): MenuReorderItem => ({
  key: input.option.id,
  label: buildOptionTagLabel(input.option, input.t, {
    variant: input.variant,
    className: 'max-w-full'
  }),
  handleAriaLabel: input.handleAriaLabel,
  leading: input.leading,
  size: input.size,
  presentation: input.presentation,
  placement: input.placement,
  offset: input.offset,
  trailing: input.trailing,
  className: input.className,
  contentClassName: input.contentClassName,
  content: input.content
})

export const buildOptionColorItems = (input: {
  selectedColor?: string
  onSelect: (colorId: string) => void
  t: TokenTranslator
}): MenuItem[] => [
  {
    kind: 'label',
    key: 'color-label',
    label: input.t(meta.ui.field.options.color)
  },
  ...meta.option.color.list.map<MenuItem>(color => ({
    kind: 'action',
    key: `color-${color.id || 'default'}`,
    label: input.t(color.token),
    leading: (
      <span
        className="inline-flex h-3 w-3 shrink-0 rounded-full border"
        style={{
          ...resolveOptionDotStyle(color.id),
          borderColor: resolveOptionColorToken(color.id, 'badge-border')
        }}
      />
    ),
    trailing: input.selectedColor === color.id
      ? <Check className="size-4 text-foreground" size={16} strokeWidth={1.8} />
      : undefined,
    closeOnSelect: false,
    onSelect: () => input.onSelect(color.id)
  }))
]

export const buildStatusCategoryToggleItems = (input: {
  currentCategory?: StatusCategory
  onSelect: (category: StatusCategory) => void
  keyPrefix?: string
}): MenuItem[] => (
  ['todo', 'in_progress', 'complete'] as const
).map<MenuItem>(category => ({
  kind: 'toggle',
  key: `${input.keyPrefix ?? 'status-group'}-${category}`,
  label: getStatusCategoryLabel(category),
  checked: input.currentCategory === category,
  onSelect: () => input.onSelect(category)
}))
