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
import { useCardReorder } from '@dataview/react/views/gallery/reorder'
import {
  GALLERY_CARD_MIN_WIDTH,
  useGalleryBlocks
} from '@dataview/react/views/gallery/virtual'
import type {
  GalleryRuntimeInput,
  GalleryViewRuntime
} from '@dataview/react/views/gallery/types'
import {
  useItemDragRuntime,
  useRegisterMarqueeScene
} from '@dataview/react/views/shared/interactionRuntime'
import type { MarqueeScene } from '@dataview/react/runtime/marquee'

export const useGalleryRuntime = (input: GalleryRuntimeInput): GalleryViewRuntime => {
  const dataView = useDataView()
  const containerRef = useRef<HTMLDivElement | null>(null)
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

      return virtual.layout.cards
        .filter(card => intersects(localRect, card.rect))
        .map(card => card.id)
    }
  }), [virtual.layout])

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
      dataView.page.drag.clear()
      return
    }

    dataView.page.drag.set({
      active: true,
      kind: 'card',
      source: drag.sourceRef.current,
      pointerRef: drag.pointerRef,
      offsetRef: drag.overlayOffsetRef,
      size: drag.overlaySize,
      extraCount: Math.max(0, drag.dragIds.length - 1)
    })

    return () => {
      dataView.page.drag.clear()
    }
  }, [
    dataView.page.drag,
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
    containerRef,
    drag,
    indicator,
    interaction,
    virtual.blocks,
    virtual.layout,
    virtual.measure
  ])
}
