import type { RefObject } from 'react'
import type {
  GalleryState,
  ItemId
} from '@dataview/engine'
import type { GalleryDropTarget } from '@dataview/react/views/gallery/reorder'
import type {
  GalleryBlock,
  GalleryLayoutCache
} from '@dataview/react/views/gallery/virtual'
import type {
  ActiveTypedViewState,
  ItemInteractionRuntime
} from '@dataview/react/views/shared/types'

export type ActiveGalleryViewState = ActiveTypedViewState<'gallery'>

export interface GalleryViewRuntime extends ItemInteractionRuntime {
  containerRef: RefObject<HTMLDivElement | null>
  virtual: {
    layout: GalleryLayoutCache
    blocks: readonly GalleryBlock[]
    measure: (id: ItemId) => (node: HTMLElement | null) => void
  }
  drag: ReturnType<typeof import('@dataview/react/views/gallery/reorder').useCardReorder>
  indicator?: GalleryDropTarget['indicator']
}

export interface GalleryRuntimeInput {
  active: ActiveGalleryViewState
  extra: GalleryState
}
