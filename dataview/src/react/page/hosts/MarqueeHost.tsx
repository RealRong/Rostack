import {
  useCallback,
  useEffect,
  useRef
} from 'react'
import type { Point } from '@dataview/dom/geometry'
import {
  pointIn,
  rectFromPoints
} from '@dataview/dom/geometry'
import { disableUserSelect } from '@dataview/dom/selection'
import {
  resolveDefaultAutoPanTargets,
  useAutoPan
} from '@dataview/react/interaction/autoPan'
import {
  useCurrentView,
  useDataView,
  usePageValue
} from '@dataview/react/dataview'
import {
  selection as selectionHelpers,
  type Selection
} from '@dataview/react/runtime/selection'
import { useStoreValue } from '@dataview/react/store'
import type {
  MarqueeAdapter,
  MarqueeMode,
  MarqueeSessionState
} from '@dataview/react/runtime/marquee'

const resolveMarqueeMode = (input: {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}): MarqueeMode => {
  if (input.shiftKey) {
    return 'add'
  }

  return input.metaKey || input.ctrlKey
    ? 'toggle'
    : 'replace'
}

const addSelection = (input: {
  order: readonly string[]
  baseSelectedIds: readonly string[]
  hitIds: readonly string[]
}): Selection => {
  const baseIdSet = new Set(input.baseSelectedIds)
  const hitIdSet = new Set(input.hitIds)
  return selectionHelpers.set(
    input.order,
    input.order.filter(id => baseIdSet.has(id) || hitIdSet.has(id))
  )
}

const resolveMarqueeSelection = (input: {
  order: readonly string[]
  baseSelectedIds: readonly string[]
  hitIds: readonly string[]
  mode: MarqueeMode
}): Selection => {
  switch (input.mode) {
    case 'toggle':
      return selectionHelpers.toggle(
        input.order,
        selectionHelpers.set(input.order, input.baseSelectedIds),
        input.hitIds
      )
    case 'add':
      return addSelection(input)
    case 'replace':
    default:
      return selectionHelpers.set(input.order, input.hitIds)
  }
}

export const PageMarqueeHost = () => {
  const dataView = useDataView()
  const currentView = useCurrentView()
  const uiLock = usePageValue(state => state.lock)
  const session = useStoreValue(dataView.marquee.store)
  const pointerRef = useRef<Point | null>(null)
  const anchorRef = useRef<Point | null>(null)

  const resolveAdapter = useCallback((viewId?: string): MarqueeAdapter | undefined => (
    viewId
      ? dataView.marquee.getAdapter(viewId)
      : undefined
  ), [dataView.marquee])

  const applySelection = useCallback((nextSession: MarqueeSessionState, adapter: MarqueeAdapter) => {
    const nextSelection = resolveMarqueeSelection({
      order: adapter.order(),
      baseSelectedIds: nextSession.baseSelectedIds,
      hitIds: adapter.resolveIds(nextSession.box),
      mode: nextSession.mode
    })

    dataView.selection.set(nextSelection.ids, {
      anchor: nextSelection.anchor,
      focus: nextSelection.focus
    })
  }, [dataView.selection])

  const update = useCallback(() => {
    const currentSession = dataView.marquee.get()
    if (!currentSession) {
      return
    }

    const adapter = resolveAdapter(currentSession.ownerViewId)
    const container = adapter?.containerRef.current
    const anchor = anchorRef.current
    const pointer = pointerRef.current
    if (!adapter || !container || !anchor || !pointer) {
      return
    }

    const nextSession: MarqueeSessionState = {
      ...currentSession,
      current: pointer,
      box: rectFromPoints(anchor, pointIn(container, pointer))
    }
    dataView.marquee.update(nextSession)
    applySelection(nextSession, adapter)
  }, [applySelection, dataView.marquee, resolveAdapter])

  useEffect(() => {
    if (!session || typeof document === 'undefined') {
      return
    }

    return disableUserSelect(document)
  }, [session])

  const resolveTargets = useCallback(
    () => resolveDefaultAutoPanTargets(
      resolveAdapter(dataView.marquee.get()?.ownerViewId)?.containerRef.current
    ),
    [dataView.marquee, resolveAdapter]
  )
  const autoPanState = useAutoPan({
    active: session !== null,
    pointerRef,
    resolveTargets,
    onPan: update
  })

  useEffect(() => {
    if (!session) {
      return
    }

    const handleScroll = () => {
      update()
    }

    const targets: EventTarget[] = []
    const pushTarget = (target: EventTarget | null | undefined) => {
      if (!target || targets.includes(target)) {
        return
      }

      targets.push(target)
    }

    pushTarget(resolveAdapter(session.ownerViewId)?.containerRef.current)
    autoPanState.watchTargets.forEach(pushTarget)

    targets.forEach(target => {
      target.addEventListener?.('scroll', handleScroll, { passive: true })
    })

    return () => {
      targets.forEach(target => {
        target.removeEventListener?.('scroll', handleScroll)
      })
    }
  }, [autoPanState.watchTargets, resolveAdapter, session, update])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dataView.marquee.get()) {
        return
      }

      pointerRef.current = {
        x: event.clientX,
        y: event.clientY
      }
      update()
    }

    const end = (event: PointerEvent) => {
      const currentSession = dataView.marquee.get()
      if (!currentSession) {
        return
      }

      if (event.type === 'pointercancel') {
        dataView.selection.set(currentSession.baseSelectedIds)
      }

      pointerRef.current = null
      anchorRef.current = null
      dataView.marquee.clear()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true })
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
    return () => {
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
    }
  }, [dataView.marquee, dataView.selection, update])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0
        || uiLock
        || dataView.valueEditor.openStore.get()
        || dataView.marquee.get()
        || !currentView
      ) {
        return
      }

      const adapter = resolveAdapter(currentView.view.id)
      const container = adapter?.containerRef.current
      if (
        !adapter
        || adapter.disabled
        || !container
        || !(event.target instanceof Node)
        || !container.contains(event.target)
        || !adapter.canStart(event)
      ) {
        return
      }

      event.preventDefault()

      if (dataView.inlineSession.store.get()) {
        dataView.inlineSession.exit({
          reason: 'selection'
        })
      }

      const start = {
        x: event.clientX,
        y: event.clientY
      }
      anchorRef.current = pointIn(container, start)
      pointerRef.current = start

      const nextSession: MarqueeSessionState = {
        ownerViewId: currentView.view.id,
        mode: resolveMarqueeMode({
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey
        }),
        start,
        current: start,
        box: rectFromPoints(anchorRef.current, anchorRef.current),
        baseSelectedIds: dataView.selection.get().ids
      }

      dataView.marquee.start(nextSession)
      applySelection(nextSession, adapter)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [
    applySelection,
    currentView,
    dataView.inlineSession,
    dataView.marquee,
    dataView.selection,
    dataView.valueEditor,
    resolveAdapter,
    uiLock
  ])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const currentSession = dataView.marquee.get()
      if (!currentSession || event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      dataView.selection.set(currentSession.baseSelectedIds)
      pointerRef.current = null
      anchorRef.current = null
      dataView.marquee.clear()
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [dataView.marquee, dataView.selection])

  return null
}
