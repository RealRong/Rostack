import type { RefObject } from 'react'
import type { View } from '@dataview/core/contracts'
import type {
  GalleryState,
  ItemId,
  ViewState
} from '@dataview/engine'
import type { VisualTargetRegistry } from '#react/runtime/marquee'
import type { GalleryDropTarget } from './reorder'
import type {
  GalleryBlock,
  GalleryLayoutCache
} from './virtual'

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
  drag: ReturnType<typeof import('./reorder').useCardReorder>
  indicator?: GalleryDropTarget['indicator']
  marqueeActive: boolean
  visualTargets: VisualTargetRegistry
}

export interface GalleryRuntimeInput {
  active: ActiveGalleryViewState
  extra: GalleryState
}
