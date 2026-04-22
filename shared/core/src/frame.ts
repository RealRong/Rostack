export type FrameTask = {
  cancel: () => void
  isScheduled: () => boolean
  schedule: () => void
}

export type FrameFallback = 'timeout' | 'microtask' | 'sync'

type FrameHandle =
  | {
      kind: 'frame'
      value: number
    }
  | {
      kind: 'timeout'
      value: ReturnType<typeof globalThis.setTimeout>
    }
  | {
      kind: 'microtask'
      value: number
    }

export const readMonotonicNow = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
)

export const createFrameTask = (
  flush: () => void,
  {
    fallback = 'timeout',
    timeoutMs = 16
  }: {
    fallback?: FrameFallback
    timeoutMs?: number
  } = {}
): FrameTask => {
  let handle: FrameHandle | null = null
  let token = 0

  const run = (currentToken: number) => {
    if (handle === null || currentToken !== token) {
      return
    }

    handle = null
    flush()
  }

  return {
    cancel: () => {
      if (handle === null) {
        return
      }

      const currentHandle = handle
      handle = null
      token += 1

      if (
        currentHandle.kind === 'frame'
        && typeof globalThis.cancelAnimationFrame === 'function'
      ) {
        globalThis.cancelAnimationFrame(currentHandle.value)
        return
      }

      if (currentHandle.kind === 'timeout') {
        globalThis.clearTimeout(currentHandle.value)
      }
    },
    isScheduled: () => handle !== null,
    schedule: () => {
      if (handle !== null) {
        return
      }

      const currentToken = token + 1
      token = currentToken

      if (typeof globalThis.requestAnimationFrame === 'function') {
        handle = {
          kind: 'frame',
          value: globalThis.requestAnimationFrame(() => run(currentToken))
        }
        return
      }

      if (fallback === 'timeout') {
        handle = {
          kind: 'timeout',
          value: globalThis.setTimeout(
            () => run(currentToken),
            Math.max(0, timeoutMs)
          )
        }
        return
      }

      if (fallback === 'microtask') {
        handle = {
          kind: 'microtask',
          value: currentToken
        }
        queueMicrotask(() => run(currentToken))
        return
      }

      flush()
    }
  }
}
