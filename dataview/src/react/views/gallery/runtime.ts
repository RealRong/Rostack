import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import type {
  View
} from '@dataview/core/contracts'
import type {
  GalleryState,
  ViewState
} from '@dataview/engine'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/react/dom/appearance'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import {
  closestTarget,
  interactiveSelector
} from '@shared/dom'
import {
  ItemId
} from '@dataview/engine'
import {
  resolveDefaultAutoPanTargets
} from '@dataview/react/interaction/autoPan'
import {
  createVisualTargetRegistry,
  type VisualTargetRegistry
} from '@dataview/react/runtime/marquee'
import { useStoreValue } from '@shared/react'
import type { GalleryDropTarget } from './reorder'
import {
  useCardReorder
} from './reorder'
import {
  GALLERY_CARD_MIN_WIDTH,
  useGalleryBlocks,
  type GalleryBlock,
  type GalleryLayoutCache
} from './virtual'

export type GalleryActiveState = ViewState & {
  view: View & {
    type: 'gallery'
  }
}

export interface GalleryRuntime {
  containerRef: RefObject<HTMLDivElement | null>
  virtual: {
    layout: GalleryLayoutCache
    blocks: readonly GalleryBlock[]
    measure: (id: ItemId) => (node: HTMLElement | null) => void
  }
  selection: {
    selectedIdSet: ReadonlySet<ItemId>
    select: (id: ItemId, mode?: 'replace' | 'toggle') => void
  }
  drag: ReturnType<typeof useCardReorder>
  indicator?: GalleryDropTarget['indicator']
  marqueeActive: boolean
  visualTargets: VisualTargetRegistry
}

export const useGalleryRuntime = (input: {
  active: GalleryActiveState
  extra: GalleryState
}): GalleryRuntime => {
  const dataView = useDataView()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const visualTargets = useRef(createVisualTargetRegistry({
    resolveScrollTargets: () => resolveDefaultAutoPanTargets(containerRef.current)
  })).current
  const itemIds = input.active.items.ids
  const virtual = useGalleryBlocks({
    grouped: input.active.query.group.active,
    sections: input.active.sections.all,
    minCardWidth: GALLERY_CARD_MIN_WIDTH[input.extra.cardSize],
    containerRef,
    overscan: dragging ? 1200 : 640
  })
  const selectionState = useDataViewValue(
    dataView => dataView.selection.store
  )
  const selectedIdSet = useMemo<ReadonlySet<ItemId>>(
    () => new Set(selectionState.ids),
    [selectionState.ids]
  )
  const select = useCallback((id: ItemId, mode: 'replace' | 'toggle' = 'replace') => {
    if (mode === 'toggle') {
      dataView.selection.toggle([id])
      return
    }

    dataView.selection.set([id])
  }, [dataView.selection])
  const marqueeSession = useStoreValue(dataView.marquee.store)
  const marqueeActive = marqueeSession?.ownerViewId === input.active.view.id

  useEffect(() => dataView.marquee.registerAdapter({
    viewId: input.active.view.id,
    disabled: dragging,
    canStart: event => !closestTarget(
      event.target,
      `[${DATAVIEW_APPEARANCE_ID_ATTR}],${interactiveSelector}`
    ),
    getTargets: () => visualTargets.getTargets(itemIds),
    order: () => itemIds,
    resolveAutoPanTargets: () => resolveDefaultAutoPanTargets(containerRef.current),
    onStart: () => {
      visualTargets.clearFrozen()
    },
    onEnd: () => {
      visualTargets.clearFrozen()
    },
    onCancel: () => {
      visualTargets.clearFrozen()
    }
  }), [
    itemIds,
    dataView.marquee,
    dragging,
    input.active.view.id,
    visualTargets
  ])

  const drag = useCardReorder({
    containerRef,
    canDrag: input.extra.canReorder,
    itemMap: new Map(itemIds.map(id => [id, id] as const)),
    getLayout: () => virtual.layout,
    getDragIds: activeId => (
      selectionState.ids.includes(activeId)
        ? selectionState.ids.filter(id => itemIds.includes(id))
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
    selection: {
      selectedIdSet,
      select
    },
    drag,
    indicator,
    marqueeActive,
    visualTargets
  }), [
    drag,
    indicator,
    marqueeActive,
    select,
    selectedIdSet,
    visualTargets,
    virtual.blocks,
    virtual.layout,
    virtual.measure
  ])
}
