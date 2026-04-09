import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import type { ViewId } from '@dataview/core/contracts'
import type {
  CustomField,
  View
} from '@dataview/core/contracts'
import { isCustomField } from '@dataview/core/field'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/dom/appearance'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import {
  closestTarget,
  interactiveSelector
} from '@shared/dom'
import {
  move as currentViewMove
} from '@dataview/engine/projection/view'
import {
  type AppearanceId,
  type AppearanceList,
  type FieldList,
  type Section
} from '@dataview/engine/projection/view'
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
import { usesOptionGroupingColors } from '@dataview/react/views/shared/optionGrouping'

type GalleryCurrentView = {
  view: View
  appearances: AppearanceList
  sections: readonly Section[]
  fields: FieldList
}

export interface GalleryController {
  currentView: GalleryCurrentView
  sections: readonly Section[]
  fields: readonly CustomField[]
  canReorder: boolean
  groupUsesOptionColors: boolean
  containerRef: RefObject<HTMLDivElement | null>
  layout: GalleryLayoutCache
  blocks: readonly GalleryBlock[]
  measure: (id: AppearanceId) => (node: HTMLElement | null) => void
  selectedIdSet: ReadonlySet<AppearanceId>
  drag: ReturnType<typeof useCardReorder>
  indicator?: GalleryDropTarget['indicator']
  readSectionColorId: (sectionKey: string) => string | undefined
  select: (id: AppearanceId, mode?: 'replace' | 'toggle') => void
  marqueeActive: boolean
  visualTargets: VisualTargetRegistry
}

export const useGalleryController = (input: {
  viewId: ViewId
  containerRef: RefObject<HTMLDivElement | null>
}): GalleryController => {
  const dataView = useDataView()
  const activeView = useDataViewValue(dataView => dataView.engine.read.activeView, view => (
    view?.id === input.viewId
      ? view
      : undefined
  ))
  const appearances = useDataViewValue(dataView => dataView.engine.project.appearances)
  const sectionsProjection = useDataViewValue(dataView => dataView.engine.project.sections)
  const fieldsProjection = useDataViewValue(dataView => dataView.engine.project.fields)
  const currentView = useMemo<GalleryCurrentView | undefined>(() => (
    activeView && appearances && sectionsProjection && fieldsProjection
      ? {
          view: activeView,
          appearances,
          sections: sectionsProjection,
          fields: fieldsProjection
        }
      : undefined
  ), [activeView, appearances, fieldsProjection, sectionsProjection])
  if (!currentView) {
    throw new Error('Gallery view requires an active current view.')
  }
  const groupProjection = useDataViewValue(dataView => dataView.engine.project.group)
  const sortProjection = useDataViewValue(dataView => dataView.engine.project.sort)

  const fields = useMemo(
    () => currentView.fields.all.filter(isCustomField),
    [currentView.fields.all]
  )
  const canReorder = !(groupProjection?.active ?? false) && !(sortProjection?.active ?? false)
  const [dragging, setDragging] = useState(false)
  const visualTargets = useRef(createVisualTargetRegistry({
    resolveScrollTargets: () => resolveDefaultAutoPanTargets(input.containerRef.current)
  })).current
  const grouped = groupProjection?.active === true
  const groupField = groupProjection?.field
  const groupUsesOptionColors = grouped && usesOptionGroupingColors(groupField)
  const sections = useMemo<readonly Section[]>(() => (
    grouped
      ? currentView.sections
      : [{
          key: 'all',
          title: '',
          color: undefined,
          collapsed: false,
          ids: currentView.appearances.ids
        }]
  ), [currentView.appearances.ids, currentView.sections, grouped])
  const sectionColorByKey = useMemo(() => new Map(
    sections.map(section => [section.key, section.color] as const)
  ), [sections])
  const minCardWidth = GALLERY_CARD_MIN_WIDTH[currentView.view.options.gallery.cardSize]
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
  const marqueeActive = marqueeSession?.ownerViewId === currentView.view.id
  const selectedIdSet = useMemo(
    () => new Set(selectionState.ids),
    [selectionState.ids]
  )
  const getLayout = useCallback(() => virtual.layout, [virtual.layout])
  const readSectionColorId = useCallback((sectionKey: string) => (
    groupUsesOptionColors
      ? sectionColorByKey.get(sectionKey)
      : undefined
  ), [groupUsesOptionColors, sectionColorByKey])

  useEffect(() => dataView.marquee.registerAdapter({
    viewId: currentView.view.id,
    disabled: dragging,
    canStart: event => !closestTarget(
      event.target,
      `[${DATAVIEW_APPEARANCE_ID_ATTR}],${interactiveSelector}`
    ),
    getTargets: () => visualTargets.getTargets(currentView.appearances.ids),
    order: () => currentView.appearances.ids,
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
    currentView.appearances.ids,
    currentView.view.id,
    dataView.marquee,
    dragging,
    input.containerRef,
    visualTargets
  ])

  const drag = useCardReorder({
    containerRef: input.containerRef,
    canDrag: canReorder,
    itemMap: new Map(currentView.appearances.ids.map(id => [id, id] as const)),
    getLayout,
    getDragIds: activeId => currentViewMove.drag(
      currentView.appearances.ids,
      selectionState.ids,
      activeId
    ),
    onDraggingChange: setDragging,
    onDrop: (ids, target) => {
      const section = target.beforeAppearanceId
        ? currentView.appearances.sectionOf(target.beforeAppearanceId)
        : target.sectionKey
      if (!section) {
        return
      }

      dataView.engine.view(currentView.view.id).items.moveAppearances(ids, {
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
      ? currentView.appearances.sectionOf(drag.overTarget.beforeAppearanceId)
      : drag.overTarget.sectionKey
    if (!section) {
      return undefined
    }

    const plan = currentViewMove.plan(currentView.appearances, drag.dragIds, {
      section,
      ...(drag.overTarget.beforeAppearanceId ? { before: drag.overTarget.beforeAppearanceId } : {})
    })

    return plan.changed
      ? drag.overTarget.indicator
      : undefined
  }, [currentView, drag.dragIds, drag.overTarget])

  const select = useCallback((id: AppearanceId, mode: 'replace' | 'toggle' = 'replace') => {
    if (mode === 'toggle') {
      dataView.selection.toggle([id])
      return
    }

    dataView.selection.set([id])
  }, [dataView.selection])

  return useMemo(() => ({
    currentView,
    sections,
    fields,
    canReorder,
    groupUsesOptionColors,
    containerRef: input.containerRef,
    layout: virtual.layout,
    blocks: virtual.blocks,
    measure: virtual.measure,
    selectedIdSet,
    drag,
    indicator,
    readSectionColorId,
    select,
    marqueeActive,
    visualTargets
  }), [
    canReorder,
    currentView,
    drag,
    groupUsesOptionColors,
    indicator,
    input.containerRef,
    marqueeActive,
    fields,
    readSectionColorId,
    sections,
    select,
    selectedIdSet,
    visualTargets,
    virtual.blocks,
    virtual.layout,
    virtual.measure
  ])
}
