import type { ReactNode } from 'react'
import type { Placement } from '@floating-ui/react'
import type { MenuItem, MenuSurfaceSize } from '@ui/menu'

export interface ChoiceOption<TValue extends string> {
  id: TValue
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  disabled?: boolean
}

export const buildChoiceToggleItems = <TValue extends string>(input: {
  options: readonly ChoiceOption<TValue>[]
  value?: TValue
  onSelect: (value: TValue) => void
  indicator?: 'check' | 'switch'
  closeOnSelect?: boolean
}) => input.options.map<MenuItem>(option => ({
  kind: 'toggle',
  key: option.id,
  label: option.label,
  leading: option.leading,
  suffix: option.suffix,
  checked: input.value === option.id,
  disabled: option.disabled,
  indicator: input.indicator,
  closeOnSelect: input.closeOnSelect,
  onSelect: () => input.onSelect(option.id)
}))

export const buildChoiceSubmenuItem = <TValue extends string>(input: {
  key: string
  label: ReactNode
  suffix?: ReactNode
  leading?: ReactNode
  value?: TValue
  options: readonly ChoiceOption<TValue>[]
  onSelect: (value: TValue) => void
  size?: MenuSurfaceSize
  presentation?: 'cascade' | 'dropdown'
  placement?: Placement
  closeOnSelect?: boolean
}): MenuItem => ({
  kind: 'submenu',
  key: input.key,
  label: input.label,
  leading: input.leading,
  suffix: input.suffix,
  size: input.size ?? 'md',
  ...(input.presentation ? { presentation: input.presentation } : {}),
  ...(input.placement ? { placement: input.placement } : {}),
  items: buildChoiceToggleItems({
    options: input.options,
    value: input.value,
    onSelect: input.onSelect,
    closeOnSelect: input.closeOnSelect
  })
})
