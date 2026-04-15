import type {
  ItemId,
  Section
} from '@dataview/engine'
import type {
  TableBlock,
  TableColumnFooterBlock,
  TableColumnHeaderBlock,
  TableRowBlock,
  TableSectionHeaderBlock
} from '@dataview/react/views/table/virtual/types'

const pushRowBlocks = (input: {
  blocks: TableBlock[]
  rowIds: readonly ItemId[]
  top: number
  rowHeight: number
  blockHeights?: ReadonlyMap<string, number>
}) => {
  let top = input.top
  input.rowIds.forEach(rowId => {
    const key = `row:${rowId}`
    const measuredHeight = input.blockHeights?.get(key)
    const block: TableRowBlock = {
      key,
      kind: 'row',
      top,
      height: measuredHeight ?? input.rowHeight,
      estimatedHeight: input.rowHeight,
      measuredHeight,
      rowId
    }
    input.blocks.push(block)
    top += block.height
  })
  return top
}

export const buildTableBlocks = (input: {
  grouped: boolean
  rowIds: readonly ItemId[]
  sections: readonly Section[]
  rowHeight: number
  headerHeight: number
  blockHeights?: ReadonlyMap<string, number>
}): readonly TableBlock[] => {
  const blocks: TableBlock[] = []
  let top = 0

  if (!input.grouped) {
    const scopeId = input.sections[0]?.key ?? 'root'
    const headerKey = 'column-header:flat'
    const headerMeasuredHeight = input.blockHeights?.get(headerKey)
    const headerBlock: TableColumnHeaderBlock = {
      key: headerKey,
      kind: 'column-header',
      top,
      height: headerMeasuredHeight ?? input.headerHeight,
      estimatedHeight: input.headerHeight,
      measuredHeight: headerMeasuredHeight,
      scopeId,
      rowIds: input.rowIds
    }
    blocks.push(headerBlock)
    top += headerBlock.height
    top = pushRowBlocks({
      blocks,
      rowIds: input.rowIds,
      top,
      rowHeight: input.rowHeight,
      blockHeights: input.blockHeights
    })
    const footerKey = 'column-footer:flat'
    const footerMeasuredHeight = input.blockHeights?.get(footerKey)
    const footerBlock: TableColumnFooterBlock = {
      key: footerKey,
      kind: 'column-footer',
      top,
      height: footerMeasuredHeight ?? input.headerHeight,
      estimatedHeight: input.headerHeight,
      measuredHeight: footerMeasuredHeight,
      scopeId
    }
    blocks.push(footerBlock)
    return blocks
  }

  input.sections.forEach(section => {
    const sectionKey = `section-header:${section.key}`
    const sectionMeasuredHeight = input.blockHeights?.get(sectionKey)
    const sectionHeader: TableSectionHeaderBlock = {
      key: sectionKey,
      kind: 'section-header',
      top,
      height: sectionMeasuredHeight ?? input.headerHeight,
      estimatedHeight: input.headerHeight,
      measuredHeight: sectionMeasuredHeight,
      section
    }
    blocks.push(sectionHeader)
    top += sectionHeader.height

    if (section.collapsed) {
      return
    }

    const headerKey = `column-header:${section.key}`
    const headerMeasuredHeight = input.blockHeights?.get(headerKey)
    const columnHeader: TableColumnHeaderBlock = {
      key: headerKey,
      kind: 'column-header',
      top,
      height: headerMeasuredHeight ?? input.headerHeight,
      estimatedHeight: input.headerHeight,
      measuredHeight: headerMeasuredHeight,
      scopeId: section.key,
      rowIds: section.itemIds,
      label: `Select rows in ${section.title}`
    }
    blocks.push(columnHeader)
    top += columnHeader.height
    top = pushRowBlocks({
      blocks,
      rowIds: section.itemIds,
      top,
      rowHeight: input.rowHeight,
      blockHeights: input.blockHeights
    })
    const footerKey = `column-footer:${section.key}`
    const footerMeasuredHeight = input.blockHeights?.get(footerKey)
    const footerBlock: TableColumnFooterBlock = {
      key: footerKey,
      kind: 'column-footer',
      top,
      height: footerMeasuredHeight ?? input.headerHeight,
      estimatedHeight: input.headerHeight,
      measuredHeight: footerMeasuredHeight,
      scopeId: section.key
    }
    blocks.push(footerBlock)
    top += footerBlock.height
  })

  return blocks
}
