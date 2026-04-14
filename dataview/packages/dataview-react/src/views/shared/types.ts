import type { RefObject } from 'react'
import type { View } from '@dataview/core/contracts'
import type {
  ItemId,
  ViewState
} from '@dataview/engine'
import type {
  VisualTargetRegistry
} from '@dataview/react/runtime/marquee'

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
  selectedIds: readonly ItemId[]
  selectedIdSet: ReadonlySet<ItemId>
  select: (id: ItemId, mode?: 'replace' | 'toggle') => void
}

export interface ItemInteractionRuntime {
  selection: SelectableItemRuntime
  marqueeActive: boolean
  visualTargets: VisualTargetRegistry
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
