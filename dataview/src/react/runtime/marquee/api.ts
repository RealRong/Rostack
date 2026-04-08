import {
  createValueStore
} from '@shared/store'
import type {
  MarqueeAdapter,
  MarqueeApi,
  MarqueeSessionState
} from './types'

const sameIds = (
  left: readonly string[],
  right: readonly string[]
) => left.length === right.length
  && left.every((id, index) => id === right[index])

const samePoint = (
  left: MarqueeSessionState['start'],
  right: MarqueeSessionState['start']
) => left.x === right.x && left.y === right.y

const sameBox = (
  left: MarqueeSessionState['box'],
  right: MarqueeSessionState['box']
) => left.left === right.left
  && left.top === right.top
  && left.right === right.right
  && left.bottom === right.bottom
  && left.width === right.width
  && left.height === right.height

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
    && sameIds(left.baseSelectedIds, right.baseSelectedIds)
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
