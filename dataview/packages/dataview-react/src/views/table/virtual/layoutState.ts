import type { ActiveSource } from '@dataview/engine'
import type {
  ItemId,
  SectionKey
} from '@dataview/engine'
import { read, sameOrder } from '@shared/core'

export interface TableLayoutSectionState {
  key: SectionKey
  collapsed: boolean
  itemIds: readonly ItemId[]
}

export interface TableLayoutState {
  grouped: boolean
  rowCount: number
  measurementIds: readonly string[]
  sections: readonly TableLayoutSectionState[]
}

const EMPTY_ITEM_IDS = [] as readonly ItemId[]

const buildMeasurementIds = (
  grouped: boolean,
  sections: readonly TableLayoutSectionState[]
) => grouped
  ? sections.flatMap(section => (
      section.collapsed
        ? [`section-header:${section.key}`]
        : [
            `section-header:${section.key}`,
            `column-header:${section.key}`,
            ...section.itemIds.map(itemId => `row:${itemId}`),
            `create-record:${section.key}`,
            `column-footer:${section.key}`
          ]
    ))
  : sections[0]
    ? [
        `column-header:${sections[0].key}`,
        ...sections[0].itemIds.map(itemId => `row:${itemId}`),
        `create-record:${sections[0].key}`,
        `column-footer:${sections[0].key}`
      ]
    : []

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
  measurementIds: buildMeasurementIds(input.grouped, input.sections),
  sections: input.sections
})

export const readTableLayoutState = (
  source: ActiveSource
): TableLayoutState | null => {
  if (read(source.view.type) !== 'table' || !read(source.view.id)) {
    return null
  }

  const grouped = read(source.query.grouped)
  const itemIds = read(source.items.ids)
  const sectionKeys = read(source.sections.keys)
  const keys = sectionKeys.length
    ? sectionKeys
    : ['root' as SectionKey]

  const sections = grouped
    ? keys.map(key => {
        const section = read(source.sections, key)
        return {
          key,
          collapsed: section?.collapsed ?? false,
          itemIds: read(source.sections.itemIds, key) ?? EMPTY_ITEM_IDS
        } satisfies TableLayoutSectionState
      })
    : [{
        key: keys[0] ?? ('root' as SectionKey),
        collapsed: false,
        itemIds
      } satisfies TableLayoutSectionState]

  return createTableLayoutState({
    grouped,
    rowCount: itemIds.length,
    sections
  })
}

export const sameTableLayoutState = (
  left: TableLayoutState | null,
  right: TableLayoutState | null
) => left === right || (
  !!left
  && !!right
  && left.grouped === right.grouped
  && left.rowCount === right.rowCount
  && sameOrder(left.measurementIds, right.measurementIds)
  && left.sections.length === right.sections.length
  && left.sections.every((section, index) => {
    const next = right.sections[index]
    return next !== undefined
      && section.key === next.key
      && section.collapsed === next.collapsed
      && sameOrder(section.itemIds, next.itemIds)
  })
)
