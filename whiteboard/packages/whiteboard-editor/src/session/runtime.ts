import { store } from '@shared/core'
import type { Viewport } from '@whiteboard/core/types'
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
import {
  createDrawStateStore
} from '@whiteboard/editor/session/draw/runtime'
import {
  createEditState,
  type EditMutate,
  type EditSession
} from '@whiteboard/editor/session/edit'
import {
  createSelectionState
} from '@whiteboard/editor/session/selection'
import {
  createViewport,
  type ViewportRuntime
} from '@whiteboard/editor/session/viewport'
import type { ActiveGesture } from '@whiteboard/editor/input/core/gesture'
import type { InteractionMode } from '@whiteboard/editor/input/core/types'
import type { HoverStore } from '@whiteboard/editor/input/hover/store'
import type { PointerSample } from '@whiteboard/editor/types/input'
import {
  createEditorInputState,
  type EditorInputStateController
} from '@whiteboard/editor/session/interaction'
import {
  createEditorInputPreview,
  type EditorInputPreview
} from '@whiteboard/editor/session/preview'

export type EditorSessionState = {
  tool: store.ValueStore<Tool>
  draw: ReturnType<typeof createDrawStateStore>['store']
  selection: ReturnType<typeof createSelectionState>['source']
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
    replace: Parameters<ReturnType<typeof createSelectionState>['mutate']['replace']>[0] extends never
      ? never
      : (input: Parameters<ReturnType<typeof createSelectionState>['mutate']['replace']>[0]) => boolean
    add: (input: Parameters<ReturnType<typeof createSelectionState>['mutate']['add']>[0]) => boolean
    remove: (input: Parameters<ReturnType<typeof createSelectionState>['mutate']['remove']>[0]) => boolean
    toggle: (input: Parameters<ReturnType<typeof createSelectionState>['mutate']['toggle']>[0]) => boolean
    clear: () => boolean
  }
  edit: Pick<EditMutate, 'set' | 'input' | 'caret' | 'composing' | 'status' | 'clear'>
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
  setActive: EditorInputStateController['interaction']['setActive']
  setGesture: EditorInputStateController['interaction']['setGesture']
  setPointer: (sample: PointerSample | null) => void
  setSpace: (value: boolean) => void
  setHover: HoverStore['set']
  clearHover: () => void
  reset: () => void
}

export type EditorSession = {
  state: EditorSessionState
  mutate: EditorSessionMutate
  viewport: ViewportRuntime
  interaction: {
    read: EditorSessionInteractionRead
    write: EditorSessionInteractionWrite
  }
  preview: EditorInputPreview
  resetDocument: () => void
  resetInteraction: () => void
  reset: () => void
}

const resolveDrawBrush = (
  tool: Tool
) => tool.type === 'draw' && hasDrawBrush(tool.mode)
  ? tool.mode
  : DEFAULT_DRAW_BRUSH

export const createEditorSession = ({
  initialTool,
  initialDrawState,
  initialViewport
}: {
  initialTool: Tool
  initialDrawState: DrawState
  initialViewport: Viewport
}): EditorSession => {
  const tool = store.createValueStore<Tool>(initialTool)
  const draw = createDrawStateStore(initialDrawState)
  const selection = createSelectionState()
  const edit = createEditState()
  const viewport = createViewport({
    initialViewport
  })
  const interaction = createEditorInputState()
  const preview = createEditorInputPreview({
    viewport: viewport.read,
    gesture: interaction.state.gesture,
    hover: interaction.state.hover
  })

  const state: EditorSessionState = {
    tool,
    draw: draw.store,
    selection: selection.source,
    edit: edit.source
  }

  const mutate: EditorSessionMutate = {
    tool: {
      set: (nextTool) => {
        tool.set(nextTool)
      }
    },
    draw: {
      set: (nextState) => {
        draw.commands.set(nextState)
      },
      slot: (slot) => {
        draw.commands.slot(resolveDrawBrush(tool.get()), slot)
      },
      patch: (patch) => {
        const brush = resolveDrawBrush(tool.get())
        const currentSlot = draw.store.get()[brush].slot
        draw.commands.patch(brush, currentSlot, patch)
      }
    },
    selection: {
      replace: selection.mutate.replace,
      add: selection.mutate.add,
      remove: selection.mutate.remove,
      toggle: selection.mutate.toggle,
      clear: selection.mutate.clear
    },
    edit: {
      set: edit.mutate.set,
      input: edit.mutate.input,
      caret: edit.mutate.caret,
      composing: edit.mutate.composing,
      status: edit.mutate.status,
      clear: edit.mutate.clear
    }
  }

  const resetDocument = () => {
    edit.mutate.clear()
    selection.mutate.clear()
  }

  const resetInteraction = () => {
    interaction.reset()
    preview.write.reset()
  }

  return {
    state,
    mutate,
    viewport,
    interaction: {
      read: interaction.state,
      write: {
        setActive: interaction.interaction.setActive,
        setGesture: interaction.interaction.setGesture,
        setPointer: (sample) => {
          if (sample) {
            interaction.pointer.set(sample)
            return
          }

          interaction.pointer.clear()
        },
        setSpace: interaction.space.set,
        setHover: interaction.hover.set,
        clearHover: interaction.hover.reset,
        reset: interaction.reset
      }
    },
    preview,
    resetDocument,
    resetInteraction,
    reset: () => {
      resetDocument()
      resetInteraction()
    }
  }
}
