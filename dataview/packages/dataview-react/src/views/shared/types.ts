import type { RefObject } from 'react'
import type {
  ItemId
} from '@dataview/engine'

export interface SelectableItemRuntime {
  getSelectedIds: () => readonly ItemId[]
  isSelected: (id: ItemId) => boolean
  select: (id: ItemId, mode?: 'replace' | 'add' | 'toggle') => void
}

export interface ItemInteractionRuntime {
  selection: SelectableItemRuntime
  marqueeActive: boolean
}

export interface ScrollContainerRuntime {
  containerRef: RefObject<HTMLDivElement | null>
}
