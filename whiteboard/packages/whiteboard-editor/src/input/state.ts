import {
  createDerivedStore,
  createValueStore,
  read,
  type ReadStore
} from '@shared/core'
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
  mode: ReadStore<InteractionMode>
  busy: ReadStore<boolean>
  chrome: ReadStore<boolean>
  gesture: ReadStore<ActiveGesture | null>
  pointer: ReadStore<PointerSample | null>
  space: ReadStore<boolean>
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
  const active = createValueStore<SessionMeta | null>(null)
  const gesture = createValueStore<ActiveGesture | null>(null)
  const pointer = createValueStore<PointerSample | null>(null)
  const space = createValueStore(false)
  const hover = createHoverStore()

  return {
    state: {
      mode: createDerivedStore({
        get: () => read(active)?.mode ?? 'idle'
      }),
      busy: createDerivedStore({
        get: () => read(active) !== null
      }),
      chrome: createDerivedStore({
        get: () => {
          const current = read(active)
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
