import {
  useEffect,
  useMemo,
  useRef
} from 'react'
import type {
  Section
} from '@dataview/engine'
import {
  useDataView
} from '@dataview/react/dataview'
import { store } from '@shared/core'
import {
  useStoreValue
} from '@shared/react'
import {
  rectIn
} from '@shared/dom'
import {
  hitTestBoardLayout
} from '@dataview/react/views/kanban/drag'
import {
  useDrag
} from '@dataview/react/views/kanban/drag'
import type {
  KanbanBoard,
  KanbanViewRuntime
} from '@dataview/react/views/kanban/types'
import {
  useItemDragRuntime,
  useRegisterMarqueeScene
} from '@dataview/react/views/shared/interactionRuntime'
import type { MarqueeScene } from '@dataview/react/page/marqueeBridge'
import {
  useKanbanLayout
} from '@dataview/react/views/kanban/runtime/layout'
import {
  useKanbanVisibility
} from '@dataview/react/views/kanban/runtime/visibility'

const EMPTY_SECTIONS = [] as readonly Section[]

const sameBoard = (
  left: KanbanBoard,
  right: KanbanBoard
) => left.viewId === right.viewId
  && left.grouped === right.grouped
  && left.sections === right.sections
  && left.groupField === right.groupField
  && left.columnWidth === right.columnWidth
  && left.columnMinHeight === right.columnMinHeight
  && left.fillColumnColor === right.fillColumnColor
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.cardsPerColumn === right.cardsPerColumn
  && left.size === right.size
  && left.canDrag === right.canDrag

export const useKanbanRuntime = (input: {
  columnWidth: number
  columnMinHeight: number
}): KanbanViewRuntime => {
  const dataView = useDataView()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const configStore = useMemo(() => store.createValueStore({
    columnWidth: input.columnWidth,
    columnMinHeight: input.columnMinHeight
  }, {
    isEqual: (left, right) => left.columnWidth === right.columnWidth
      && left.columnMinHeight === right.columnMinHeight
  }), [])
  const itemIds = useStoreValue(dataView.source.active.items.ids)
  const interaction = useItemDragRuntime({
    itemIds
  })
  const boardModel = useStoreValue(dataView.model.kanban.board)
  const sections = useStoreValue(dataView.model.kanban.sections)
  const visibility = useKanbanVisibility({
    viewId: boardModel?.viewId ?? '',
    sections: boardModel ? sections : EMPTY_SECTIONS,
    cardsPerColumn: boardModel?.cardsPerColumn ?? 'all'
  })
  const layout = useKanbanLayout({
    containerRef: scrollRef,
    sections: boardModel ? sections : EMPTY_SECTIONS,
    sectionsStore: dataView.model.kanban.sections,
    visibility
  })
  const board = useMemo(() => store.createDerivedStore<KanbanBoard>({
    get: () => {
      const base = store.read(dataView.model.kanban.board)
      if (!base) {
        throw new Error('Kanban board is unavailable.')
      }

      const config = store.read(configStore)
      return {
        ...base,
        sections: store.read(dataView.model.kanban.sections),
        columnWidth: config.columnWidth,
        columnMinHeight: config.columnMinHeight
      }
    },
    isEqual: sameBoard
  }), [
    configStore,
    dataView.model.kanban.board
  ])

  useEffect(() => {
    configStore.set({
      columnWidth: input.columnWidth,
      columnMinHeight: input.columnMinHeight
    })
  }, [
    configStore,
    input.columnMinHeight,
    input.columnWidth
  ])

  const boardLayout = useStoreValue(layout.board)
  const marqueeScene = useMemo<MarqueeScene>(() => ({
    hitTest: rect => {
      const container = scrollRef.current
      if (!container) {
        return []
      }

      const localRect = rectIn(container, rect)
      if (!localRect) {
        return []
      }

      return hitTestBoardLayout(boardLayout, localRect)
    }
  }), [boardLayout])

  useRegisterMarqueeScene(marqueeScene)

  const drag = useDrag({
    containerRef: scrollRef,
    canDrag: boardModel?.canDrag ?? false,
    itemMap: interaction.itemMap,
    getLayout: () => layout.board.get(),
    getDragIds: interaction.getDragIds,
    onDraggingChange: interaction.onDraggingChange,
    onDrop: (cardIds, target) => {
      dataView.engine.active.items.move(cardIds, {
        section: target.sectionId,
        ...(target.beforeItemId ? { before: target.beforeItemId } : {})
      })
    }
  })

  useEffect(() => {
    if (!drag.activeId || !drag.dragIds.length) {
      dataView.react.drag.clear()
      return
    }

    dataView.react.drag.set({
      active: true,
      kind: 'card',
      source: drag.sourceRef.current,
      pointerRef: drag.pointerRef,
      offsetRef: drag.overlayOffsetRef,
      size: {
        width: drag.overlaySize.width || Math.max(220, input.columnWidth - 32),
        height: drag.overlaySize.height
      },
      extraCount: Math.max(0, drag.dragIds.length - 1)
    })

    return () => {
      dataView.react.drag.clear()
    }
  }, [
    dataView.react.drag,
    drag.activeId,
    drag.dragIds,
    drag.overlayOffsetRef,
    drag.overlaySize.height,
    drag.overlaySize.width,
    drag.pointerRef,
    drag.sourceRef,
    input.columnWidth
  ])

  return useMemo(() => ({
    board,
    section: dataView.model.kanban.section,
    card: dataView.model.kanban.card,
    content: dataView.model.kanban.content,
    layout: {
      columnWidth: input.columnWidth,
      columnMinHeight: input.columnMinHeight,
      board: layout.board,
      body: layout.body,
      measure: layout.measure
    },
    scrollRef,
    ...interaction,
    drag,
    visibility: {
      section: visibility.section,
      showMore: visibility.showMore,
      reset: visibility.reset
    }
  }), [
    board,
    dataView.model.kanban.card,
    dataView.model.kanban.content,
    dataView.model.kanban.section,
    drag,
    input.columnMinHeight,
    input.columnWidth,
    interaction,
    layout.board,
    layout.body,
    layout.measure,
    visibility.reset,
    visibility.section,
    visibility.showMore
  ])
}
