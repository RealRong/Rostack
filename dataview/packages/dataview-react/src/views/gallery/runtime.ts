import {
  useMemo,
  useRef
} from 'react'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/react/dom/appearance'
import {
  useDataView
} from '@dataview/react/dataview'
import {
  closestTarget,
  interactiveSelector
} from '@shared/dom'
import {
  resolveDefaultAutoPanTargets
} from '@dataview/react/interaction/autoPan'
import {
  useCardReorder
} from '@dataview/react/views/gallery/reorder'
import {
  GALLERY_CARD_MIN_WIDTH,
  useGalleryBlocks
} from '@dataview/react/views/gallery/virtual'
import type {
  GalleryRuntimeInput,
  GalleryViewRuntime
} from '@dataview/react/views/gallery/types'
import {
  useItemDragRuntime
} from '@dataview/react/views/shared/interactionRuntime'

export const useGalleryRuntime = (input: GalleryRuntimeInput): GalleryViewRuntime => {
  const dataView = useDataView()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemIds = input.active.items.ids
  const interaction = useItemDragRuntime({
    viewId: input.active.view.id,
    itemIds,
    canStart: event => !closestTarget(
      event.target,
      `[${DATAVIEW_APPEARANCE_ID_ATTR}],${interactiveSelector}`
    ),
    resolveAutoPanTargets: () => resolveDefaultAutoPanTargets(containerRef.current)
  })
  const virtual = useGalleryBlocks({
    grouped: input.active.query.group.active,
    sections: input.active.sections.all,
    minCardWidth: GALLERY_CARD_MIN_WIDTH[input.extra.cardSize],
    containerRef,
    overscan: interaction.dragging ? 1200 : 640
  })

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
