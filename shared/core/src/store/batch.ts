import {
  notifyListeners
} from './listeners'
import {
  getStoreRuntime,
  type RuntimeRoot
} from './runtime'
import type {
  Listener
} from './types'

const flush = () => {
  const runtime = getStoreRuntime()
  if (runtime.flushing) {
    return
  }

  runtime.flushing = true
  try {
    while (
      runtime.pendingRoots.size > 0
      || runtime.pendingListeners.size > 0
    ) {
      if (runtime.pendingRoots.size > 0) {
        const roots = Array.from(runtime.pendingRoots)
        runtime.pendingRoots.clear()

        roots.forEach(root => {
          if (root.hasSubscribers()) {
            root.refresh(true)
          }
        })
      }

      if (runtime.pendingListeners.size > 0) {
        const listeners = Array.from(runtime.pendingListeners)
        runtime.pendingListeners.clear()
        runtime.revision += 1
        notifyListeners(listeners)
      }
    }
  } finally {
    runtime.flushing = false
  }
}

const scheduleFlush = () => {
  const runtime = getStoreRuntime()
  if (runtime.batchDepth > 0 || runtime.flushing) {
    return
  }

  flush()
}

export const queueListeners = (
  listeners: Iterable<Listener>
) => {
  const runtime = getStoreRuntime()
  let changed = false

  for (const listener of listeners) {
    const sizeBefore = runtime.pendingListeners.size
    runtime.pendingListeners.add(listener)
    if (runtime.pendingListeners.size !== sizeBefore) {
      changed = true
    }
  }

  if (!changed) {
    return
  }

  scheduleFlush()
}

export const enqueueRoot = (
  root: RuntimeRoot
) => {
  const runtime = getStoreRuntime()
  const sizeBefore = runtime.pendingRoots.size
  runtime.pendingRoots.add(root)
  if (runtime.pendingRoots.size === sizeBefore) {
    return
  }

  scheduleFlush()
}

export const batch = <T,>(
  fn: () => T
): T => {
  const runtime = getStoreRuntime()
  runtime.batchDepth += 1

  try {
    return fn()
  } finally {
    runtime.batchDepth -= 1
    if (runtime.batchDepth === 0) {
      flush()
    }
  }
}
