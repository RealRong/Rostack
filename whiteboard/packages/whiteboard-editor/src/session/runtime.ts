import { store } from '@shared/core'
import type { SelectionInput, SelectionTarget } from '@whiteboard/core/selection'
import type { Viewport } from '@whiteboard/core/types'
import {
  EMPTY_HOVER_STATE,
  isHoverStateEqual,
  type HoverStore
} from '@whiteboard/editor/input/hover/store'
import type { Tool } from '@whiteboard/editor/types/tool'
import type {
  BrushStylePatch,
  DrawState
} from '@whiteboard/editor/session/draw/state'
import type { DrawSlot } from '@whiteboard/editor/session/draw/model'
import {
  DEFAULT_DRAW_BRUSH,
  hasDrawBrush
} from '@whiteboard/editor/session/draw/model'
import type {
  EditMutate,
  EditSession
} from '@whiteboard/editor/session/edit'
import type {
  ViewportRuntime
} from '@whiteboard/editor/session/viewport'
import type { ActiveGesture } from '@whiteboard/editor/input/core/gesture'
import type { InteractionMode } from '@whiteboard/editor/input/core/types'
import type { PointerSample } from '@whiteboard/editor/types/input'
import {
  composeEditorInputPreviewState,
  isEditorInputPreviewStateEqual
} from '@whiteboard/editor/session/preview/state'
import type {
  EditorInputPreviewState,
  EditorInputPreviewWrite
} from '@whiteboard/editor/session/preview/types'
import { createEditorStateRuntime } from '@whiteboard/editor/state-engine/runtime'

export type EditorSessionState = {
  tool: store.ValueStore<Tool>
  draw: store.ValueStore<DrawState>
  selection: store.ValueStore<SelectionTarget>
  edit: store.ValueStore<EditSession>
}

export type EditorSessionMutate = {
  tool: {
    set: (tool: Tool) => void
  }
  draw: {
    set: (state: DrawState) => void
    slot: (slot: DrawSlot) => void
    patch: (patch: BrushStylePatch) => void
  }
  selection: {
    replace: (input: SelectionInput) => boolean
    add: (input: SelectionInput) => boolean
    remove: (input: SelectionInput) => boolean
    toggle: (input: SelectionInput) => boolean
    clear: () => boolean
  }
  edit: Pick<EditMutate, 'set' | 'input' | 'caret' | 'composing' | 'clear'>
}

export type EditorSessionSelectionCommands = {
  replace: EditorSessionMutate['selection']['replace']
  add: EditorSessionMutate['selection']['add']
  remove: EditorSessionMutate['selection']['remove']
  toggle: EditorSessionMutate['selection']['toggle']
  clear: EditorSessionMutate['selection']['clear']
}

export type EditorSessionInteractionRead = {
  mode: store.ReadStore<InteractionMode>
  busy: store.ReadStore<boolean>
  chrome: store.ReadStore<boolean>
  gesture: store.ReadStore<ActiveGesture | null>
  pointer: store.ReadStore<PointerSample | null>
  space: store.ReadStore<boolean>
  hover: Pick<HoverStore, 'get' | 'subscribe'>
}

export type EditorSessionInteractionWrite = {
  setActive: (meta: Readonly<{
    mode: Exclude<InteractionMode, 'idle'>
    chrome?: boolean
  }> | null) => void
  setGesture: (gesture: ActiveGesture | null) => void
  setPointer: (sample: PointerSample | null) => void
  setSpace: (value: boolean) => void
  setHover: HoverStore['set']
  clearHover: () => void
  reset: () => void
}

export type EditorSession = {
  state: EditorSessionState
  mutate: EditorSessionMutate
  stateEngine: Pick<ReturnType<typeof createEditorStateRuntime>, 'engine' | 'commits'>
  commands: {
    selection: EditorSessionSelectionCommands
  }
  viewport: ViewportRuntime
  interaction: {
    read: EditorSessionInteractionRead
    write: EditorSessionInteractionWrite
  }
  preview: {
    state: store.ReadStore<EditorInputPreviewState>
    write: EditorInputPreviewWrite
  }
  resetDocument: () => void
  resetInteraction: () => void
  reset: () => void
  dispose: () => void
}

const resolveDrawBrush = (
  tool: Tool
) => tool.type === 'draw' && hasDrawBrush(tool.mode)
  ? tool.mode
  : DEFAULT_DRAW_BRUSH

