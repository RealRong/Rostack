import type { RefObject } from 'react'
import type {
  ItemId,
  KanbanState,
  SectionKey
} from '@dataview/engine'
import type {
  ActiveTypedViewState,
  ItemInteractionRuntime,
  TypedRuntimeInput
} from '@dataview/react/views/shared/types'
import type {
  DataViewKanbanModel,
  KanbanBoardBase,
  KanbanSectionBase
} from '@dataview/runtime'
import type {
  KeyedReadStore,
  ReadStore
} from '@shared/core'

export type {
  KanbanCardData,
  KanbanSectionBase
} from '@dataview/runtime'

export type ActiveKanbanViewState = ActiveTypedViewState<'kanban'>

export interface KanbanSectionVisibility {
  visibleIds: readonly ItemId[]
  visibleCount: number
  hiddenCount: number
  showMoreCount: number
}

export interface KanbanBoard extends KanbanBoardBase {
  columnWidth: number
  columnMinHeight: number
}

export interface KanbanSectionData extends KanbanSectionBase {
  visibleIds: readonly ItemId[]
  visibleCount: number
  hiddenCount: number
  showMoreCount: number
}

export interface KanbanViewRuntime extends ItemInteractionRuntime {
  board: ReadStore<KanbanBoard>
  section: KeyedReadStore<SectionKey, KanbanSectionData | undefined>
  card: DataViewKanbanModel['card']
  content: DataViewKanbanModel['content']
  layout: {
    columnWidth: number
    columnMinHeight: number
  }
  geometry: {
    measureCard: (id: ItemId) => (node: HTMLElement | null) => void
    measureBody: (sectionKey: SectionKey) => (node: HTMLDivElement | null) => void
  }
  scrollRef: RefObject<HTMLDivElement | null>
  drag: ReturnType<typeof import('@dataview/react/views/kanban/drag').useDrag>
  visibility: {
    bySection: ReadonlyMap<SectionKey, KanbanSectionVisibility>
    showMore: (sectionKey: SectionKey) => void
  }
}

export type KanbanRuntimeInput = TypedRuntimeInput<'kanban', KanbanState> & {
  columnWidth: number
  columnMinHeight: number
}
