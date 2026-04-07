import type { MenuItem } from '@ui'
import { Menu } from '@ui'
import type { SelectionMoreMenuSectionView } from '../../../node/selection'

const toMenuItems = (
  sections: readonly SelectionMoreMenuSectionView[]
): MenuItem[] => sections.flatMap((section, sectionIndex) => ([
  ...(sectionIndex > 0
    ? [{
        kind: 'divider' as const,
        key: `${section.key}:divider`
      }]
    : []),
  {
    kind: 'custom' as const,
    key: `${section.key}:title`,
    render: () => (
      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.02em] text-fg-muted">
        {section.title}
      </div>
    )
  },
  ...section.items.map((item) => ({
    kind: 'action' as const,
    key: item.key,
    label: item.label,
    disabled: item.disabled,
    tone: item.tone === 'danger'
      ? 'destructive' as const
      : 'default' as const,
    onSelect: item.onSelect
  }))
]))

export const ShapeMoreMenu = ({
  sections,
  onClose
}: {
  sections: readonly SelectionMoreMenuSectionView[]
  onClose: () => void
}) => (
  <Menu
    items={toMenuItems(sections)}
    onClose={onClose}
    autoFocus
  />
)
