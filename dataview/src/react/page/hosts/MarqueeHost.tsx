import {
  useCallback,
  useEffect,
  useRef
} from 'react'
import { createPortal } from 'react-dom'
import type { Point } from '@shared/dom'
import {
  idsInRect,
  rectFromPoints
} from '@shared/dom'
import { disableUserSelect } from '@shared/dom'
import {
  scrollMetrics,
  type ScrollNode
} from '@shared/dom'
import {
  type AutoPanTargets,
  useAutoPan
} from '@dataview/react/interaction/autoPan'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import { useOverlay } from '@ui/overlay'
import {
  selection as selectionHelpers,
  type Selection
} from '@dataview/react/runtime/selection'
import { useStoreValue } from '@shared/react'
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

interface ScrollAnchorState {
  x?: {
    node: ScrollNode
    start: number
  }
  y?: {
    node: ScrollNode
    start: number
  }
}

const readScrollAnchorState = (
  targets: AutoPanTargets | null | undefined
): ScrollAnchorState => ({
  x: targets?.x?.node
    ? {
        node: targets.x.node,
        start: scrollMetrics(targets.x.node).left
      }
    : undefined,
  y: targets?.y?.node
    ? {
        node: targets.y.node,
        start: scrollMetrics(targets.y.node).top
      }
    : undefined
})

const resolveScrolledAnchor = (
  anchor: Point,
  scrollState: ScrollAnchorState
): Point => ({
  x: anchor.x - (
    scrollState.x
      ? scrollMetrics(scrollState.x.node).left - scrollState.x.start
      : 0
  ),
  y: anchor.y - (
    scrollState.y
      ? scrollMetrics(scrollState.y.node).top - scrollState.y.start
      : 0
  )
})

