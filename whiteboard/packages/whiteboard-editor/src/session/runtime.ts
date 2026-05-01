import { store } from '@shared/core'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { Viewport } from '@whiteboard/core/types'
import {
  EMPTY_HOVER_STATE,
  isHoverStateEqual,
  type HoverStore
} from '@whiteboard/editor/input/hover/store'
import type { ActiveGesture } from '@whiteboard/editor/input/core/gesture'
import type { InteractionMode } from '@whiteboard/editor/input/core/types'
import type { PointerSample } from '@whiteboard/editor/types/input'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { DrawState } from '@whiteboard/editor/session/draw/state'
import type { EditSession } from '@whiteboard/editor/session/edit'
import {
  composeEditorInputPreviewState,
  EMPTY_PREVIEW_STATE,
  isEditorInputPreviewStateEqual
} from '@whiteboard/editor/session/preview/state'
import type { EditorInputPreviewState } from '@whiteboard/editor/session/preview/types'
import type { ViewportRuntime } from '@whiteboard/editor/session/viewport'
import { createEditorStateRuntime } from '@whiteboard/editor/state-engine/runtime'
import type { EditorCommand } from '@whiteboard/editor/state-engine/intents'

export type EditorSessionState = {
  tool: store.ValueStore<Tool>
  draw: store.ValueStore<DrawState>
  selection: store.ValueStore<SelectionTarget>
  edit: store.ValueStore<EditSession>
}

export type EditorSessionInteractionRead = {
  mode: store.ReadStore<InteractionMode>
  busy: store.ReadStore<boolean>
  chrome: store.ReadStore<boolean>
  hover: Pick<HoverStore, 'get' | 'subscribe'>
  space: store.ReadStore<boolean>
}

export type EditorSessionTransient = {
  gesture: Pick<store.ReadStore<ActiveGesture | null>, 'get' | 'subscribe'>
  setGesture: (gesture: ActiveGesture | null) => void
  pointer: Pick<store.ReadStore<PointerSample | null>, 'get' | 'subscribe'>
  setPointer: (sample: PointerSample | null) => void
}

export type EditorSession = {
  state: EditorSessionState
  interaction: {
    read: EditorSessionInteractionRead
  }
  transient: EditorSessionTransient
  preview: Pick<store.ReadStore<EditorInputPreviewState>, 'get' | 'subscribe'>
  dispatch: (command: EditorCommand | readonly EditorCommand[]) => void
  commits: Pick<ReturnType<typeof createEditorStateRuntime>['commits'], 'subscribe'>
  viewport: ViewportRuntime
  resetDocument: () => void
  resetInteraction: () => void
  reset: () => void
  dispose: () => void
}

export const createEditorSession = ({
  initialTool,
  initialDrawState,
  initialViewport
}: {
  initialTool: Tool
  initialDrawState: DrawState
  initialViewport: Viewport
}): EditorSession => {
  const stateRuntime = createEditorStateRuntime({
    initialTool,
    initialDrawState,
    initialViewport
  })
  const gesture = store.createValueStore<ActiveGesture | null>(null)
  const pointer = store.createValueStore<PointerSample | null>(null)
  const mode = store.createDerivedStore<InteractionMode>({
    get: () => store.read(stateRuntime.stores.interaction.store).mode,
    isEqual: (left, right) => left === right
  })
  const chrome = store.createDerivedStore<boolean>({
    get: () => store.read(stateRuntime.stores.interaction.store).chrome,
    isEqual: (left, right) => left === right
  })
  const space = store.createDerivedStore<boolean>({
    get: () => store.read(stateRuntime.stores.interaction.store).space,
    isEqual: (left, right) => left === right
  })
  const hover = store.createDerivedStore({
    get: () => store.read(stateRuntime.stores.interaction.store).hover,
    isEqual: isHoverStateEqual
  })
  const busy = store.createDerivedStore<boolean>({
    get: () => store.read(mode) !== 'idle',
    isEqual: (left, right) => left === right
  })
  const preview = store.createDerivedStore<EditorInputPreviewState>({
    get: () => composeEditorInputPreviewState({
      base: store.read(stateRuntime.stores.preview.store),
      gesture: store.read(gesture),
      hover: store.read(stateRuntime.stores.interaction.store).hover
    }),
    isEqual: isEditorInputPreviewStateEqual
  })

  const state: EditorSessionState = {
    tool: stateRuntime.state.tool,
    draw: stateRuntime.state.draw,
    selection: stateRuntime.state.selection,
    edit: stateRuntime.state.edit
  }

  const dispatch = (
    command: EditorCommand | readonly EditorCommand[]
  ) => {
    stateRuntime.dispatch(command)
  }

  const resetDocument = () => {
    dispatch([
      {
        type: 'edit.set',
        edit: null
      },
      {
        type: 'selection.set',
        selection: {
          nodeIds: [],
          edgeIds: []
        }
      }
    ])
  }

  const resetInteraction = () => {
    gesture.set(null)
    pointer.set(null)
    dispatch([
      {
        type: 'interaction.set',
        interaction: {
          mode: 'idle',
          chrome: false,
          space: false,
          hover: EMPTY_HOVER_STATE
        }
      },
      {
        type: 'preview.set',
        preview: EMPTY_PREVIEW_STATE
      }
    ])
  }

  return {
    state,
    interaction: {
      read: {
        mode,
        busy,
        chrome,
        space,
        hover: {
          get: hover.get,
          subscribe: hover.subscribe
        }
      }
    },
    transient: {
      gesture: {
        get: gesture.get,
        subscribe: gesture.subscribe
      },
      setGesture: (nextGesture) => {
        gesture.set(nextGesture)
      },
      pointer: {
        get: pointer.get,
        subscribe: pointer.subscribe
      },
      setPointer: (sample) => {
        pointer.set(sample ?? null)
      }
    },
    preview: {
      get: preview.get,
      subscribe: preview.subscribe
    },
    dispatch,
    commits: stateRuntime.commits,
    viewport: stateRuntime.viewport,
    resetDocument,
    resetInteraction,
    reset: () => {
      resetDocument()
      resetInteraction()
    },
    dispose: () => {
      stateRuntime.dispose()
    }
  }
}
