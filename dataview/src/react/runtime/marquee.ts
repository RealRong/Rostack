import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  type RefObject
} from 'react'
import {
  pointIn,
  rectFromPoints,
  type Box,
  type Point
} from '@dataview/react/dom/geometry'
import { disableUserSelect } from '@dataview/react/dom/selection'
import {
  resolveDefaultAutoPanTargets,
  useAutoPan
} from '@dataview/react/runtime/interaction/autoPan'

export interface Session {
  start: Point
  current: Point
  box: Box
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
}

export interface Options<TElement extends HTMLElement> {
  containerRef: RefObject<TElement | null>
  disabled?: boolean
  autoPan?: boolean
  canStart?: (event: ReactPointerEvent<TElement>) => boolean
  onStart?: (session: Session) => void
  onChange?: (session: Session) => void
  onEnd?: (
    session: Session | null,
    meta: {
      cancelled: boolean
    }
  ) => void
}

export interface Marquee<TElement extends HTMLElement> {
  active: boolean
  box: Box | null
  onPointerDown: PointerEventHandler<TElement>
}

const same = (left: Box | null, right: Box | null) => {
  if (!left || !right) {
    return left === right
  }

  return (
    left.left === right.left
    && left.top === right.top
    && left.right === right.right
    && left.bottom === right.bottom
  )
}

export const useMarquee = <TElement extends HTMLElement>(
  options: Options<TElement>
): Marquee<TElement> => {
  const {
    containerRef,
    disabled,
    autoPan,
    canStart,
    onStart,
    onChange,
    onEnd
  } = options
  const [nextBox, setBox] = useState<Box | null>(null)
  const boxRef = useRef<Box | null>(null)
  const startRef = useRef<Point | null>(null)
  const anchorRef = useRef<Point | null>(null)
  const currentRef = useRef<Point | null>(null)
  const modifiersRef = useRef({
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false
  })

  const session = (resolved: Box): Session => ({
    start: startRef.current ?? { x: 0, y: 0 },
    current: currentRef.current ?? { x: 0, y: 0 },
    box: resolved,
    ...modifiersRef.current
  })

  const update = useCallback(() => {
    const container = containerRef.current
    const anchor = anchorRef.current
    const current = currentRef.current
    if (!container || !anchor || !current) {
      return
    }

    const resolved = rectFromPoints(
      anchor,
      pointIn(container, current)
    )
    if (same(boxRef.current, resolved)) {
      return
    }

    boxRef.current = resolved
    setBox(resolved)
    onChange?.(session(resolved))
  }, [containerRef, onChange])

  useEffect(() => {
    if (!nextBox || typeof document === 'undefined') {
      return
    }

    return disableUserSelect(document)
  }, [nextBox])

  const resolveTargets = useCallback(
    () => autoPan
      ? resolveDefaultAutoPanTargets(containerRef.current)
      : null,
    [autoPan, containerRef]
  )
  const autoPanState = useAutoPan({
    active: nextBox !== null && autoPan === true,
    pointerRef: currentRef,
    resolveTargets,
    onPan: update
  })

  useEffect(() => {
    if (!nextBox) {
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

    pushTarget(containerRef.current)
    autoPanState.watchTargets.forEach(pushTarget)

    targets.forEach(target => {
      target.addEventListener?.('scroll', handleScroll, { passive: true })
    })

    return () => {
      targets.forEach(target => {
        target.removeEventListener?.('scroll', handleScroll)
      })
    }
  }, [autoPanState.watchTargets, containerRef, nextBox, update])

  const onPointerDown: PointerEventHandler<TElement> = event => {
    if (event.button !== 0 || disabled || !containerRef.current) {
      return
    }

    if (canStart && !canStart(event)) {
      return
    }

    event.preventDefault()

    const start = {
      x: event.clientX,
      y: event.clientY
    }
    const anchor = pointIn(containerRef.current, start)
    startRef.current = start
    anchorRef.current = anchor
    currentRef.current = start
    modifiersRef.current = {
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey
    }

    const resolved = rectFromPoints(anchor, anchor)
    boxRef.current = resolved
    setBox(resolved)
    onStart?.(session(resolved))

    const handlePointerMove = (nextEvent: PointerEvent) => {
      currentRef.current = {
        x: nextEvent.clientX,
        y: nextEvent.clientY
      }
      modifiersRef.current = {
        shiftKey: nextEvent.shiftKey,
        metaKey: nextEvent.metaKey,
        ctrlKey: nextEvent.ctrlKey,
        altKey: nextEvent.altKey
      }
      update()
    }

    const handlePointerEnd = (nextEvent: PointerEvent) => {
      const resolvedBox = boxRef.current
      const resolvedSession = resolvedBox ? session(resolvedBox) : null
      startRef.current = null
      anchorRef.current = null
      currentRef.current = null
      boxRef.current = null
      setBox(null)
      onEnd?.(resolvedSession, {
        cancelled: nextEvent.type === 'pointercancel'
      })
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('pointerup', handlePointerEnd, true)
      window.removeEventListener('pointercancel', handlePointerEnd, true)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true, capture: true })
    window.addEventListener('pointerup', handlePointerEnd, true)
    window.addEventListener('pointercancel', handlePointerEnd, true)
  }

  return {
    active: nextBox !== null,
    box: nextBox,
    onPointerDown
  }
}
