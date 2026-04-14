import type { RefObject } from 'react'
import type {
  ItemId,
  KanbanState,
  SectionKey
} from '@dataview/engine'
import type {
  ActiveTypedViewState,
  ItemInteractionRuntime
} from '@dataview/react/views/shared/types'

export type ActiveKanbanViewState = ActiveTypedViewState<'kanban'>

export interface KanbanSectionVisibility {
  visibleIds: readonly ItemId[]
  visibleCount: number
  hiddenCount: number
  showMoreCount: number
}

export interface KanbanViewRuntime extends ItemInteractionRuntime {
  layout: {
    columnWidth: number
    columnMinHeight: number
  }
  scrollRef: RefObject<HTMLDivElement | null>
  drag: ReturnType<typeof import('@dataview/react/views/kanban/drag').useDrag>
  visibility: {
    bySection: ReadonlyMap<SectionKey, KanbanSectionVisibility>
    showMore: (sectionKey: SectionKey) => void
  }
}

export interface KanbanRuntimeInput {
  columnWidth: number
  columnMinHeight: number
  active: ActiveKanbanViewState
  extra: KanbanState
}
