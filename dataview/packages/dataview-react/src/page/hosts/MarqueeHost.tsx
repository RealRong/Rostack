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
  useDataView
} from '@dataview/react/dataview'
import { useOverlay } from '@shared/ui/overlay'
import { useStoreValue } from '@shared/react'
import type {
  MarqueeMode
} from '@dataview/runtime'

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

const resolveAutoPanTargets = (
  root: HTMLElement | null
): AutoPanTargets | null => {
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
  const session = useStoreValue(dataView.session.marquee.store)
  const pointerRef = useRef<Point | null>(null)
  const anchorRef = useRef<Point | null>(null)
  const scrollAnchorRef = useRef<ScrollAnchorState | null>(null)
  const frameRef = useRef<number | null>(null)
  const resolveAutoPanTargetsForScene = useCallback(() => resolveAutoPanTargets(
    dataView.react.marquee.resolveAutoPanRoot()
  ), [dataView.react.marquee])

  const update = useCallback(() => {
    const currentSession = dataView.session.marquee.get()
    const scene = dataView.react.marquee.getScene()
    const anchor = anchorRef.current
    const pointer = pointerRef.current
    if (!currentSession || !scene || !anchor || !pointer) {
      return
    }

    const rect = rectFromPoints(
      resolveScrolledAnchor(anchor, scrollAnchorRef.current),
      pointer
    )
    dataView.intent.marquee.update({
      current: pointer,
      rect,
      hitIds: scene.hitTest(rect)
    })
  }, [dataView.intent.marquee, dataView.react.marquee, dataView.session.marquee])
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
    dataView.intent.marquee.cancel()
  }, [dataView.intent.marquee])

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
    resolveTargets: resolveAutoPanTargetsForScene,
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
      if (!dataView.session.marquee.get()) {
        return
      }

      pointerRef.current = {
        x: event.clientX,
        y: event.clientY
      }
      scheduleUpdate()
    }

    const end = (event: PointerEvent) => {
      if (!dataView.session.marquee.get()) {
        return
      }

      pointerRef.current = {
        x: event.clientX,
        y: event.clientY
      }
      update()

      if (!dataView.session.marquee.get()) {
        return
      }

      if (event.type !== 'pointercancel') {
        dataView.intent.marquee.commit()
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
  }, [dataView.intent.marquee, dataView.session.marquee, reset, scheduleUpdate, update])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0
        || overlay.topLayerId !== null
        || dataView.react.drag.get()
        || dataView.session.marquee.get()
        || !dataView.session.select.canStartMarquee()
      ) {
        return
      }

      const scene = dataView.react.marquee.getScene()
      if (!scene || !dataView.react.marquee.shouldStartMarquee(event)) {
        return
      }

      event.preventDefault()

      if (dataView.intent.editing.inline.store.get()) {
        dataView.intent.editing.inline.exit({
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
        dataView.react.marquee.resolveAutoPanRoot()
      )

      dataView.intent.marquee.start({
        mode: resolveMarqueeMode({
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey
        }),
        start,
        baseSelection: dataView.selection.state.getSnapshot()
      })
      dataView.intent.marquee.update({
        current: start,
        rect,
        hitIds: scene.hitTest(rect)
      })
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [
    dataView.intent.editing.inline,
    dataView.intent.marquee,
    dataView.react.drag,
    dataView.react.marquee,
    dataView.selection.state,
    dataView.session.select,
    dataView.session.marquee,
    overlay.topLayerId
  ])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!dataView.session.marquee.get() || event.key !== 'Escape') {
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
  }, [dataView.session.marquee, reset])

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
