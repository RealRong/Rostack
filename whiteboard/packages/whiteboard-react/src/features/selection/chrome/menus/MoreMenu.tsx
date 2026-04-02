import {
  MenuItem,
  MenuList,
  MenuSection
} from './MenuPrimitives'
import {
  SelectionSummaryHeader,
  SelectionTypeFilterStrip
} from '../../../node/components/SelectionSummaryHeader'
import type { NodeSummary } from '../../../node/summary'
import type {
  SelectionFilterView,
  SelectionMoreMenuSectionView
} from '../../../node/selection'

export const MoreMenu = ({
  sections,
  summary,
  filter
}: {
  sections: readonly SelectionMoreMenuSectionView[]
  summary?: NodeSummary
  filter?: SelectionFilterView
}) => (
  <>
    {summary ? (
      <SelectionSummaryHeader summary={summary} />
    ) : null}
    {filter?.types.length ? (
      <MenuSection title="Filter">
        <SelectionTypeFilterStrip
          types={filter.types}
          onSelect={filter.onSelect}
        />
      </MenuSection>
    ) : null}
    {sections.map((section) => (
      <MenuSection key={section.key} title={section.title}>
        <MenuList>
          {section.items.map((item) => (
            <MenuItem
              key={item.key}
              disabled={item.disabled}
              tone={item.tone}
              onClick={item.onSelect}
            >
              {item.label}
            </MenuItem>
          ))}
        </MenuList>
      </MenuSection>
    ))}
  </>
)
