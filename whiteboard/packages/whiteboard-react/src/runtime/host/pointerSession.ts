export type PointerSession = {
  start: (input: {
    container: Element
    pointerId: number
    move: (event: PointerEvent) => void
    up: (event: PointerEvent) => void
    cancel: (event: PointerEvent) => void
  }) => () => void
}

const releaseCapture = (
  target: Element,
  pointerId: number
) => {
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

const capturePointer = (
  target: Element,
  pointerId: number
) => {
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

export const createPointerSession = (): PointerSession => ({
  start: ({
    container,
    pointerId,
    move,
    up,
    cancel
  }) => {
    capturePointer(container, pointerId)

    if (typeof window === 'undefined') {
      return () => {
        releaseCapture(container, pointerId)
      }
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)

    let released = false

    return () => {
      if (released) {
        return
      }
      released = true

      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      releaseCapture(container, pointerId)
    }
  }
})
