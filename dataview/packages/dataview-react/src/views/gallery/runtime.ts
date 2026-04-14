import {
  useMemo,
  useRef,
  useState
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
  useItemInteractionRuntime
} from '@dataview/react/views/shared/interactionRuntime'

export const useGalleryRuntime = (input: GalleryRuntimeInput): GalleryViewRuntime => {
  const dataView = useDataView()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const itemIds = input.active.items.ids
  const virtual = useGalleryBlocks({
    grouped: input.active.query.group.active,
    sections: input.active.sections.all,
    minCardWidth: GALLERY_CARD_MIN_WIDTH[input.extra.cardSize],
    containerRef,
    overscan: dragging ? 1200 : 640
  })
  const interaction = useItemInteractionRuntime({
    viewId: input.active.view.id,
    itemIds,
    disabled: dragging,
    canStart: event => !closestTarget(
      event.target,
      `[${DATAVIEW_APPEARANCE_ID_ATTR}],${interactiveSelector}`
    ),
    resolveAutoPanTargets: () => resolveDefaultAutoPanTargets(containerRef.current)
  })

  const drag = useCardReorder({
    containerRef,
    canDrag: input.extra.canReorder,
    itemMap: new Map(itemIds.map(id => [id, id] as const)),
    getLayout: () => virtual.layout,
    getDragIds: activeId => (
      interaction.selection.selectedIds.includes(activeId)
        ? interaction.selection.selectedIds.filter(id => itemIds.includes(id))
        : [activeId]
    ),
    onDraggingChange: setDragging,
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
