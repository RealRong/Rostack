import type { RefObject } from 'react'
import type {
  ItemId,
  Section,
  SectionId
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
import { store } from '@shared/core'
import type { Rect } from '@shared/dom'
import type { BoardLayout } from '@dataview/react/views/kanban/drag'

export type {
  KanbanCard,
  KanbanSection
} from '@dataview/runtime'

export interface KanbanVisibility {
  ids: readonly ItemId[]
  visible: number
  hidden: number
  more: number
}

export interface KanbanBoard extends KanbanBoardModel {
  sections: readonly Section[]
  columnWidth: number
  columnMinHeight: number
}

export interface KanbanViewRuntime extends ItemInteractionRuntime {
  board: store.ReadStore<KanbanBoard>
  section: store.KeyedReadStore<SectionId, KanbanSection | undefined>
  card: DataViewKanbanModel['card']
  content: DataViewKanbanModel['content']
  layout: {
    columnWidth: number
    columnMinHeight: number
    board: store.ReadStore<BoardLayout | null>
    body: store.KeyedReadStore<SectionId, Rect | undefined>
    measure: {
      card: (id: ItemId) => (node: HTMLElement | null) => void
      body: (sectionId: SectionId) => (node: HTMLDivElement | null) => void
    }
  }
  scrollRef: RefObject<HTMLDivElement | null>
  drag: ReturnType<typeof import('@dataview/react/views/kanban/drag').useDrag>
  visibility: {
    section: store.KeyedReadStore<SectionId, KanbanVisibility | undefined>
    showMore: (sectionId: SectionId) => void
    reset: () => void
  }
}
