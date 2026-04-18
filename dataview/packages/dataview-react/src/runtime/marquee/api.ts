import {
  sameBox,
  samePoint
} from '@shared/core'
import type {
  MarqueeAdapter,
  MarqueeApi,
  MarqueeSessionState
} from '@dataview/react/runtime/marquee/types'
import {
  createNullableControllerStore
} from '@dataview/runtime/store'

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
    && left.baseSelection === right.baseSelection
}

export const createMarqueeApi = (): MarqueeApi => {
  const {
    store,
    get,
    clear
  } = createNullableControllerStore<MarqueeSessionState>({
    isEqual: sameSession
  })
  const adapters = new Map<string, MarqueeAdapter>()

  return {
    store,
    get,
    start: session => {
      store.set(session)
    },
    update: session => {
      store.set(session)
    },
    clear,
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
