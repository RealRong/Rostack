import type { RefObject } from 'react'
import type {
  ItemId,
  SectionKey
} from '@dataview/engine'
import type {
  ItemInteractionRuntime
} from '@dataview/react/views/shared/types'
import type {
  DataViewKanbanModel,
  KanbanBoard as KanbanBoardModel,
  KanbanCard,
  KanbanSection
} from '@dataview/runtime'
import type {
  KeyedReadStore,
  ReadStore
} from '@shared/core'

export type {
  KanbanCard,
  KanbanSection
} from '@dataview/runtime'

export interface KanbanSectionVisibility {
  visibleIds: readonly ItemId[]
  visibleCount: number
  hiddenCount: number
  showMoreCount: number
}

export interface KanbanBoard extends KanbanBoardModel {
  columnWidth: number
  columnMinHeight: number
}

export interface KanbanSectionData extends KanbanSection {
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