const createSelectionCommands = (
  mutate: EditorSessionMutate
): EditorSessionSelectionCommands => {
  const applySelection = <TArgs extends unknown[]>(
    apply: (...args: TArgs) => boolean
  ) => (
    ...args: TArgs
  ) => {
    if (!apply(...args)) {
      return false
    }

    mutate.edit.clear()
    return true
  }

  return {
    replace: applySelection(mutate.selection.replace),
    add: applySelection(mutate.selection.add),
    remove: applySelection(mutate.selection.remove),
    toggle: applySelection(mutate.selection.toggle),
    clear: applySelection(mutate.selection.clear)
  }
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
  const active = store.createValueStore<{
    mode: Exclude<InteractionMode, 'idle'>
    chrome?: boolean
  } | null>(null)
  const gesture = store.createValueStore<ActiveGesture | null>(null)
  const pointer = store.createValueStore<PointerSample | null>(null)
  const mode = store.createDerivedStore<InteractionMode>({
    get: () => stateRuntime.stores.interaction.store.get().mode,
    isEqual: (left, right) => left === right
  })
  const chrome = store.createDerivedStore<boolean>({
    get: () => stateRuntime.stores.interaction.store.get().chrome,
    isEqual: (left, right) => left === right
  })
  const space = store.createDerivedStore<boolean>({
    get: () => stateRuntime.stores.interaction.store.get().space,
    isEqual: (left, right) => left === right
  })
  const hover = store.createDerivedStore({
    get: () => stateRuntime.stores.interaction.store.get().hover,
    isEqual: isHoverStateEqual
  })
  const busy = store.createDerivedStore<boolean>({
    get: () => active.get() !== null,
    isEqual: (left, right) => left === right
  })
  const previewState = store.createDerivedStore<EditorInputPreviewState>({
    get: () => composeEditorInputPreviewState({
      base: stateRuntime.stores.preview.store.get(),
      gesture: gesture.get(),
      hover: stateRuntime.stores.interaction.store.get().hover
    }),
    isEqual: isEditorInputPreviewStateEqual
  })
  const preview = {
    state: {
      get: previewState.get,
      subscribe: previewState.subscribe
    },
    write: {
      set: stateRuntime.mutate.preview.set,
      reset: stateRuntime.mutate.preview.reset
    }
  }
  const interactionRead: EditorSessionInteractionRead = {
    mode,
    busy,
    chrome,
    gesture,
    pointer,
    space,
    hover: {
      get: hover.get,
      subscribe: hover.subscribe
    }
  }

  const state: EditorSessionState = {
    tool: stateRuntime.state.tool,
    draw: stateRuntime.state.draw,
    selection: stateRuntime.state.selection,
    edit: stateRuntime.state.edit
  }

  const mutate: EditorSessionMutate = {
    tool: stateRuntime.mutate.tool,
    draw: {
      set: (nextState) => {
        stateRuntime.mutate.draw.set(nextState)
      },
      slot: (slot) => {
        stateRuntime.mutate.draw.slot(resolveDrawBrush(state.tool.get()), slot)
      },
      patch: (patch) => {
        const brush = resolveDrawBrush(state.tool.get())
        const currentSlot = state.draw.get()[brush].slot
        stateRuntime.mutate.draw.patch(brush, currentSlot, patch)
      }
    },
    selection: stateRuntime.mutate.selection,
    edit: stateRuntime.mutate.edit
  }
  const commands = {
    selection: createSelectionCommands(mutate)
  }

  const resetDocument = () => {
    mutate.edit.clear()
    mutate.selection.clear()
  }

  const resetInteraction = () => {
    active.set(null)
    gesture.set(null)
    pointer.set(null)
    stateRuntime.mutate.interaction.reset()
    preview.write.reset()
  }

  return {
    state,
    mutate,
    stateEngine: {
      engine: stateRuntime.engine,
      commits: stateRuntime.commits
    },
    commands,
    viewport: stateRuntime.viewport,
    interaction: {
      read: interactionRead,
      write: {
        setActive: (meta) => {
          active.set(meta)
          stateRuntime.mutate.interaction.setActive(meta)
        },
        setGesture: (nextGesture) => {
          gesture.set(nextGesture)
        },
        setPointer: (sample) => {
          if (sample) {
            pointer.set(sample)
            return
          }

          pointer.set(null)
        },
        setSpace: stateRuntime.mutate.interaction.setSpace,
        setHover: stateRuntime.mutate.interaction.setHover,
        clearHover: () => {
          stateRuntime.mutate.interaction.setHover(EMPTY_HOVER_STATE)
        },
        reset: resetInteraction
      }
    },
    preview,
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
