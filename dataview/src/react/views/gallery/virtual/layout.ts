import type {
  AppearanceId,
  Section
} from '@dataview/engine/project'
import {
  resolveAutoFillGridMetrics
} from '@dataview/react/virtual'
import type {
  GalleryBlock,
  GalleryCardLayout,
  GalleryLayoutCache,
  GalleryRowBlock,
  GalleryRowLayout,
  GallerySectionEmptyBlock,
  GallerySectionHeaderBlock
} from './types'

export const GALLERY_CARD_MIN_WIDTH = {
  sm: 220,
  md: 260,
  lg: 300
} as const

export const GALLERY_CARD_GAP = 16
export const GALLERY_CARD_ESTIMATED_HEIGHT = 132
export const GALLERY_SECTION_GAP = 24
export const GALLERY_SECTION_HEADER_HEIGHT = 24
export const GALLERY_SECTION_HEADER_GAP = 12
export const GALLERY_SECTION_EMPTY_HEIGHT = 96

const chunkIds = (
  ids: readonly AppearanceId[],
  size: number
) => {
  const rows: AppearanceId[][] = []
  for (let index = 0; index < ids.length; index += size) {
    rows.push(ids.slice(index, index + size))
  }
  return rows
}

const rowHeight = (input: {
  ids: readonly AppearanceId[]
  estimatedHeight: number
  heightById: ReadonlyMap<AppearanceId, number>
}) => Math.max(
  ...input.ids.map(id => input.heightById.get(id) ?? input.estimatedHeight)
)

export const resolveGalleryGridMetrics = (input: {
  containerWidth: number
  contentInsetLeft: number
  contentInsetRight: number
  minCardWidth: number
  gap?: number
}) => {
  const gap = input.gap ?? GALLERY_CARD_GAP
  const grid = resolveAutoFillGridMetrics({
    containerWidth: input.containerWidth,
    minItemWidth: input.minCardWidth,
    gap,
    insetLeft: input.contentInsetLeft,
    insetRight: input.contentInsetRight
  })

  return {
    contentWidth: grid.contentWidth,
    columnCount: grid.columnCount,
    cardWidth: grid.itemWidth
  }
}

export const buildGalleryLayout = (input: {
  grouped: boolean
  sections: readonly Section[]
  containerWidth: number
  contentInsetLeft: number
  contentInsetRight: number
  minCardWidth: number
  gap?: number
  estimatedHeight?: number
  heightById: ReadonlyMap<AppearanceId, number>
}): GalleryLayoutCache => {
  const gap = input.gap ?? GALLERY_CARD_GAP
  const estimatedHeight = input.estimatedHeight ?? GALLERY_CARD_ESTIMATED_HEIGHT
  const {
    columnCount,
    cardWidth
  } = resolveGalleryGridMetrics({
    containerWidth: input.containerWidth,
    contentInsetLeft: input.contentInsetLeft,
    contentInsetRight: input.contentInsetRight,
    minCardWidth: input.minCardWidth,
    gap
  })
  const rows: GalleryRowLayout[] = []
  const cards: GalleryCardLayout[] = []
  const blocks: GalleryBlock[] = []
  let top = 0

  input.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) {
      top += GALLERY_SECTION_GAP
    }

    if (input.grouped) {
      const headerBlock: GallerySectionHeaderBlock = {
        key: `section-header:${section.key}`,
        kind: 'section-header',
        top,
        height: GALLERY_SECTION_HEADER_HEIGHT,
        section: {
          key: section.key,
          title: section.title,
          color: section.color
        }
      }
      blocks.push(headerBlock)
      top += GALLERY_SECTION_HEADER_HEIGHT
      top += GALLERY_SECTION_HEADER_GAP
    }

    if (section.collapsed) {
      return
    }

    if (!section.appearanceIds.length) {
      if (!input.grouped) {
        return
      }

      const emptyBlock: GallerySectionEmptyBlock = {
        key: `section-empty:${section.key}`,
        kind: 'section-empty',
        top,
        height: GALLERY_SECTION_EMPTY_HEIGHT,
        section: {
          key: section.key,
          title: section.title
        }
      }
      blocks.push(emptyBlock)
      top += GALLERY_SECTION_EMPTY_HEIGHT
      return
    }

    const sectionRows = chunkIds(section.appearanceIds, columnCount)
    sectionRows.forEach((rowIds, rowIndex) => {
      const height = rowHeight({
        ids: rowIds,
        estimatedHeight,
        heightById: input.heightById
      })
      const row: GalleryRowLayout = {
        sectionKey: section.key,
        rowIndex,
        top,
        height,
        ids: rowIds
      }
      rows.push(row)
      const rowBlock: GalleryRowBlock = {
        key: `row:${section.key}:${rowIndex}`,
        kind: 'row',
        top,
        height,
        row
      }
      blocks.push(rowBlock)

      rowIds.forEach((id, columnIndex) => {
        const cardHeight = input.heightById.get(id) ?? estimatedHeight
        const left = input.contentInsetLeft + columnIndex * (cardWidth + gap)
        cards.push({
          id,
          sectionKey: section.key,
          rowIndex,
          columnIndex,
          rect: {
            left,
            top,
            right: left + cardWidth,
            bottom: top + cardHeight,
            width: cardWidth,
            height: cardHeight
          }
        })
      })

      top += height
      if (rowIndex < sectionRows.length - 1) {
        top += gap
      }
    })
  })

  return {
    blocks,
    rows,
    cards,
    totalHeight: top,
    columnCount,
    cardWidth
  }
}
