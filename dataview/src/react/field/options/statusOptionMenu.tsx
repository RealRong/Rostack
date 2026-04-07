import {
  Check,
  CircleCheck,
  CircleDashed,
  CirclePlay
} from 'lucide-react'
import type { StatusCategory } from '@dataview/core/contracts'
import { meta, renderMessage } from '@dataview/meta'
import type { MenuItem } from '@ui/menu'
import { cn } from '@ui/utils'

const STATUS_CATEGORIES: readonly StatusCategory[] = [
  'todo',
  'in_progress',
  'complete'
]

export const getStatusCategoryMeta = (
  category: StatusCategory
) => {
  switch (category) {
    case 'todo':
      return {
        label: renderMessage(meta.ui.field.status.todo),
        Icon: CircleDashed,
        className: 'text-muted-foreground'
      }
    case 'in_progress':
      return {
        label: renderMessage(meta.ui.field.status.inProgress),
        Icon: CirclePlay,
        className: 'text-blue-500'
      }
    case 'complete':
    default:
      return {
        label: renderMessage(meta.ui.field.status.complete),
        Icon: CircleCheck,
        className: 'text-green-500'
      }
  }
}

export const buildStatusMoveMenuItems = (input: {
  currentCategory: StatusCategory
  onMoveCategory: (category: StatusCategory) => void
}): readonly MenuItem[] => [
  {
    kind: 'label',
    key: 'move-to-label',
    label: renderMessage(meta.ui.field.status.moveTo)
  },
  ...STATUS_CATEGORIES.map(category => {
    const info = getStatusCategoryMeta(category)
    const CategoryIcon = info.Icon

    return {
      kind: 'action' as const,
      key: `move-to-${category}`,
      label: info.label,
      leading: (
        <CategoryIcon
          className={cn('size-4 shrink-0', info.className)}
          size={16}
          strokeWidth={1.8}
        />
      ),
      trailing: input.currentCategory === category
        ? <Check className="size-4 text-foreground" size={16} strokeWidth={1.8} />
        : undefined,
      closeOnSelect: false,
      onSelect: () => {
        input.onMoveCategory(category)
      }
    }
  })
]

export const buildStatusIdsAfterCategoryMove = (
  sections: readonly {
    category: StatusCategory
    options: readonly {
      id: string
    }[]
  }[],
  optionId: string,
  from: StatusCategory,
  to: StatusCategory
) => sections.flatMap(section => {
  const ids = section.options
    .map(option => option.id)
    .filter(id => id !== optionId)

  if (section.category === to) {
    return [...ids, optionId]
  }

  if (section.category === from) {
    return ids
  }

  return ids
})
