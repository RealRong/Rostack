export interface DomModifierKeys {
  altKey: boolean
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

export interface ModifierKeys {
  alt: boolean
  shift: boolean
  ctrl: boolean
  meta: boolean
}

export type ClientPointLike = Pick<
  MouseEvent | PointerEvent | WheelEvent,
  'clientX' | 'clientY'
>

export type ModifierKeyInput = Pick<
  KeyboardEvent | MouseEvent | PointerEvent | WheelEvent,
  'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'
>

export interface CurrentTargetLikeEvent {
  currentTarget?: EventTarget | null
}

export interface PointerSessionStartInput {
  container: Element
  pointerId: number
  move?: (event: PointerEvent) => void
  up?: (event: PointerEvent) => void
  cancel?: (event: PointerEvent) => void
}

export interface PointerSession {
  start: (input: PointerSessionStartInput) => () => void
}

export const readClientPoint = (
  input: ClientPointLike
) => ({
  x: input.clientX,
  y: input.clientY
})

export const readDomModifierKeys = (
  input: ModifierKeyInput
): DomModifierKeys => ({
  altKey: input.altKey,
  shiftKey: input.shiftKey,
  ctrlKey: input.ctrlKey,
  metaKey: input.metaKey
})

export const readModifierKeys = (
  input: ModifierKeyInput
): ModifierKeys => ({
  alt: input.altKey,
  shift: input.shiftKey,
  ctrl: input.ctrlKey,
  meta: input.metaKey
})

export const readCoalescedPointerEvents = (
  event: Pick<PointerEvent, 'getCoalescedEvents'>
): readonly PointerEvent[] => (
  typeof event.getCoalescedEvents === 'function'
    ? event.getCoalescedEvents()
    : []
)

export const resolveContainedElement = (
  target: EventTarget | null,
  container: Element
): Element | null => (
  target instanceof Element && container.contains(target)
    ? target
    : null
)

export const elementFromPointWithin = (
  container: Element,
  input: ClientPointLike
): Element | null => {
  const document = container.ownerDocument
  if (!document?.elementFromPoint) {
    return null
  }

  return resolveContainedElement(
    document.elementFromPoint(input.clientX, input.clientY),
    container
  )
}

export const elementsFromPointWithin = (
  container: Element,
  input: ClientPointLike
): readonly Element[] => {
  const document = container.ownerDocument
  if (!document?.elementsFromPoint) {
    const element = elementFromPointWithin(container, input)
    return element ? [element] : []
  }

  return document.elementsFromPoint(input.clientX, input.clientY)
    .map(element => resolveContainedElement(element, container))
    .filter((element): element is Element => Boolean(element))
}

export const eventCurrentTargetElement = (
  event: CurrentTargetLikeEvent | undefined
): Element | undefined => {
  const target = event?.currentTarget
  return target instanceof Element
    ? target
    : undefined
}

export const eventWindow = (
  event: CurrentTargetLikeEvent | undefined
): Window | null => {
  const target = eventCurrentTargetElement(event)
  if (target) {
    return target.ownerDocument.defaultView
  }

  return typeof window !== 'undefined'
    ? window
    : null
}

export const setPointerCaptureSafe = (
  target: Element | null | undefined,
  pointerId: number | undefined
) => {
  if (!target || pointerId === undefined) {
    return
  }

  const capture = (target as Element & {
    setPointerCapture?: (nextPointerId: number) => void
  }).setPointerCapture
  if (typeof capture !== 'function') {
    return
  }

  try {
    capture.call(target, pointerId)
  } catch {
    // Ignore pointer capture failures.
  }
}

export const releasePointerCaptureSafe = (
  target: Element | null | undefined,
  pointerId: number | undefined
) => {
  if (!target || pointerId === undefined) {
    return
  }

  const release = (target as Element & {
    releasePointerCapture?: (nextPointerId: number) => void
  }).releasePointerCapture
  if (typeof release !== 'function') {
    return
  }

  try {
    release.call(target, pointerId)
  } catch {
    // Ignore pointer release failures.
  }
}

export const createPointerSession = (): PointerSession => ({
  start: ({
    container,
    pointerId,
    move,
    up,
    cancel
  }) => {
    setPointerCaptureSafe(container, pointerId)

    const ownerWindow = container.ownerDocument.defaultView ?? (
      typeof window !== 'undefined'
        ? window
        : null
    )
    if (!ownerWindow) {
      return () => {
        releasePointerCaptureSafe(container, pointerId)
      }
    }

    if (move) {
      ownerWindow.addEventListener('pointermove', move)
    }
    if (up) {
      ownerWindow.addEventListener('pointerup', up)
    }
    if (cancel) {
      ownerWindow.addEventListener('pointercancel', cancel)
    }

    let released = false

    return () => {
      if (released) {
        return
      }
      released = true

      if (move) {
        ownerWindow.removeEventListener('pointermove', move)
      }
      if (up) {
        ownerWindow.removeEventListener('pointerup', up)
      }
      if (cancel) {
        ownerWindow.removeEventListener('pointercancel', cancel)
      }
      releasePointerCaptureSafe(container, pointerId)
    }
  }
})
