import type {
  Rect
} from '@shared/dom'
import type {
  ItemId,
  Section
} from '@dataview/engine'
import type {
  VirtualBlock
} from '@dataview/react/virtual'

export interface GalleryRowLayout {
  sectionKey: Section['key']
  rowIndex: number
  top: number
  height: number
  ids: readonly ItemId[]
}

export interface GalleryCardLayout {
  id: ItemId
  sectionKey: Section['key']
  rowIndex: number
  columnIndex: number
  rect: Rect
}

export interface GallerySectionHeaderBlock extends VirtualBlock {
  kind: 'section-header'
  section: Pick<Section, 'key' | 'label' | 'color'>
}

export interface GalleryRowBlock extends VirtualBlock {
  kind: 'row'
  row: GalleryRowLayout
}

export interface GallerySectionEmptyBlock extends VirtualBlock {
  kind: 'section-empty'
  section: Pick<Section, 'key' | 'label'>
}

export type GalleryBlock =
  | GallerySectionHeaderBlock
  | GalleryRowBlock
  | GallerySectionEmptyBlock

export interface GalleryLayoutCache {
  blocks: readonly GalleryBlock[]
  rows: readonly GalleryRowLayout[]
  cards: readonly GalleryCardLayout[]
  totalHeight: number
  columnCount: number
  cardWidth: number
}
