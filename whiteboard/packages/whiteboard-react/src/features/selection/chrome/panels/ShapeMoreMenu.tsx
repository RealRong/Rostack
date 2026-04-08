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
    kind: 'label' as const,
    key: `${section.key}:title`,
    label: (
      <span className="block px-1.5 text-[11px] font-semibold uppercase tracking-[0.02em] text-fg-muted">
        {section.title}
      </span>
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
