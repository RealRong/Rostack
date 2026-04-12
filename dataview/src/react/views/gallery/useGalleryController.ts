import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import type {
  CustomField,
  Row,
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
import {
  type AppearanceId,
  type Section,
  type SectionKey
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

export interface GalleryController {
  viewId: View['id']
  appearances: ActiveViewState['appearances']
  appearanceIds: readonly AppearanceId[]
  sections: readonly Section[]
  customFields: readonly CustomField[]
  canReorder: boolean
  groupUsesOptionColors: boolean
  containerRef: RefObject<HTMLDivElement | null>
  layout: GalleryLayoutCache
  blocks: readonly GalleryBlock[]
  measure: (id: AppearanceId) => (node: HTMLElement | null) => void
  selectedIdSet: ReadonlySet<AppearanceId>
  drag: ReturnType<typeof useCardReorder>
  indicator?: GalleryDropTarget['indicator']
  getRecordId: (appearanceId: AppearanceId) => string | undefined
  getRecord: (appearanceId: AppearanceId) => Row | undefined
  getSectionColor: (sectionKey: SectionKey) => string | undefined
  select: (id: AppearanceId, mode?: 'replace' | 'toggle') => void
  marqueeActive: boolean
  visualTargets: VisualTargetRegistry
}

export const useGalleryController = (input: {
  containerRef: RefObject<HTMLDivElement | null>
  active: GalleryActiveState
  extra: ActiveGalleryState
}): GalleryController => {
  const dataView = useDataView()
  const active = input.active
  const extra = input.extra

  const canReorder = extra.canReorder
  const [dragging, setDragging] = useState(false)
  const visualTargets = useRef(createVisualTargetRegistry({
    resolveScrollTargets: () => resolveDefaultAutoPanTargets(input.containerRef.current)
  })).current
  const grouped = active.group.active
  const groupUsesOptionColors = extra.groupUsesOptionColors
  const sections = extra.sections
  const appearanceIds = active.appearances.ids
  const minCardWidth = GALLERY_CARD_MIN_WIDTH[extra.cardSize]
  const virtual = useGalleryBlocks({
    grouped,
    sections,
    minCardWidth,
    containerRef: input.containerRef,
    overscan: dragging ? 1200 : 640
  })

  const selectionState = useDataViewValue(
    dataView => dataView.selection.store
  )
  const marqueeSession = useStoreValue(dataView.marquee.store)
  const marqueeActive = marqueeSession?.ownerViewId === active.view.id
  const selectedIdSet = useMemo(
    () => new Set(selectionState.ids),
    [selectionState.ids]
  )
  const getLayout = useCallback(() => virtual.layout, [virtual.layout])
  const getRecordId = useCallback((appearanceId: AppearanceId) => (
    dataView.engine.active.read.getAppearanceRecordId(appearanceId)
  ), [dataView.engine.active.read])
  const getRecord = useCallback((appearanceId: AppearanceId) => (
    dataView.engine.active.read.getAppearanceRecord(appearanceId)
  ), [dataView.engine.active.read])
  const getSectionColor = useCallback((sectionKey: SectionKey) => (
    groupUsesOptionColors
      ? dataView.engine.active.read.getSectionColor(sectionKey)
      : undefined
  ), [dataView.engine.active.read, groupUsesOptionColors])

  useEffect(() => dataView.marquee.registerAdapter({
    viewId: active.view.id,
    disabled: dragging,
    canStart: event => !closestTarget(
      event.target,
      `[${DATAVIEW_APPEARANCE_ID_ATTR}],${interactiveSelector}`
    ),
    getTargets: () => visualTargets.getTargets(appearanceIds),
    order: () => appearanceIds,
    resolveAutoPanTargets: () => resolveDefaultAutoPanTargets(input.containerRef.current),
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
    active.view.id,
    appearanceIds,
    dataView.marquee,
    dragging,
    input.containerRef,
    visualTargets
  ])

  const drag = useCardReorder({
    containerRef: input.containerRef,
    canDrag: canReorder,
    itemMap: new Map(appearanceIds.map(id => [id, id] as const)),
    getLayout,
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

    const plan = viewMove.plan(active.appearances, drag.dragIds, {
      section,
      ...(drag.overTarget.beforeAppearanceId ? { before: drag.overTarget.beforeAppearanceId } : {})
    })

    return plan.changed
      ? drag.overTarget.indicator
      : undefined
  }, [active.appearances, dataView.engine.active.read, drag.dragIds, drag.overTarget])

  const select = useCallback((id: AppearanceId, mode: 'replace' | 'toggle' = 'replace') => {
    if (mode === 'toggle') {
      dataView.selection.toggle([id])
      return
    }

    dataView.selection.set([id])
  }, [dataView.selection])

  return useMemo(() => ({
    viewId: active.view.id,
    appearances: active.appearances,
    appearanceIds,
    sections,
    customFields: active.customFields,
    canReorder,
    groupUsesOptionColors,
    containerRef: input.containerRef,
    layout: virtual.layout,
    blocks: virtual.blocks,
    measure: virtual.measure,
    selectedIdSet,
    drag,
    indicator,
    getRecordId,
    getRecord,
    getSectionColor,
    select,
    marqueeActive,
    visualTargets
  }), [
    active.appearances,
    active.customFields,
    active.view.id,
    appearanceIds,
    canReorder,
    drag,
    getRecord,
    getRecordId,
    getSectionColor,
    groupUsesOptionColors,
    indicator,
    input.containerRef,
    marqueeActive,
    sections,
    select,
    selectedIdSet,
    visualTargets,
    virtual.blocks,
    virtual.layout,
    virtual.measure
  ])
}
