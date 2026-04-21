import type {
  ItemId,
  SectionKey
} from '@dataview/engine'
import { equal } from '@shared/core'

export interface TableLayoutSectionState {
  key: SectionKey
  collapsed: boolean
  itemIds: readonly ItemId[]
}

export interface TableLayoutState {
  grouped: boolean
  rowCount: number
  sections: readonly TableLayoutSectionState[]
}

export const createTableLayoutState = (input: {
  grouped: boolean
  sections: readonly TableLayoutSectionState[]
  rowCount?: number
}): TableLayoutState => ({
  grouped: input.grouped,
  rowCount: input.rowCount ?? input.sections.reduce(
    (count, section) => count + section.itemIds.length,
    0
  ),
  sections: input.sections
})

export const sameTableLayoutState = (
  left: TableLayoutState | null,
  right: TableLayoutState | null
) => left === right || (
  !!left
  && !!right
  && left.grouped === right.grouped
  && left.rowCount === right.rowCount
  && left.sections.length === right.sections.length
  && left.sections.every((section, index) => {
    const next = right.sections[index]
    return next !== undefined
      && section.key === next.key
      && section.collapsed === next.collapsed
      && equal.sameOrder(section.itemIds, next.itemIds)
  })
)
