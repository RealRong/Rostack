import type { RefObject } from 'react'
import type { View } from '@dataview/core/contracts'
import type {
  ItemId,
  ViewState
} from '@dataview/engine'

export type ActiveTypedViewState<TType extends View['type']> = ViewState & {
  view: View & {
    type: TType
  }
}

export interface TypedRuntimeInput<TType extends View['type'], TExtra> {
  active: ActiveTypedViewState<TType>
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

export const readActiveTypedViewState = <TType extends View['type']>(
  type: TType
) => (
  state: ViewState | undefined
): ActiveTypedViewState<TType> | undefined => (
  state?.view.type === type
    ? state as ActiveTypedViewState<TType>
    : undefined
)
