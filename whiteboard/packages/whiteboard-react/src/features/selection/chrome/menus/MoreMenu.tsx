import {
  Menu,
  type MenuItem
} from '@ui'
import {
  SelectionSummaryHeader,
  SelectionTypeFilterStrip
} from '../../../node/components/SelectionSummaryHeader'
import type { NodeSummary } from '../../../node/summary'
import type {
  SelectionFilterView,
  SelectionMoreMenuSectionView
} from '../../../node/selection'

const MENU_SECTION_TITLE_CLASSNAME = 'px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.02em] text-fg-muted'

const buildMoreMenuItems = (
  sections: readonly SelectionMoreMenuSectionView[]
): readonly MenuItem[] => {
  const items: MenuItem[] = []

  sections.forEach((section, index) => {
    if (index > 0) {
      items.push({
        kind: 'divider',
        key: `divider:${section.key}`
      })
    }

    items.push({
      kind: 'custom',
      key: `title:${section.key}`,
      render: () => (
        <div className={MENU_SECTION_TITLE_CLASSNAME}>
          {section.title}
        </div>
      )
    })

    section.items.forEach((item) => {
      items.push({
        kind: 'action',
        key: item.key,
        label: item.label,
        disabled: item.disabled,
        tone: item.tone === 'danger'
          ? 'destructive'
          : 'default',
        closeOnSelect: false,
        onSelect: item.onSelect
      })
    })
  })

  return items
}

export const MoreMenu = ({
  sections,
  summary,
  filter
}: {
  sections: readonly SelectionMoreMenuSectionView[]
  summary?: NodeSummary
  filter?: SelectionFilterView
}) => {
  const items = buildMoreMenuItems(sections)

  return (
    <div className="flex w-[220px] flex-col gap-2 p-1">
      {summary ? (
        <SelectionSummaryHeader summary={summary} />
      ) : null}
      {filter?.types.length ? (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-subtle px-2 py-2">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.02em] text-fg-muted">
            Filter
          </div>
          <SelectionTypeFilterStrip
            types={filter.types}
            onSelect={filter.onSelect}
          />
        </div>
      ) : null}
      {items.length ? (
        <Menu
          items={items}
          autoFocus
        />
      ) : null}
    </div>
  )
}
