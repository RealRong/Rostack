import {
  useEffect,
  useMemo,
  useRef
} from 'react'
import type {
  Section
} from '@dataview/engine'
import {
  queryRead
} from '@dataview/engine'
import {
  useDataView
} from '@dataview/react/dataview'
import { equal, store } from '@shared/core'
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

const sameBoard = (
  left: KanbanBoard,
  right: KanbanBoard
) => left.viewId === right.viewId
  && left.grouped === right.grouped
  && equal.sameOrder(left.sectionKeys, right.sectionKeys)
  && left.groupField === right.groupField
  && left.columnWidth === right.columnWidth
  && left.columnMinHeight === right.columnMinHeight
  && left.fillColumnColor === right.fillColumnColor
  && left.groupUsesOptionColors === right.groupUsesOptionColors

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
  const sectionsStore = useMemo(() => store.createDerivedStore<readonly Section[]>({
    get: () => store.read(dataView.source.active.sections.keys)
      .flatMap(key => {
        const section = store.read(dataView.source.active.sections, key)
        return section ? [section] : []
      }),
    isEqual: equal.sameOrder
  }), [dataView.source.active.sections])
  const sections = useStoreValue(sectionsStore)
  const currentViewId = useStoreValue(dataView.source.active.view.id) ?? ''
  const groupedStore = useMemo(() => store.createDerivedStore({
    get: () => queryRead.grouped(store.read(dataView.source.active.query)),
    isEqual: Object.is
  }), [dataView.source.active.query])
  const cardsPerColumnStore = useMemo(() => store.createDerivedStore({
    get: () => store.read(dataView.source.active.kanban).cardsPerColumn,
    isEqual: Object.is
  }), [dataView.source.active.kanban])
  const canDragStore = useMemo(() => store.createDerivedStore({
    get: () => store.read(dataView.source.active.kanban).canReorder,
    isEqual: Object.is
  }), [dataView.source.active.kanban])
  const cardsPerColumn = useStoreValue(cardsPerColumnStore)
  const canDrag = useStoreValue(canDragStore)
  const visibility = useKanbanVisibility({
    viewId: currentViewId,
    sections,
    cardsPerColumn
  })
  const layout = useKanbanLayout({
    containerRef: scrollRef,
    sections,
    sectionsStore,
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
        grouped: store.read(groupedStore),
        columnWidth: config.columnWidth,
        columnMinHeight: config.columnMinHeight
      }
    },
    isEqual: sameBoard
  }), [
    configStore,
    dataView.model.kanban.board,
    groupedStore
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
    canDrag,
    itemMap: interaction.itemMap,
    getLayout: () => layout.board.get(),
    getDragIds: interaction.getDragIds,
    onDraggingChange: interaction.onDraggingChange,
    onDrop: (cardIds, target) => {
      dataView.engine.active.items.move(cardIds, {
        section: target.sectionKey,
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
