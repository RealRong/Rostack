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
  ActiveGalleryState,
  ActiveViewState
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
  move as viewMove
} from '@dataview/engine/project'
import type {
  AppearanceId
} from '@dataview/engine/project'
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

export type GalleryActiveState = ActiveViewState & {
  view: View & {
    type: 'gallery'
  }
}

export interface GalleryRuntime {
  containerRef: RefObject<HTMLDivElement | null>
  virtual: {
    layout: GalleryLayoutCache
    blocks: readonly GalleryBlock[]
    measure: (id: AppearanceId) => (node: HTMLElement | null) => void
  }
  selection: {
    selectedIdSet: ReadonlySet<AppearanceId>
    select: (id: AppearanceId, mode?: 'replace' | 'toggle') => void
  }
  drag: ReturnType<typeof useCardReorder>
  indicator?: GalleryDropTarget['indicator']
  marqueeActive: boolean
  visualTargets: VisualTargetRegistry
}

export const useGalleryRuntime = (input: {
  active: GalleryActiveState
  extra: ActiveGalleryState
}): GalleryRuntime => {
  const dataView = useDataView()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const visualTargets = useRef(createVisualTargetRegistry({
    resolveScrollTargets: () => resolveDefaultAutoPanTargets(containerRef.current)
  })).current
  const appearanceIds = input.active.appearances.ids
  const virtual = useGalleryBlocks({
    grouped: input.active.group.active,
    sections: input.extra.sections,
    minCardWidth: GALLERY_CARD_MIN_WIDTH[input.extra.cardSize],
    containerRef,
    overscan: dragging ? 1200 : 640
  })
  const selectionState = useDataViewValue(
    dataView => dataView.selection.store
  )
  const selectedIdSet = useMemo<ReadonlySet<AppearanceId>>(
    () => new Set(selectionState.ids),
    [selectionState.ids]
  )
  const select = useCallback((id: AppearanceId, mode: 'replace' | 'toggle' = 'replace') => {
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
    getTargets: () => visualTargets.getTargets(appearanceIds),
    order: () => appearanceIds,
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
    appearanceIds,
    dataView.marquee,
    dragging,
    input.active.view.id,
    visualTargets
  ])

  const drag = useCardReorder({
    containerRef,
    canDrag: input.extra.canReorder,
    itemMap: new Map(appearanceIds.map(id => [id, id] as const)),
    getLayout: () => virtual.layout,
    getDragIds: activeId => viewMove.drag(
      appearanceIds,
      selectionState.ids,
      activeId
    ),
    onDraggingChange: setDragging,
    onDrop: (ids, target) => {
      const section = target.beforeAppearanceId
        ? dataView.engine.active.read.getAppearanceSectionKey(target.beforeAppearanceId)
        : target.sectionKey
      if (!section) {
        return
      }

      dataView.engine.active.items.move(ids, {
        section,
        ...(target.beforeAppearanceId ? { before: target.beforeAppearanceId } : {})
      })
    }
  })

  const indicator = useMemo(() => {
    if (!drag.overTarget || !drag.dragIds.length) {
      return undefined
    }

    const section = drag.overTarget.beforeAppearanceId
      ? dataView.engine.active.read.getAppearanceSectionKey(drag.overTarget.beforeAppearanceId)
      : drag.overTarget.sectionKey
    if (!section) {
      return undefined
    }

    const plan = viewMove.plan(input.active.appearances, drag.dragIds, {
      section,
      ...(drag.overTarget.beforeAppearanceId ? { before: drag.overTarget.beforeAppearanceId } : {})
    })

    return plan.changed
      ? drag.overTarget.indicator
      : undefined
  }, [dataView.engine.active.read, drag.dragIds, drag.overTarget, input.active.appearances])

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
