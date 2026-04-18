import {
  useCallback,
  useEffect,
  useRef
} from 'react'
import { createPortal } from 'react-dom'
import type { Point } from '@shared/dom'
import {
  disableUserSelect,
  pageScrollNode,
  rectFromPoints,
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
import { useOverlay } from '@shared/ui/overlay'
import {
  createItemListSelectionDomain,
  selectionSnapshot,
  type ItemSelectionSnapshot
} from '@dataview/runtime/selection'
import { useStoreValue } from '@shared/react'
import type {
  MarqueeMode,
  MarqueeSessionState
} from '@dataview/react/runtime/marquee'
import {
  resolvePageMarqueeScrollRoot,
  shouldStartMarquee
} from '@dataview/react/runtime/marquee/policy'

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

interface ScrollAnchorState {
  node: ScrollNode
  start: number
}

const readScrollAnchorState = (
  root: HTMLElement | null
): ScrollAnchorState | null => {
  const node = root
    ? pageScrollNode(root) ?? root
    : null
  return node
    ? {
        node,
        start: scrollMetrics(node).top
      }
    : null
}

const resolveScrolledAnchor = (
  anchor: Point,
  scrollState: ScrollAnchorState | null
): Point => ({
  x: anchor.x,
  y: anchor.y - (
    scrollState
      ? scrollMetrics(scrollState.node).top - scrollState.start
      : 0
  )
})

const resolveAutoPanTargets = (): AutoPanTargets | null => {
  const root = resolvePageMarqueeScrollRoot()
  const node = root
    ? pageScrollNode(root) ?? root
    : null
  return node
    ? {
        y: {
          node
        }
      }
    : null
}

export const PageMarqueeHost = () => {
  const dataView = useDataView()
  const overlay = useOverlay()
  const valueEditorOpen = useDataViewValue(
    dataView => dataView.page.store,
    state => state.valueEditorOpen
  )
  const session = useStoreValue(dataView.marquee.store)
  const pointerRef = useRef<Point | null>(null)
  const anchorRef = useRef<Point | null>(null)
  const scrollAnchorRef = useRef<ScrollAnchorState | null>(null)
  const frameRef = useRef<number | null>(null)

  const resolveNextSelection = useCallback((currentSession: MarqueeSessionState): ItemSelectionSnapshot => {
    const activeItems = dataView.read.activeItems.get()
    if (!activeItems) {
      return currentSession.baseSelection
    }

    return selectionSnapshot.applyIds(
      createItemListSelectionDomain(activeItems),
      currentSession.baseSelection,
      currentSession.hitIds,
      currentSession.mode,
      dataView.selection.state.getSnapshot().domainRevision
    )
  }, [dataView.read.activeItems, dataView.selection.state])
  const commitSelection = useCallback((currentSession: MarqueeSessionState) => {
    dataView.selection.command.restore(resolveNextSelection(currentSession))
  }, [dataView.selection, resolveNextSelection])

  const update = useCallback(() => {
    const currentSession = dataView.marquee.get()
    const scene = dataView.marquee.getScene()
    const anchor = anchorRef.current
    const pointer = pointerRef.current
    if (!currentSession || !scene || !anchor || !pointer) {
      return
    }

    const rect = rectFromPoints(
      resolveScrolledAnchor(anchor, scrollAnchorRef.current),
      pointer
    )
    dataView.marquee.update({
      ...currentSession,
      current: pointer,
      rect,
      hitIds: scene.hitTest(rect)
    })
  }, [dataView.marquee])
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
  const reset = useCallback(() => {
    if (typeof window !== 'undefined' && frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    pointerRef.current = null
    anchorRef.current = null
    scrollAnchorRef.current = null
    dataView.marquee.clear()
  }, [dataView.marquee])

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

  const autoPanState = useAutoPan({
    active: session !== null,
    pointerRef,
    resolveTargets: resolveAutoPanTargets,
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
      if (!dataView.marquee.get()) {
        return
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

      if (event.type !== 'pointercancel') {
        commitSelection(currentSession)
      }

      reset()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true })
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
    return () => {
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
    }
  }, [commitSelection, dataView.marquee, reset, scheduleUpdate, update])

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
        || dataView.page.drag.get()
        || dataView.marquee.get()
        || !dataView.session.select.canStartMarquee()
      ) {
        return
      }

      const scene = dataView.marquee.getScene()
      if (!scene || !shouldStartMarquee(event)) {
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
      const rect = rectFromPoints(start, start)
      anchorRef.current = start
      pointerRef.current = start
      scrollAnchorRef.current = readScrollAnchorState(
        resolvePageMarqueeScrollRoot()
      )

      dataView.marquee.start({
        mode: resolveMarqueeMode({
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey
        }),
        start,
        current: start,
        rect,
        hitIds: scene.hitTest(rect),
        baseSelection: dataView.selection.state.getSnapshot()
      })
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [
    dataView.inlineSession,
    dataView.marquee,
    dataView.page.drag,
    dataView.selection.state,
    dataView.session.select,
    dataView.valueEditor,
    overlay.topLayerId,
    valueEditorOpen
  ])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!dataView.marquee.get() || event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      reset()
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [dataView.marquee, reset])

  if (!session || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-[80] rounded-md border border-primary/60 bg-primary/10"
      style={{
        left: session.rect.left,
        top: session.rect.top,
        width: session.rect.width,
        height: session.rect.height
      }}
    />,
    document.body
  )
}
