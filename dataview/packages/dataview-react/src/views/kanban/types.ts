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
} from '@dataview/runtime/model'
import type {
  KeyedReadStore,
  ReadStore
} from '@shared/core'
import type { Rect } from '@shared/dom'
import type { BoardLayout } from '@dataview/react/views/kanban/drag'

export type {
  KanbanCard,
  KanbanSection
} from '@dataview/runtime/model'

export interface KanbanVisibility {
  ids: readonly ItemId[]
  visible: number
  hidden: number
  more: number
}

export interface KanbanBoard extends KanbanBoardModel {
  columnWidth: number
  columnMinHeight: number
}

export interface KanbanViewRuntime extends ItemInteractionRuntime {
  board: ReadStore<KanbanBoard>
  section: KeyedReadStore<SectionKey, KanbanSection | undefined>
  card: DataViewKanbanModel['card']
  content: DataViewKanbanModel['content']
  layout: {
    columnWidth: number
    columnMinHeight: number
    board: ReadStore<BoardLayout | null>
    body: KeyedReadStore<SectionKey, Rect | undefined>
    measure: {
      card: (id: ItemId) => (node: HTMLElement | null) => void
      body: (sectionKey: SectionKey) => (node: HTMLDivElement | null) => void
    }
  }
  scrollRef: RefObject<HTMLDivElement | null>
  drag: ReturnType<typeof import('@dataview/react/views/kanban/drag').useDrag>
  visibility: {
    section: KeyedReadStore<SectionKey, KanbanVisibility | undefined>
    showMore: (sectionKey: SectionKey) => void
    reset: () => void
  }
}
