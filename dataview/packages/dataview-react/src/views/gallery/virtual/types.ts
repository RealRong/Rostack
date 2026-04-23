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
  sectionId: Section['id']
  rowIndex: number
  top: number
  height: number
  ids: readonly ItemId[]
}

export interface GalleryCardLayout {
  id: ItemId
  sectionId: Section['id']
  rowIndex: number
  columnIndex: number
  rect: Rect
}

export interface GallerySectionHeaderBlock extends VirtualBlock {
  kind: 'section-header'
  section: Pick<Section, 'id' | 'label' | 'color'>
}

export interface GalleryRowBlock extends VirtualBlock {
  kind: 'row'
  row: GalleryRowLayout
}

export interface GallerySectionEmptyBlock extends VirtualBlock {
  kind: 'section-empty'
  section: Pick<Section, 'id' | 'label'>
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
