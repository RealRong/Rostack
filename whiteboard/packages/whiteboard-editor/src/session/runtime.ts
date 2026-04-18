import {
  createValueStore,
  type ValueStore
} from '@shared/core'
import type { Viewport } from '@whiteboard/core/types'
import type { Tool } from '@whiteboard/editor/types/tool'
import type {
  BrushStylePatch,
  DrawState
} from '@whiteboard/editor/local/draw/state'
import type { DrawSlot } from '@whiteboard/editor/local/draw/model'
import {
  DEFAULT_DRAW_BRUSH,
  hasDrawBrush
} from '@whiteboard/editor/local/draw'
import {
  createDrawStateStore
} from '@whiteboard/editor/local/draw/runtime'
import {
  createEditState,
  type EditMutate,
  type EditSession
} from '@whiteboard/editor/local/session/edit'
import {
  createSelectionState
} from '@whiteboard/editor/local/session/selection'
import {
  createViewport,
  type ViewportRuntime
} from '@whiteboard/editor/local/viewport/runtime'

export type EditorLocalSource = {
  tool: ValueStore<Tool>
  draw: ReturnType<typeof createDrawStateStore>['store']
  selection: ReturnType<typeof createSelectionState>['source']
  edit: ValueStore<EditSession>
}

export type EditorLocalMutate = {
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
  edit: Pick<EditMutate, 'set' | 'input' | 'caret' | 'layout' | 'status' | 'clear'>
}

export type EditorLocal = {
  source: EditorLocalSource
  mutate: EditorLocalMutate
  viewport: ViewportRuntime
  reset: () => void
}

const resolveDrawBrush = (
  tool: Tool
) => tool.type === 'draw' && hasDrawBrush(tool.mode)
  ? tool.mode
  : DEFAULT_DRAW_BRUSH

export const createEditorLocal = ({
  initialTool,
  initialDrawState,
  initialViewport
}: {
  initialTool: Tool
  initialDrawState: DrawState
  initialViewport: Viewport
}): EditorLocal => {
  const tool = createValueStore<Tool>(initialTool)
  const draw = createDrawStateStore(initialDrawState)
  const selection = createSelectionState()
  const edit = createEditState()
  const viewport = createViewport({
    initialViewport
  })

  const source: EditorLocalSource = {
    tool,
    draw: draw.store,
    selection: selection.source,
    edit: edit.source
  }

  const mutate: EditorLocalMutate = {
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
      layout: edit.mutate.layout,
      status: edit.mutate.status,
      clear: edit.mutate.clear
    }
  }

  return {
    source,
    mutate,
    viewport,
    reset: () => {
      edit.mutate.clear()
      selection.mutate.clear()
    }
  }
}
