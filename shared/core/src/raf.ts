export type RafTask = {
  cancel: () => void
  isScheduled: () => boolean
  schedule: () => void
}

export const createRafTask = (
  flush: () => void,
  { fallback = 'sync' }: { fallback?: 'microtask' | 'sync' } = {}
): RafTask => {
  let frameId: number | null = null
  let token = 0

  const run = (currentToken: number) => {
    if (frameId === null || currentToken !== token) return
    frameId = null
    flush()
  }

  return {
    cancel: () => {
      if (frameId === null) return
      const currentFrameId = frameId
      frameId = null
      token += 1
      if (
        currentFrameId >= 0
        && typeof window !== 'undefined'
        && typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(currentFrameId)
      }
    },
    isScheduled: () => frameId !== null,
    schedule: () => {
      if (frameId !== null) return

      const currentToken = token + 1
      token = currentToken

      if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        if (fallback === 'microtask') {
          frameId = -1
          queueMicrotask(() => run(currentToken))
          return
        }
        flush()
        return
      }

      frameId = window.requestAnimationFrame(() => run(currentToken))
    }
  }
}
