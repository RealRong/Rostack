import type { RefObject } from 'react'
import type { View } from '@dataview/core/contracts'
import type {
  ItemId,
  KanbanState,
  SectionKey,
  ViewState
} from '@dataview/engine'
import type { VisualTargetRegistry } from '#dataview-react/runtime/marquee'

export type ActiveKanbanViewState = ViewState & {
  view: View & {
    type: 'kanban'
  }
}

export interface KanbanSectionVisibility {
  visibleIds: readonly ItemId[]
  visibleCount: number
  hiddenCount: number
  showMoreCount: number
}

export interface KanbanViewRuntime {
  layout: {
    columnWidth: number
    columnMinHeight: number
  }
  scrollRef: RefObject<HTMLDivElement | null>
  selection: {
    selectedIdSet: ReadonlySet<ItemId>
    select: (id: ItemId, mode?: 'replace' | 'toggle') => void
  }
  drag: ReturnType<typeof import('#dataview-react/views/kanban/drag').useDrag>
  marqueeActive: boolean
  visualTargets: VisualTargetRegistry
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