export const PageMarqueeHost = () => {
  const dataView = useDataView()
  const currentView = useDataViewValue(dataView => dataView.currentView)
  const overlay = useOverlay()
  const valueEditorOpen = useDataViewValue(
    dataView => dataView.page.store,
    state => state.valueEditorOpen
  )
  const session = useStoreValue(dataView.marquee.store)
  const pointerRef = useRef<Point | null>(null)
  const anchorRef = useRef<Point | null>(null)
  const scrollAnchorRef = useRef<ScrollAnchorState>({})
  const frameRef = useRef<number | null>(null)
  const selectionRef = useRef<Selection | null>(null)

  const resolveAdapter = useCallback((viewId?: string): MarqueeAdapter | undefined => (
    viewId
      ? dataView.marquee.getAdapter(viewId)
      : undefined
  ), [dataView.marquee])

  const commitSelection = useCallback((nextSelection: Selection) => {
    dataView.selection.set(nextSelection.ids, {
      anchor: nextSelection.anchor,
      focus: nextSelection.focus
    })
  }, [dataView.selection])

  const applySelection = useCallback((nextSession: MarqueeSessionState, adapter: MarqueeAdapter) => {
    const order = adapter.order()
    const hitIds = adapter.getHitIds?.(nextSession)
      ?? idsInRect(
        order,
        adapter.getTargets?.() ?? [],
        nextSession.box
      )
    const nextSelection = resolveMarqueeSelection({
      order,
      baseSelectedIds: nextSession.baseSelectedIds,
      hitIds,
      mode: nextSession.mode
    })
    selectionRef.current = nextSelection

    if (adapter.previewSelection) {
      adapter.previewSelection(nextSelection)
      return nextSelection
    }

    commitSelection(nextSelection)
    return nextSelection
  }, [commitSelection])

  const update = useCallback(() => {
    const currentSession = dataView.marquee.get()
    const anchor = anchorRef.current
    const pointer = pointerRef.current
    if (!currentSession || !anchor || !pointer) {
      return
    }

    const adapter = resolveAdapter(currentSession.ownerViewId)
    if (!adapter) {
      return
    }

    const nextSession: MarqueeSessionState = {
      ...currentSession,
      current: pointer,
      box: rectFromPoints(
        resolveScrolledAnchor(anchor, scrollAnchorRef.current),
        pointer
      )
    }
    dataView.marquee.update(nextSession)
    applySelection(nextSession, adapter)
  }, [applySelection, dataView.marquee, resolveAdapter])
  const scheduleUpdate = useCallback(() => {
    if (typeof window === 'undefined') {
      update()
      return
    }

    if (frameRef.current !== null) {
      return
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      update()
    })
  }, [update])

  useEffect(() => () => {
    if (typeof window !== 'undefined' && frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!session || typeof document === 'undefined') {
      return
    }

    return disableUserSelect(document)
  }, [session])

  const resolveTargets = useCallback(
    () => {
      const adapter = resolveAdapter(dataView.marquee.get()?.ownerViewId)
      return adapter?.resolveAutoPanTargets?.() ?? null
    },
    [dataView.marquee, resolveAdapter]
  )
  const autoPanState = useAutoPan({
    active: session !== null,
    pointerRef,
    resolveTargets,
    onPan: scheduleUpdate
  })

  useEffect(() => {
    if (!session) {
      return
    }

    const handleScroll = () => {
      scheduleUpdate()
    }

    autoPanState.watchTargets.forEach(target => {
      target.addEventListener?.('scroll', handleScroll, { passive: true })
    })

    return () => {
      autoPanState.watchTargets.forEach(target => {
        target.removeEventListener?.('scroll', handleScroll)
      })
    }
  }, [autoPanState.watchTargets, scheduleUpdate, session])

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
      scheduleUpdate()
    }

    const end = (event: PointerEvent) => {
      if (typeof window !== 'undefined' && frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      pointerRef.current = {
        x: event.clientX,
        y: event.clientY
      }
      update()

      const currentSession = dataView.marquee.get()
      if (!currentSession) {
        return
      }

      const adapter = resolveAdapter(currentSession.ownerViewId)
      const nextSelection = selectionRef.current
        ?? selectionHelpers.set(
          adapter?.order() ?? currentSession.baseSelectedIds,
          currentSession.baseSelectedIds
        )

      if (event.type === 'pointercancel') {
        adapter?.onCancel?.(currentSession, nextSelection)
        if (adapter?.previewSelection) {
          commitSelection(selectionHelpers.set(
            adapter.order(),
            currentSession.baseSelectedIds
          ))
          adapter.clearPreviewSelection?.()
        } else {
          dataView.selection.set(currentSession.baseSelectedIds)
        }
      } else {
        if (adapter?.previewSelection) {
          commitSelection(nextSelection)
          adapter.clearPreviewSelection?.()
        }
        adapter?.onEnd?.(currentSession, nextSelection)
      }

      pointerRef.current = null
      anchorRef.current = null
      scrollAnchorRef.current = {}
      selectionRef.current = null
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
  }, [dataView.marquee, dataView.selection, scheduleUpdate, update])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0
        || overlay.topLayerId !== null
        || valueEditorOpen
        || dataView.valueEditor.openStore.get()
        || dataView.marquee.get()
        || !currentView
      ) {
        return
      }

      const adapter = resolveAdapter(currentView.view.id)
      if (
        !adapter
        || adapter.disabled
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
      anchorRef.current = start
      pointerRef.current = start
      scrollAnchorRef.current = readScrollAnchorState(
        adapter.resolveAutoPanTargets?.()
      )

      const nextSession: MarqueeSessionState = {
        ownerViewId: currentView.view.id,
        mode: resolveMarqueeMode({
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey
        }),
        start,
        current: start,
        box: rectFromPoints(start, start),
        baseSelectedIds: dataView.selection.get().ids
      }

      dataView.marquee.start(nextSession)
      adapter.onStart?.(nextSession)
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
    overlay.topLayerId,
    resolveAdapter,
    valueEditorOpen
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
      const adapter = resolveAdapter(currentSession.ownerViewId)
      const nextSelection = selectionRef.current
        ?? selectionHelpers.set(
          adapter?.order() ?? currentSession.baseSelectedIds,
          currentSession.baseSelectedIds
        )
      adapter?.onCancel?.(currentSession, nextSelection)
      if (adapter?.previewSelection) {
        commitSelection(selectionHelpers.set(
          adapter.order(),
          currentSession.baseSelectedIds
        ))
        adapter.clearPreviewSelection?.()
      } else {
        dataView.selection.set(currentSession.baseSelectedIds)
      }
      pointerRef.current = null
      anchorRef.current = null
      scrollAnchorRef.current = {}
      selectionRef.current = null
      dataView.marquee.clear()
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [commitSelection, dataView.marquee, dataView.selection, resolveAdapter])

  if (!session || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-[80] rounded-md border border-primary/60 bg-primary/10"
      style={{
        left: session.box.left,
        top: session.box.top,
        width: session.box.width,
        height: session.box.height
      }}
    />,
    document.body
  )
}
