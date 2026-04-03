import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject
} from 'react'
import type { ViewId } from '@dataview/core/contracts'
import type {
  GroupProperty
} from '@dataview/core/contracts'
import {
  resolveGroupTitleProperty
} from '@dataview/core/view'
import {
  idsInRect,
  type Box
} from '@dataview/dom/geometry'
import {
  useDataView,
  useCurrentView,
  useSelection
} from '@dataview/react/dataview'
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'
import {
  dataviewAppearanceSelector
} from '@dataview/dom/appearance'
import {
  closestTarget,
  interactiveSelector
} from '@dataview/dom/interactive'
import {
  move as currentViewMove
} from '@dataview/engine/projection/view'
import {
  type AppearanceId,
  type CurrentView,
  type Section
} from '@dataview/react/runtime/currentView'
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

export interface GalleryController {
  currentView: CurrentView
  sections: readonly Section[]
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  canReorder: boolean
  containerRef: RefObject<HTMLDivElement | null>
  layout: GalleryLayoutCache
  blocks: readonly GalleryBlock[]
  measure: (id: AppearanceId) => (node: HTMLDivElement | null) => void
  selectedIdSet: ReadonlySet<AppearanceId>
  marqueeBox: Box | null
  drag: ReturnType<typeof useCardReorder>
  indicator?: GalleryDropTarget['indicator']
  reorderDisabledMessage?: string
  select: (id: AppearanceId, mode?: 'replace' | 'toggle') => void
}

export const useGalleryController = (input: {
  viewId: ViewId
  containerRef: RefObject<HTMLDivElement | null>
}): GalleryController => {
  const dataView = useDataView()
  const currentView = useCurrentView(view => (
    view?.view.id === input.viewId
      ? view
      : undefined
  ))
  if (!currentView) {
    throw new Error('Gallery view requires an active current view.')
  }

  const titleProperty = useMemo(
    () => resolveGroupTitleProperty(
      Array.from(currentView.schema.properties.values())
    ),
    [currentView.schema.properties]
  )
  const properties = useMemo(
    () => currentView.properties.all.filter(
      property => property.id !== titleProperty?.id
    ),
    [currentView.properties.all, titleProperty?.id]
  )
  const canReorder = !currentView.view.query.group && !currentView.view.query.sorters.length
  const [dragging, setDragging] = useState(false)
  const grouped = Boolean(currentView.view.query.group)
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
  const minCardWidth = GALLERY_CARD_MIN_WIDTH[currentView.view.options.gallery.cardSize]
  const virtual = useGalleryBlocks({
    grouped,
    sections,
    minCardWidth,
    containerRef: input.containerRef,
    overscan: dragging ? 1200 : 640
  })

  const selectionState = useSelection()
  const selectedIdSet = useMemo(
    () => new Set(selectionState.ids),
    [selectionState.ids]
  )
  const marqueeBox = useStoreSelector(
    dataView.marquee.store,
    session => session?.ownerViewId === currentView.view.id
      ? session.box
      : null
  )
  const getLayout = useCallback(() => virtual.layout, [virtual.layout])

  useEffect(() => dataView.marquee.registerAdapter({
    viewId: currentView.view.id,
    containerRef: input.containerRef,
    disabled: dragging,
    canStart: event => !closestTarget(event.target, [
      dataviewAppearanceSelector,
      interactiveSelector
    ].join(',')),
    resolveIds: box => idsInRect(
      currentView.appearances.ids,
      virtual.layout.cards,
      box
    ),
    order: () => currentView.appearances.ids
  }), [
    currentView.appearances.ids,
    currentView.view.id,
    dataView.marquee,
    dragging,
    input.containerRef,
    virtual.layout.cards
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

      currentView.commands.move.ids(ids, {
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

  const reorderDisabledMessage = currentView.view.query.sorters.length > 0
    ? 'Card reorder is disabled while a field sort is active. Clear sort to drag cards again.'
    : currentView.view.query.group
      ? 'Card reorder is disabled while the gallery is grouped.'
      : !canReorder
      ? 'Card reorder is disabled for this view configuration.'
      : undefined

  return useMemo(() => ({
    currentView,
    sections,
    titleProperty,
    properties,
    canReorder,
    containerRef: input.containerRef,
    layout: virtual.layout,
    blocks: virtual.blocks,
    measure: virtual.measure,
    selectedIdSet,
    marqueeBox,
    drag,
    indicator,
    reorderDisabledMessage,
    select
  }), [
    canReorder,
    currentView,
    drag,
    indicator,
    input.containerRef,
    marqueeBox,
    properties,
    reorderDisabledMessage,
    sections,
    select,
    selectedIdSet,
    titleProperty,
    virtual.blocks,
    virtual.layout,
    virtual.measure
  ])
}
