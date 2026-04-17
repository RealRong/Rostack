import {
  createValueStore,
  type ValueStore
} from '@shared/core'
import type { Viewport } from '@whiteboard/core/types'
import type { EditorState } from '@whiteboard/editor/types/editor'
import type { EditorQueryRead } from '@whiteboard/editor/query'
import type { PointerSample } from '@whiteboard/editor/types/input'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { DrawState } from '@whiteboard/editor/local/draw/state'
import { createLocalDrawActions, type LocalDrawActions } from '@whiteboard/editor/local/actions/draw'
import {
  createLocalFeedbackActions,
  type LocalFeedbackActions
} from '@whiteboard/editor/local/actions/feedback'
import { createLocalEditActions, type LocalEditActions } from '@whiteboard/editor/local/actions/edit'
import {
  createLocalSessionActions,
  type LocalSessionActions
} from '@whiteboard/editor/local/actions/session'
import {
  createLocalViewportActions,
  type LocalViewportActions
} from '@whiteboard/editor/local/actions/viewport'
import {
  createDrawStateStore,
  type DrawStateStore
} from '@whiteboard/editor/local/draw/runtime'
import { createFeedback, type EditorFeedbackRuntime } from '@whiteboard/editor/local/feedback'
import { createEditState, type EditState } from '@whiteboard/editor/local/session/edit'
import {
  createSelectionState,
  type SelectionState
} from '@whiteboard/editor/local/session/selection'
import {
  createViewport,
  type ViewportRuntime
} from '@whiteboard/editor/local/viewport/runtime'
import type {
  InteractionBinding,
  InteractionRuntime
} from '@whiteboard/editor/input/core/types'
import { createInteractionRuntime } from '@whiteboard/editor/input/core/runtime'
import { createHoverStore, type HoverStore } from '@whiteboard/editor/input/hover/store'
import type { LayoutRuntime } from '@whiteboard/editor/layout/runtime'

type ReadNodeEdge = Pick<EditorQueryRead, 'node' | 'edge'>

export type EditorLocalState = {
  tool: ValueStore<Tool>
  draw: DrawStateStore
  selection: SelectionState
  edit: EditState
  pointer: ValueStore<PointerSample | null>
  space: ValueStore<boolean>
}

export type EditorLocalActions = {
  session: LocalSessionActions
  edit: LocalEditActions
  viewport: LocalViewportActions
  draw: LocalDrawActions
  feedback: LocalFeedbackActions
}

export type EditorLocalRuntime = {
  state: EditorLocalState
  stores: Pick<EditorState, 'tool' | 'draw' | 'edit' | 'selection'> & {
    pointer: ValueStore<PointerSample | null>
    space: ValueStore<boolean>
  }
  viewport: ViewportRuntime
  interaction: InteractionRuntime
  hover: HoverStore
  feedback: EditorFeedbackRuntime
  actions: EditorLocalActions
  bindQuery: (read: EditorQueryRead) => void
  bindLayout: (layout: LayoutRuntime) => void
  bindInteractions: (bindings: readonly InteractionBinding[]) => void
  reset: () => void
  reconcileAfterCommit: (read: ReadNodeEdge) => void
}

export const createLocalRuntime = ({
  initialTool,
  initialDrawState,
  initialViewport,
  registry
}: {
  initialTool: Tool
  initialDrawState: DrawState
  initialViewport: Viewport
  registry: NodeRegistry
}): EditorLocalRuntime => {
  const tool = createValueStore<Tool>(initialTool)
  const draw = createDrawStateStore(initialDrawState)
  const selection = createSelectionState()
  const edit = createEditState()
  const pointer = createValueStore<PointerSample | null>(null)
  const space = createValueStore(false)
  const viewport = createViewport({
    initialViewport
  })

  let readRuntime: EditorQueryRead | null = null
  let layoutRuntime: LayoutRuntime | null = null
  let bindings: readonly InteractionBinding[] = []

  const state: EditorLocalState = {
    tool,
    draw,
    selection,
    edit,
    pointer,
    space
  }
  const stores: EditorLocalRuntime['stores'] = {
    tool,
    draw: draw.store,
    edit: edit.source,
    selection: selection.source,
    pointer,
    space
  }
  const interaction = createInteractionRuntime({
    getViewport: () => viewport.input,
    getBindings: () => bindings,
    space
  })
  const hover = createHoverStore()
  const feedback = createFeedback({
    viewport: viewport.read,
    gesture: interaction.gesture,
    hover
  })
  const actions: EditorLocalActions = {
    session: createLocalSessionActions({
      state,
      getRead: () => readRuntime
    }),
    edit: createLocalEditActions({
      state,
      registry,
      getRead: () => readRuntime,
      getLayout: () => layoutRuntime
    }),
    viewport: createLocalViewportActions({
      state,
      viewport
    }),
    draw: createLocalDrawActions({
      state
    }),
    feedback: createLocalFeedbackActions({
      feedback
    })
  }

  return {
    state,
    stores,
    viewport,
    interaction,
    hover,
    feedback,
    actions,
    bindQuery: (read) => {
      readRuntime = read
    },
    bindLayout: (layout) => {
      layoutRuntime = layout
    },
    bindInteractions: (nextBindings) => {
      bindings = nextBindings
    },
    reset: () => {
      pointer.set(null)
      space.set(false)
      interaction.cancel()
      hover.reset()
      feedback.reset()
      edit.mutate.clear()
      selection.mutate.clear()
    },
    reconcileAfterCommit: (read) => {
      selection.mutate.reconcile(read)

      const currentEdit = edit.source.get()
      if (
        currentEdit
        && (
          (currentEdit.kind === 'node' && !read.node.item.get(currentEdit.nodeId))
          || (currentEdit.kind === 'edge-label' && !read.edge.item.get(currentEdit.edgeId))
        )
      ) {
        edit.mutate.clear()
      }
    }
  }
}
