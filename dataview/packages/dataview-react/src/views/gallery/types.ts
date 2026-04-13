import type { RefObject } from 'react'
import type { View } from '@dataview/core/contracts'
import type {
  GalleryState,
  ItemId,
  ViewState
} from '@dataview/engine'
import type { VisualTargetRegistry } from '#dataview-react/runtime/marquee'
import type { GalleryDropTarget } from '#dataview-react/views/gallery/reorder'
import type {
  GalleryBlock,
  GalleryLayoutCache
} from '#dataview-react/views/gallery/virtual'

export type ActiveGalleryViewState = ViewState & {
  view: View & {
    type: 'gallery'
  }
}

export interface GalleryViewRuntime {
  containerRef: RefObject<HTMLDivElement | null>
  virtual: {
    layout: GalleryLayoutCache
    blocks: readonly GalleryBlock[]
    measure: (id: ItemId) => (node: HTMLElement | null) => void
  }
  selection: {
    selectedIdSet: ReadonlySet<ItemId>
    select: (id: ItemId, mode?: 'replace' | 'toggle') => void
  }
  drag: ReturnType<typeof import('#dataview-react/views/gallery/reorder').useCardReorder>
  indicator?: GalleryDropTarget['indicator']
  marqueeActive: boolean
  visualTargets: VisualTargetRegistry
}

export interface GalleryRuntimeInput {
  active: ActiveGalleryViewState
  extra: GalleryState
}
