import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { MenuItem } from '@shared/ui/menu'

export const buildNavigationItem = (input: {
  key: string
  label: ReactNode
  onSelect: () => void
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  disabled?: boolean
}): MenuItem => ({
  kind: 'action',
  key: input.key,
  label: input.label,
  leading: input.leading,
  suffix: input.suffix,
  trailing: input.trailing ?? (
    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" size={14} strokeWidth={2} />
  ),
  disabled: input.disabled,
  onSelect: input.onSelect
})
