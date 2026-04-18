import type { Engine } from '@whiteboard/engine'
import type { Viewport } from '@whiteboard/core/types'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type { Tool } from '@whiteboard/editor/types/tool'
import {
  DEFAULT_DRAW_STATE,
  type DrawState
} from '@whiteboard/editor/local/draw/state'
import { createSnapRuntime } from '@whiteboard/editor/input/core/snap'
import {
  createEditorInput,
  type EditorInputRuntime
} from '@whiteboard/editor/input/runtime'
import {
  createEditorInputState
} from '@whiteboard/editor/input/state'
import { createEditorLocal, type EditorLocal } from '@whiteboard/editor/local/runtime'
import { createEditorQuery, type EditorQuery } from '@whiteboard/editor/query'
import { createEditorCommands, type EditorCommands } from '@whiteboard/editor/command'
import { createEditorLayout, type EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { LayoutBackend } from '@whiteboard/editor/types/layout'
import { createEditorActions } from '@whiteboard/editor/action'
import type { EditorActions } from '@whiteboard/editor/types/editor'
import { createEditorLifecycle, type EditorLifecycle } from '@whiteboard/editor/lifecycle'
import {
  createEditorInputPreview
} from '@whiteboard/editor/input/preview'
import type {
  EditCapability,
  EditCaret,
  EditField,
  EditLayout
} from '@whiteboard/editor/local/session/edit'

export type EditorServices = {
  engine: Engine
  local: EditorLocal
  input: EditorInputRuntime
  layout: EditorLayout
  query: EditorQuery
  snap: ReturnType<typeof createSnapRuntime>
  commands: EditorCommands
  actions: EditorActions
  lifecycle: EditorLifecycle
}

const DEFAULT_EDGE_LABEL_CAPABILITY: EditCapability = {
  placeholder: 'Label',
  multiline: true,
  empty: 'remove'
}

const resolveNodeCapability = ({
  registry,
  nodeType,
  field
}: {
  registry: Pick<NodeRegistry, 'get'>
  nodeType: Parameters<Pick<NodeRegistry, 'get'>['get']>[0]
  field: EditField
}) => registry.get(nodeType)?.edit?.fields?.[field]

const createCommandSession = ({
  local,
  query,
  registry,
  layout
}: {
  local: EditorLocal
  query: Pick<EditorQuery, 'node' | 'edge'>
  registry: Pick<NodeRegistry, 'get'>
  layout: Pick<EditorLayout, 'editNode'>
}) => ({
  selection: {
    replace: (input: {
      nodeIds?: readonly string[]
      edgeIds?: readonly string[]
    }) => {
      local.mutate.edit.clear()
      local.mutate.selection.replace(input)
    },
    add: (input: {
      nodeIds?: readonly string[]
      edgeIds?: readonly string[]
    }) => {
      local.mutate.edit.clear()
      local.mutate.selection.add(input)
    },
    remove: (input: {
      nodeIds?: readonly string[]
      edgeIds?: readonly string[]
    }) => {
      local.mutate.edit.clear()
      local.mutate.selection.remove(input)
    },
    toggle: (input: {
      nodeIds?: readonly string[]
      edgeIds?: readonly string[]
    }) => {
      local.mutate.edit.clear()
      local.mutate.selection.toggle(input)
    },
    selectAll: () => {
      local.mutate.edit.clear()
      local.mutate.selection.replace({
        nodeIds: query.node.list.get(),
        edgeIds: query.edge.list.get()
      })
    },
    clear: () => {
      local.mutate.edit.clear()
      local.mutate.selection.clear()
    }
  },
  edit: {
    startNode: (
      nodeId: string,
      field: EditField,
      options?: {
        caret?: import('@whiteboard/editor/local/session/edit').EditCaret
      }
    ) => {
      const item = query.node.item.get(nodeId)
      if (!item) {
        return
      }

      const capabilities = resolveNodeCapability({
        registry,
        nodeType: item.node.type,
        field
      })
      if (!capabilities) {
        return
      }

      const text = typeof item.node.data?.[field] === 'string'
        ? item.node.data[field] as string
        : ''
      const nextLayout = layout.editNode({
        nodeId,
        field,
        text
      })

      local.mutate.edit.set({
        kind: 'node',
        nodeId,
        field,
        initial: {
          text
        },
        draft: {
          text
        },
        layout: {
          size: nextLayout?.size ?? {
            width: item.rect.width,
            height: item.rect.height
          },
          fontSize: nextLayout?.fontSize ?? (
            typeof item.node.style?.fontSize === 'number'
              ? item.node.style.fontSize
              : undefined
          ),
          wrapWidth: nextLayout?.wrapWidth,
          composing: false
        },
        caret: options?.caret ?? { kind: 'end' },
        status: 'active',
        capabilities
      })
    },
    startEdgeLabel: (
      edgeId: string,
      labelId: string,
      options?: {
        caret?: import('@whiteboard/editor/local/session/edit').EditCaret
      }
    ) => {
      const edge = query.edge.item.get(edgeId)?.edge
      const label = edge?.labels?.find((entry) => entry.id === labelId)
      if (!edge || !label) {
        return
      }

      const text = typeof label.text === 'string' ? label.text : ''

      local.mutate.edit.set({
        kind: 'edge-label',
        edgeId,
        labelId,
        initial: {
          text
        },
        draft: {
          text
        },
        layout: {
          composing: false
        },
        caret: options?.caret ?? { kind: 'end' },
        status: 'active',
        capabilities: DEFAULT_EDGE_LABEL_CAPABILITY
      })
    },
    input: (text: string) => {
      local.mutate.edit.input(text)
    },
    caret: (caret: EditCaret) => {
      local.mutate.edit.caret(caret)
    },
    layout: (patch: Partial<EditLayout>) => {
      local.mutate.edit.layout(patch)
    },
    clear: () => {
      local.mutate.edit.clear()
    }
  }
})

export const createEditorServices = ({
  engine,
  initialTool,
  initialDrawState = DEFAULT_DRAW_STATE,
  initialViewport,
  registry,
  services,
}: {
  engine: Engine
  initialTool: Tool
  initialDrawState?: DrawState
  initialViewport: Viewport
  registry: NodeRegistry
  services?: {
    layout?: LayoutBackend
  }
}): EditorServices => {
  const local = createEditorLocal({
    initialTool,
    initialDrawState,
    initialViewport
  })
  const inputState = createEditorInputState()
  const inputPreview = createEditorInputPreview({
    viewport: local.viewport.read,
    gesture: inputState.state.gesture,
    hover: inputState.state.hover
  })
  const layout = createEditorLayout({
    read: {
      node: {
        committed: engine.read.node.item
      }
    },
    registry,
    backend: services?.layout
  })
  const query = createEditorQuery({
    engineRead: engine.read,
    registry,
    history: engine.history,
    local,
    input: {
      state: inputState.state,
      preview: inputPreview
    },
    layout
  })
  const snap = createSnapRuntime({
    readZoom: () => local.viewport.read.get().zoom,
    node: {
      config: engine.config.node,
      query: engine.read.index.snap.inRect
    },
    edge: {
      config: engine.config.edge,
      nodeSize: engine.config.nodeSize,
      query: query.edge.connectCandidates
    }
  })

  const commandSession = createCommandSession({
    local,
    query,
    registry,
    layout
  })

  const commands = createEditorCommands({
    engine,
    query,
    layout,
    preview: inputPreview.write,
    session: commandSession
  })

  let servicesRuntime = null as EditorServices | null

  const lifecycle = createEditorLifecycle({
    engine,
    local,
    input: {
      reset: () => {
        servicesRuntime?.input.reset()
      }
    },
    query
  })

  const actions = createEditorActions({
    engine,
    local,
    query,
    layout,
    commands,
    registry,
    dispose: lifecycle.dispose
  })

  const baseServices = {
    engine,
    local,
    layout,
    query,
    snap,
    commands,
    actions,
    lifecycle
  }

  const input = createEditorInput({
    ...baseServices,
    state: inputState,
    preview: inputPreview
  })

  servicesRuntime = {
    ...baseServices,
    input
  }

  return servicesRuntime
}
