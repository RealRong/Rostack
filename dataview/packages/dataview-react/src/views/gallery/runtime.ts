import {
  useEffect,
  useMemo,
  useRef
} from 'react'
import {
  useDataView
} from '@dataview/react/dataview'
import {
  intersects,
  rectIn
} from '@shared/dom'
import { equal, store } from '@shared/core'
import { useStoreValue } from '@shared/react'
import { useCardReorder } from '@dataview/react/views/gallery/reorder'
import {
  GALLERY_CARD_MIN_WIDTH,
  type GalleryBlock,
  useGalleryBlocks
} from '@dataview/react/views/gallery/virtual'
import type {
  GalleryBody,
  GalleryViewRuntime
} from '@dataview/react/views/gallery/types'
import {
  useItemDragRuntime,
  useRegisterMarqueeScene
} from '@dataview/react/views/shared/interactionRuntime'
import type { MarqueeScene } from '@dataview/react/page/marqueeBridge'

const EMPTY_GALLERY_BLOCKS = [] as readonly GalleryBlock[]

const sameBody = (
  left: GalleryViewRuntime['body']['get'] extends () => infer T ? T : never,
  right: GalleryViewRuntime['body']['get'] extends () => infer T ? T : never
) => left.viewId === right.viewId
  && left.empty === right.empty
  && left.grouped === right.grouped
  && left.blocks === right.blocks
  && left.totalHeight === right.totalHeight
  && left.columnCount === right.columnCount
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.sectionKeys === right.sectionKeys

export const useGalleryRuntime = (): GalleryViewRuntime => {
  const dataView = useDataView()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const layoutStore = useMemo<store.ValueStore<Pick<GalleryBody, 'blocks' | 'totalHeight' | 'columnCount'>>>(() => store.createValueStore({
    blocks: EMPTY_GALLERY_BLOCKS,
    totalHeight: 0,
    columnCount: 1
  }, {
    isEqual: (left, right) => left.blocks === right.blocks
      && left.totalHeight === right.totalHeight
      && left.columnCount === right.columnCount
  }), [])
  const itemIds = useStoreValue(dataView.source.active.items.ids)
  const interaction = useItemDragRuntime({
    itemIds
  })
  const sectionsStore = useMemo(() => store.createDerivedStore({
    get: () => store.read(dataView.source.active.sections.keys)
      .flatMap(key => {
        const section = store.read(dataView.source.active.sections, key)
        return section ? [section] : []
      }),
    isEqual: (left, right) => equal.sameOrder(left, right, (before, after) => before === after)
  }), [dataView.source.active.sections])
  const sections = useStoreValue(sectionsStore)
  const grouped = useStoreValue(dataView.source.active.query.grouped)
  const size = useStoreValue(dataView.source.active.gallery.size)
  const canReorder = useStoreValue(dataView.source.active.gallery.canReorder)
  const virtual = useGalleryBlocks({
    grouped,
    sections,
    minCardWidth: GALLERY_CARD_MIN_WIDTH[size],
    containerRef,
    overscan: interaction.dragging ? 1200 : 640
  })
  const cardRectById = useMemo(() => new Map(
    virtual.layout.cards.map(card => [card.id, card.rect] as const)
  ), [virtual.layout.cards])
  const bodyStore = useMemo(() => store.createDerivedStore<GalleryBody>({
    get: () => {
      const base = store.read(dataView.model.gallery.body)
      if (!base) {
        throw new Error('Gallery body is unavailable.')
      }

      const layout = store.read(layoutStore)
      return {
        ...base,
        blocks: layout.blocks,
        totalHeight: layout.totalHeight,
        columnCount: layout.columnCount
      }
    },
    isEqual: sameBody
  }), [
    dataView.model.gallery.body,
    layoutStore
  ])
  const section = dataView.model.gallery.section
  const card = dataView.model.gallery.card
  const content = dataView.model.gallery.content

  useEffect(() => {
    layoutStore.set({
      blocks: virtual.blocks,
      totalHeight: virtual.layout.totalHeight,
      columnCount: virtual.layout.columnCount
    })
  }, [
    layoutStore,
    virtual.blocks,
    virtual.layout.columnCount,
    virtual.layout.totalHeight
  ])
  const marqueeScene = useMemo<MarqueeScene>(() => ({
    hitTest: rect => {
      const container = containerRef.current
      if (!container) {
        return []
      }

      const localRect = rectIn(container, rect)
      if (!localRect) {
        return []
      }

      return virtual.layout.rows.flatMap(row => {
        if (
          localRect.bottom <= row.top
          || localRect.top >= row.top + row.height
        ) {
          return []
        }

        return row.ids.filter(id => {
          const cardRect = cardRectById.get(id)
          return cardRect
            ? intersects(localRect, cardRect)
            : false
        })
      })
    }
  }), [cardRectById, virtual.layout.rows])

  useRegisterMarqueeScene(marqueeScene)

  const drag = useCardReorder({
    containerRef,
    canDrag: canReorder,
    itemMap: interaction.itemMap,
    getLayout: () => virtual.layout,
    getDragIds: interaction.getDragIds,
    onDraggingChange: interaction.onDraggingChange,
    onDrop: (ids, target) => {
      const sectionKey = target.beforeItemId
        ? dataView.engine.active.read.item(target.beforeItemId)?.sectionKey
        : target.sectionKey
      if (!sectionKey) {
        return
      }

      dataView.engine.active.items.move(ids, {
        section: sectionKey,
        before: target.beforeItemId
      })
    }
  })

  return {
    selection: interaction.selection,
    marqueeActive: interaction.marqueeActive,
    body: bodyStore,
    section,
    card,
    content,
    containerRef,
    virtual: {
      layout: virtual.layout,
      blocks: virtual.blocks,
      measure: virtual.measure
    },
    drag,
    indicator: drag.overTarget?.indicator
  }
}
