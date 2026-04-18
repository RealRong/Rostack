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
import {
  createDerivedStore,
  createValueStore,
  read,
  sameMap
} from '@shared/core'
import { useCardReorder } from '@dataview/react/views/gallery/reorder'
import {
  GALLERY_CARD_MIN_WIDTH,
  type GalleryBlock,
  useGalleryBlocks
} from '@dataview/react/views/gallery/virtual'
import type {
  GalleryBody,
  GalleryRuntimeInput,
  GalleryViewRuntime
} from '@dataview/react/views/gallery/types'
import {
  useItemDragRuntime,
  useRegisterMarqueeScene
} from '@dataview/react/views/shared/interactionRuntime'
import type { MarqueeScene } from '@dataview/react/page/marqueeBridge'
import {
  type ValueStore
} from '@shared/core'

const EMPTY_GALLERY_BLOCKS: readonly GalleryBlock[] = []

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
  && sameMap(left.sectionCountByKey, right.sectionCountByKey)

export const useGalleryRuntime = (input: GalleryRuntimeInput): GalleryViewRuntime => {
  const dataView = useDataView()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const layoutStore = useMemo<ValueStore<Pick<GalleryBody, 'blocks' | 'totalHeight' | 'columnCount'>>>(() => createValueStore({
    blocks: EMPTY_GALLERY_BLOCKS,
    totalHeight: 0,
    columnCount: 1
  }, {
    isEqual: (left, right) => left.blocks === right.blocks
      && left.totalHeight === right.totalHeight
      && left.columnCount === right.columnCount
  }), [])
  const itemIds = input.active.items.ids
  const interaction = useItemDragRuntime({
    itemIds
  })
  const virtual = useGalleryBlocks({
    grouped: input.active.query.group.active,
    sections: input.active.sections.all,
    minCardWidth: GALLERY_CARD_MIN_WIDTH[input.extra.card.size],
    containerRef,
    overscan: interaction.dragging ? 1200 : 640
  })
  const cardRectById = useMemo(() => new Map(
    virtual.layout.cards.map(card => [card.id, card.rect] as const)
  ), [virtual.layout.cards])
  const bodyStore = useMemo(() => createDerivedStore<GalleryBody>({
    get: () => {
      const base = read(dataView.model.gallery.bodyBase)
      if (!base) {
        throw new Error('Gallery body base is unavailable.')
      }

      const layout = read(layoutStore)
      return {
        ...base,
        blocks: layout.blocks,
        totalHeight: layout.totalHeight,
        columnCount: layout.columnCount
      }
    },
    isEqual: sameBody
  }), [
    dataView.model.gallery.bodyBase,
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
    canDrag: input.extra.canReorder,
    itemMap: interaction.itemMap,
    getLayout: () => virtual.layout,
    getDragIds: interaction.getDragIds,
    onDraggingChange: interaction.onDraggingChange,
    onDrop: (ids, target) => {
      const section = target.beforeItemId
        ? dataView.engine.active.read.item(target.beforeItemId)?.sectionKey
        : target.sectionKey
      if (!section) {
        return
      }

      dataView.engine.active.items.move(ids, {
        section,
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
      size: drag.overlaySize,
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
    drag.overlaySize,
    drag.pointerRef,
    drag.sourceRef
  ])

  const indicator = useMemo(() => {
    if (!drag.overTarget || !drag.dragIds.length) {
      return undefined
    }

    const section = drag.overTarget.beforeItemId
      ? dataView.engine.active.read.item(drag.overTarget.beforeItemId)?.sectionKey
      : drag.overTarget.sectionKey
    if (!section) {
      return undefined
    }

    const plan = dataView.engine.active.items.planMove(drag.dragIds, {
      section,
      ...(drag.overTarget.beforeItemId ? { before: drag.overTarget.beforeItemId } : {})
    })

    return plan.changed
      ? drag.overTarget.indicator
      : undefined
  }, [dataView.engine.active, drag.dragIds, drag.overTarget, input.active.items])

  return useMemo(() => ({
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
    ...interaction,
    drag,
    indicator
  }), [
    bodyStore,
    card,
    content,
    containerRef,
    drag,
    indicator,
    interaction,
    section,
    virtual.blocks,
    virtual.layout,
    virtual.measure
  ])
}
