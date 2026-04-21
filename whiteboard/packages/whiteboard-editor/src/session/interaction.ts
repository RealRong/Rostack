import { store } from '@shared/core'
import type { PointerSample } from '@whiteboard/editor/types/input'
import type { ActiveGesture } from '@whiteboard/editor/input/core/gesture'
import {
  createHoverStore,
  type HoverStore
} from '@whiteboard/editor/input/hover/store'
import type { InteractionMode } from '@whiteboard/editor/input/core/types'

type SessionMeta = Readonly<{
  mode: Exclude<InteractionMode, 'idle'>
  chrome?: boolean
}>

export type EditorInputState = {
  mode: store.ReadStore<InteractionMode>
  busy: store.ReadStore<boolean>
  chrome: store.ReadStore<boolean>
  gesture: store.ReadStore<ActiveGesture | null>
  pointer: store.ReadStore<PointerSample | null>
  space: store.ReadStore<boolean>
  hover: Pick<HoverStore, 'get' | 'subscribe'>
}

export type EditorInputStateController = {
  state: EditorInputState
  interaction: {
    setActive: (meta: SessionMeta | null) => void
    setGesture: (gesture: ActiveGesture | null) => void
  }
  pointer: {
    set: (sample: PointerSample) => void
    clear: () => void
  }
  space: {
    get: () => boolean
    set: (value: boolean) => void
  }
  hover: Pick<HoverStore, 'set' | 'reset'>
  reset: () => void
}

export const createEditorInputState = (): EditorInputStateController => {
  const active = store.createValueStore<SessionMeta | null>(null)
  const gesture = store.createValueStore<ActiveGesture | null>(null)
  const pointer = store.createValueStore<PointerSample | null>(null)
  const space = store.createValueStore(false)
  const hover = createHoverStore()

  return {
    state: {
      mode: store.createDerivedStore({
        get: () => store.read(active)?.mode ?? 'idle'
      }),
      busy: store.createDerivedStore({
        get: () => store.read(active) !== null
      }),
      chrome: store.createDerivedStore({
        get: () => {
          const current = store.read(active)
          return current === null
            || Boolean(current.chrome)
        }
      }),
      gesture,
      pointer,
      space,
      hover: {
        get: hover.get,
        subscribe: hover.subscribe
      }
    },
    interaction: {
      setActive: (meta) => {
        active.set(meta)
      },
      setGesture: (nextGesture) => {
        gesture.set(nextGesture)
      }
    },
    pointer: {
      set: (sample) => {
        pointer.set(sample)
      },
      clear: () => {
        pointer.set(null)
      }
    },
    space: {
      get: space.get,
      set: (value) => {
        space.set(value)
      }
    },
    hover: {
      set: hover.set,
      reset: hover.reset
    },
    reset: () => {
      active.set(null)
      gesture.set(null)
      pointer.set(null)
      space.set(false)
      hover.reset()
    }
  }
}
