import {
  createValueStore
} from '@shared/core'
import {
  sameBox,
  sameOrder,
  samePoint
} from '@shared/core'
import type {
  MarqueeAdapter,
  MarqueeApi,
  MarqueeSessionState
} from '#react/runtime/marquee/types'

const sameSession = (
  left: MarqueeSessionState | null,
  right: MarqueeSessionState | null
) => {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return left.ownerViewId === right.ownerViewId
    && left.mode === right.mode
    && samePoint(left.start, right.start)
    && samePoint(left.current, right.current)
    && sameBox(left.box, right.box)
    && sameOrder(left.baseSelectedIds, right.baseSelectedIds)
}

export const createMarqueeApi = (): MarqueeApi => {
  const store = createValueStore<MarqueeSessionState | null>({
    initial: null,
    isEqual: sameSession
  })
  const adapters = new Map<string, MarqueeAdapter>()

  return {
    store,
    get: store.get,
    start: session => {
      store.set(session)
    },
    update: session => {
      store.set(session)
    },
    clear: () => {
      store.set(null)
    },
    registerAdapter: adapter => {
      adapters.set(adapter.viewId, adapter)
      return () => {
        const current = adapters.get(adapter.viewId)
        if (current === adapter) {
          adapters.delete(adapter.viewId)
        }
      }
    },
    getAdapter: viewId => adapters.get(viewId)
  }
}
