import type {
  AppearanceId,
  Section
} from '@dataview/react/runtime/currentView'
import type {
  TableBlock,
  TableColumnFooterBlock,
  TableColumnHeaderBlock,
  TableRowBlock,
  TableSectionHeaderBlock
} from './types'

const pushRowBlocks = (input: {
  blocks: TableBlock[]
  rowIds: readonly AppearanceId[]
  top: number
  rowHeight: number
}) => {
  let top = input.top
  input.rowIds.forEach(rowId => {
    const block: TableRowBlock = {
      key: `row:${rowId}`,
      kind: 'row',
      top,
      height: input.rowHeight,
      rowId
    }
    input.blocks.push(block)
    top += input.rowHeight
  })
  return top
}

export const buildTableBlocks = (input: {
  grouped: boolean
  rowIds: readonly AppearanceId[]
  sections: readonly Section[]
  rowHeight: number
  headerHeight: number
}): readonly TableBlock[] => {
  const blocks: TableBlock[] = []
  let top = 0

  if (!input.grouped) {
    const scopeId = input.sections[0]?.key ?? 'root'
    const headerBlock: TableColumnHeaderBlock = {
      key: 'column-header:flat',
      kind: 'column-header',
      top,
      height: input.headerHeight,
      scopeId,
      rowIds: input.rowIds
    }
    blocks.push(headerBlock)
    top += input.headerHeight
    top = pushRowBlocks({
      blocks,
      rowIds: input.rowIds,
      top,
      rowHeight: input.rowHeight
    })
    const footerBlock: TableColumnFooterBlock = {
      key: 'column-footer:flat',
      kind: 'column-footer',
      top,
      height: input.headerHeight,
      scopeId
    }
    blocks.push(footerBlock)
    return blocks
  }

  input.sections.forEach(section => {
    const sectionHeader: TableSectionHeaderBlock = {
      key: `section-header:${section.key}`,
      kind: 'section-header',
      top,
      height: input.headerHeight,
      section
    }
    blocks.push(sectionHeader)
    top += input.headerHeight

    if (section.collapsed) {
      return
    }

    const columnHeader: TableColumnHeaderBlock = {
      key: `column-header:${section.key}`,
      kind: 'column-header',
      top,
      height: input.headerHeight,
      scopeId: section.key,
      rowIds: section.ids,
      label: `Select rows in ${section.title}`
    }
    blocks.push(columnHeader)
    top += input.headerHeight
    top = pushRowBlocks({
      blocks,
      rowIds: section.ids,
      top,
      rowHeight: input.rowHeight
    })
    const footerBlock: TableColumnFooterBlock = {
      key: `column-footer:${section.key}`,
      kind: 'column-footer',
      top,
      height: input.headerHeight,
      scopeId: section.key
    }
    blocks.push(footerBlock)
    top += input.headerHeight
  })

  return blocks
}
