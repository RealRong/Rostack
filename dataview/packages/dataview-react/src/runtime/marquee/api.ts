import {
  sameBox,
  samePoint
} from '@shared/core'
import type { ItemId } from '@dataview/engine'
import type {
  MarqueeApi,
  MarqueeScene,
  MarqueeSessionState
} from '@dataview/react/runtime/marquee/types'
import {
  createNullableControllerStore
} from '@dataview/runtime/store'

const sameHitIds = (
  left: readonly ItemId[],
  right: readonly ItemId[]
) => left.length === right.length
  && left.every((id, index) => id === right[index])

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

  return left.mode === right.mode
    && samePoint(left.start, right.start)
    && samePoint(left.current, right.current)
    && sameBox(left.rect, right.rect)
    && left.baseSelection === right.baseSelection
    && sameHitIds(left.hitIds, right.hitIds)
}

export const createMarqueeApi = (): MarqueeApi => {
  const {
    store,
    get,
    clear
  } = createNullableControllerStore<MarqueeSessionState>({
    isEqual: sameSession
  })
  let activeScene: MarqueeScene | undefined

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
    registerScene: scene => {
      activeScene = scene
      return () => {
        if (activeScene === scene) {
          activeScene = undefined
          clear()
        }
      }
    },
    getScene: () => activeScene
  }
}
