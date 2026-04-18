import type { RefObject } from 'react'
import type {
  ItemId
} from '@dataview/engine'
export type {
  ActiveTypedViewState
} from '@dataview/runtime'
import type { View } from '@dataview/core/contracts'

export interface TypedRuntimeInput<TType extends View['type'], TExtra> {
  active: import('@dataview/runtime').ActiveTypedViewState<TType>
  extra: TExtra
}

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
