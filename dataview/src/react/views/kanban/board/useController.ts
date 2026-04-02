import {
  useCallback,
  useMemo,
  useRef,
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
import {
  closestTarget,
  interactiveSelector
} from '@dataview/dom/interactive'
import {
  move as currentViewMove
} from '@dataview/engine/projection/view'
import {
  type AppearanceId,
  type CurrentView
} from '@dataview/react/currentView'
import {
  type Kanban,
  useKanbanContext
} from '../context'
import {
  useDrag
} from '../drag'
import {
  useSelection
} from '../selection'
import type {
  LayoutRegistry
} from './useLayoutRegistry'
import {
  useLayoutRegistry
} from './useLayoutRegistry'

export interface BoardController {
  currentView: CurrentView
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  canReorder: boolean
  layout: Kanban['layout']
  scrollRef: RefObject<HTMLDivElement | null>
  layouts: LayoutRegistry
  selection: ReturnType<typeof useSelection>
  drag: ReturnType<typeof useDrag>
  boostedSectionKeySet: ReadonlySet<string>
  readRecord: (id: AppearanceId) => GroupRecord | undefined
}

export const useBoardController = (): BoardController => {
  const kanban = useKanbanContext()
  const engine = useEngine()
  const currentView = useCurrentView(view => (
    view?.view.id === kanban.viewId
      ? view
      : undefined
  ))
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const layouts = useLayoutRegistry(scrollRef)

  if (!currentView) {
    throw new Error('Kanban view requires an active current view.')
  }

  const titleProperty = useMemo(
    () => resolveGroupTitleProperty(
      Array.from(currentView.schema.properties.values())
    ),
    [currentView.schema.properties]
  )
  const properties = useMemo(() => {
    const groupPropertyId = currentView.view.query.group?.property

    return currentView.properties.all.filter(property => (
      property.id !== titleProperty?.id
      && property.id !== groupPropertyId
    ))
  }, [
    currentView.properties.all,
    currentView.view.query.group?.property,
    titleProperty?.id
  ])
  const canReorder = Boolean(currentView.view.query.group) && !currentView.view.query.sorters.length

  const readRecord = useCallback((id: AppearanceId) => {
    const recordId = currentView.appearances.get(id)?.recordId
    return recordId
      ? engine.read.record.get(recordId)
      : undefined
  }, [currentView, engine.read.record])

  const sectionKeyById = useMemo(() => new Map(
    currentView.sections.flatMap(section => section.ids.map(id => [id, section.key] as const))
  ), [currentView.sections])

  const selection = useSelection({
    currentView,
    containerRef: scrollRef,
    cardOrder: currentView.appearances.ids,
    disabled: dragging,
    getLayout: layouts.read,
    canStart: event => {
      return !closestTarget(event.target, [
        '[data-kanban-card-id]',
        interactiveSelector
      ].join(','))
    }
  })

  const drag = useDrag({
    containerRef: scrollRef,
    canDrag: canReorder,
    itemMap: new Map(currentView.appearances.ids.map(id => [id, id] as const)),
    getLayout: layouts.read,
    getDragIds: activeId => currentViewMove.drag(
      currentView.appearances.ids,
      selection.selectedIds,
      activeId
    ),
    onDraggingChange: setDragging,
    onDrop: (cardIds, target) => {
      currentView.commands.move.ids(cardIds, {
        section: target.sectionKey,
        ...(target.beforeAppearanceId ? { before: target.beforeAppearanceId } : {})
      })
    }
  })

  const boostedSectionKeySet = useMemo(() => {
    const keys = new Set<string>()
    drag.dragIds.forEach(id => {
      const key = sectionKeyById.get(id)
      if (key) {
        keys.add(key)
      }
    })
    if (drag.overTarget?.sectionKey) {
      keys.add(drag.overTarget.sectionKey)
    }
    return keys
  }, [drag.dragIds, drag.overTarget?.sectionKey, sectionKeyById])

  return useMemo(() => ({
    currentView,
    titleProperty,
    properties,
    canReorder,
    layout: kanban.layout,
    scrollRef,
    layouts,
    selection,
    drag,
    boostedSectionKeySet,
    readRecord
  }), [
    boostedSectionKeySet,
    canReorder,
    currentView,
    drag,
    kanban.layout,
    layouts,
    properties,
    readRecord,
    selection,
    titleProperty
  ])
}
