import {
  useCallback,
  useMemo,
  useState,
  type RefObject
} from 'react'
import type {
  GroupProperty,
  GroupRecord
} from '@dataview/core/contracts'
import {
  resolveGroupTitleProperty
} from '@dataview/core/view'
import {
  useCurrentView,
  useEngine
} from '@dataview/react/editor'
import { useStoreValue } from '@dataview/react/store'
import {
  closestTarget,
  interactiveSelector
} from '@dataview/react/dom/interactive'
import {
  move as currentViewMove
} from '@dataview/engine/projection/view'
import {
  type AppearanceId,
  type CurrentView
} from '@dataview/react/currentView'
import { useGalleryContext } from './context'
import type { GalleryDropTarget } from './reorder'
import {
  readGalleryLayout,
  useCardReorder
} from './reorder'
import { useMarqueeSelection } from './selection'

const CARD_MIN_WIDTH = {
  sm: 200,
  md: 260,
  lg: 320
} as const

export interface GalleryController {
  currentView: CurrentView
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  canReorder: boolean
  containerRef: RefObject<HTMLDivElement | null>
  selectedIdSet: ReadonlySet<AppearanceId>
  marqueeIdSet: ReadonlySet<AppearanceId>
  drag: ReturnType<typeof useCardReorder>
  marquee: ReturnType<typeof useMarqueeSelection>
  indicator?: GalleryDropTarget['indicator']
  cardMinWidth: number
  reorderDisabledMessage?: string
  readRecord: (id: AppearanceId) => GroupRecord | undefined
  select: (id: AppearanceId, mode?: 'replace' | 'toggle') => void
}

export const useGalleryController = (): GalleryController => {
  const { layout, viewId } = useGalleryContext()
  const engine = useEngine()
  const currentView = useCurrentView(view => (
    view?.view.id === viewId
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

  const readRecord = useCallback((id: AppearanceId) => {
    const recordId = currentView.appearances.get(id)?.recordId
    return recordId
      ? engine.read.record.get(recordId)
      : undefined
  }, [currentView, engine.read.record])

  const selectionState = useStoreValue(currentView.selection)
  const [dragging, setDragging] = useState(false)
  const [marqueeIds, setMarqueeIds] = useState<readonly AppearanceId[]>([])
  const selectedIdSet = useMemo(
    () => new Set(selectionState.ids),
    [selectionState.ids]
  )
  const marqueeIdSet = useMemo(
    () => new Set(marqueeIds),
    [marqueeIds]
  )
  const getLayout = useCallback(
    () => readGalleryLayout(layout.containerRef.current),
    [layout.containerRef]
  )

  const drag = useCardReorder({
    containerRef: layout.containerRef,
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
        : currentView.sections[0]?.key
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
      : currentView.sections[0]?.key
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

  const marquee = useMarqueeSelection({
    containerRef: layout.containerRef,
    cardOrder: currentView.appearances.ids,
    disabled: dragging,
    getLayout,
    currentSelection: selectionState,
    commitSelection: (ids, mode) => {
      if (mode === 'toggle') {
        currentView.commands.selection.toggle(ids)
        return
      }

      currentView.commands.selection.set(ids)
    },
    setMarquee: setMarqueeIds,
    clearMarquee: () => {
      setMarqueeIds([])
    },
    canStart: event => {
      return !closestTarget(event.target, [
        '[data-gallery-card-id]',
        interactiveSelector
      ].join(','))
    }
  })

  const select = useCallback((id: AppearanceId, mode: 'replace' | 'toggle' = 'replace') => {
    if (mode === 'toggle') {
      currentView.commands.selection.toggle([id])
      return
    }

    currentView.commands.selection.set([id])
  }, [currentView])

  const cardMinWidth = CARD_MIN_WIDTH[currentView.view.options.gallery.cardSize]
  const reorderDisabledMessage = currentView.view.query.sorters.length > 0
    ? 'Card reorder is disabled while a field sort is active. Clear sort to drag cards again.'
    : currentView.view.query.group
      ? 'Card reorder is disabled while the gallery is grouped.'
      : !canReorder
      ? 'Card reorder is disabled for this view configuration.'
      : undefined

  return useMemo(() => ({
    currentView,
    titleProperty,
    properties,
    canReorder,
    containerRef: layout.containerRef,
    selectedIdSet,
    marqueeIdSet,
    drag,
    marquee,
    indicator,
    cardMinWidth,
    reorderDisabledMessage,
    readRecord,
    select
  }), [
    canReorder,
    cardMinWidth,
    currentView,
    drag,
    indicator,
    layout.containerRef,
    marquee,
    marqueeIdSet,
    properties,
    readRecord,
    reorderDisabledMessage,
    select,
    selectedIdSet,
    titleProperty
  ])
}
