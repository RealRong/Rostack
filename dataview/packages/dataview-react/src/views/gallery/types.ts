import type { RefObject } from 'react'
import type {
  ItemId
} from '@dataview/engine'
import type { GalleryDropTarget } from '@dataview/react/views/gallery/reorder'
import type {
  GalleryBlock,
  GalleryLayoutCache
} from '@dataview/react/views/gallery/virtual'
import type {
  ItemInteractionRuntime
} from '@dataview/react/views/shared/types'
import type {
  DataViewGalleryModel,
  GalleryBody as GalleryBodyModel,
  GalleryCard,
  GallerySection
} from '@dataview/runtime'
import type { ReadStore } from '@shared/core'

export type {
  GalleryCard,
  GallerySection
} from '@dataview/runtime'

export interface GalleryBody extends GalleryBodyModel {
  blocks: readonly GalleryBlock[]
  totalHeight: number
  columnCount: number
}

export interface GalleryViewRuntime extends ItemInteractionRuntime {
  body: ReadStore<GalleryBody>
  section: DataViewGalleryModel['section']
  card: DataViewGalleryModel['card']
  content: DataViewGalleryModel['content']
  containerRef: RefObject<HTMLDivElement | null>
  virtual: {
    layout: GalleryLayoutCache
    blocks: readonly GalleryBlock[]
    measure: (id: ItemId) => (node: HTMLElement | null) => void
  }
  drag: ReturnType<typeof import('@dataview/react/views/gallery/reorder').useCardReorder>
  indicator?: GalleryDropTarget['indicator']
}
