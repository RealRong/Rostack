import { store } from '@shared/core'
import type { EngineRead } from '@whiteboard/engine'
import type { HistoryApi } from '@whiteboard/history'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type {
  DrawState
} from '@whiteboard/editor/session/draw/state'
import type {
  DrawMode
} from '@whiteboard/editor/session/draw/model'
import type {
  Tool
} from '@whiteboard/editor/types/tool'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import {
  createEditRead,
  type EditorEditRead
} from '@whiteboard/editor/query/edit/read'
import {
  createNodeTypeRead,
  createNodeRead,
  type NodePresentationRead
} from '@whiteboard/editor/query/node/read'
import {
  createEdgeRead,
  type EdgePresentationRead
} from '@whiteboard/editor/query/edge/read'
import {
  createMindmapRead,
  type MindmapPresentationRead
} from '@whiteboard/editor/query/mindmap/read'
import {
  createSelectionModelRead,
} from '@whiteboard/editor/query/selection/model'
import {
  createSelectionRead,
  type SelectionRead
} from '@whiteboard/editor/query/selection/read'
import {
  createSelectionRuntimeRead
} from '@whiteboard/editor/query/selection/runtime'
import {
  createTargetRead,
  type RuntimeTargetRead
} from '@whiteboard/editor/query/target'
import type { ViewportRuntime } from '@whiteboard/editor/session/viewport'
import type { EditorInputPreview } from '@whiteboard/editor/session/preview'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'

export type ToolRead = {
  get: () => Tool
  type: () => Tool['type']
  value: () => DrawMode | undefined
  is: (type: Tool['type'], value?: string) => boolean
}

const readToolValue = (
  tool: Tool
) => (
  'mode' in tool
    ? tool.mode
    : undefined
)

const isToolMatch = (
  tool: Tool,
  type: Tool['type'],
  value?: string
) => {
  if (tool.type !== type) {
    return false
  }

  if (value === undefined) {
    return true
  }

  return tool.type === 'draw'
    ? tool.mode === value
    : false
}

const createToolRead = (
  source: store.ReadStore<Tool>
): ToolRead => ({
  get: () => store.read(source),
  type: () => store.read(source).type,
  value: () => readToolValue(store.read(source)),
  is: (type, value) => isToolMatch(store.read(source), type, value)
})

export type EditorQuery = Omit<EngineRead, 'node' | 'edge' | 'index'> & {
  history: HistoryApi
  group: EngineRead['group']
  target: RuntimeTargetRead
  edit: EditorEditRead
  node: NodePresentationRead
  edge: EdgePresentationRead
  mindmap: MindmapPresentationRead
  selection: SelectionRead
  tool: ToolRead
  draw: store.ReadStore<DrawState>
  space: store.ReadStore<boolean>
  viewport: {
    get: ViewportRuntime['read']['get']
    subscribe: ViewportRuntime['read']['subscribe']
    pointer: ViewportRuntime['read']['pointer']
    worldToScreen: ViewportRuntime['read']['worldToScreen']
    screenPoint: ViewportRuntime['input']['screenPoint']
    size: ViewportRuntime['input']['size']
  }
  chrome: {
    draw: EditorInputPreview['selectors']['draw']
    marquee: EditorInputPreview['selectors']['marquee']
    edgeGuide: EditorInputPreview['selectors']['edgeGuide']
    snap: EditorInputPreview['selectors']['snap']
  }
}

export const createEditorQuery = ({
  engineRead,
  registry,
  history,
  layout,
  session,
  defaults
}: {
  engineRead: EngineRead
  registry: NodeRegistry
  history: HistoryApi
  layout: Pick<EditorLayout, 'text' | 'mindmap' | 'edit'>
  session: Pick<EditorSession, 'state' | 'viewport' | 'interaction' | 'preview'>
  defaults: EditorDefaults['selection']
}): EditorQuery => {
  const {
    draw,
    edit,
    selection,
    tool
  } = session.state
  const nodeType = createNodeTypeRead(registry)
  const mindmapRead = createMindmapRead({
    read: engineRead.mindmap,
    layout: layout.mindmap,
    node: engineRead.node.item,
    edit,
    selection
  })
  const editRead = createEditRead(edit, layout)
  const selectionRuntime = createSelectionRuntimeRead(selection)
  const nodeRead: NodePresentationRead = createNodeRead({
    read: engineRead,
    type: nodeType,
    feedback: session.preview.selectors.node,
    mindmap: mindmapRead.node,
    edit: editRead,
    selection: selectionRuntime.node
  })
  const edgeRead = createEdgeRead({
    read: engineRead,
    node: nodeRead,
    feedback: session.preview.selectors.edge,
    edit: {
      session: edit,
      ...editRead
    },
    selection: {
      target: selection,
      ...selectionRuntime.edge
    },
    tool,
    interaction: session.interaction.read,
    textMetrics: layout.text,
    capability: nodeRead.capability
  })
  const targetRead = createTargetRead({
    node: nodeRead,
    edge: edgeRead
  })
  const selectionModel = createSelectionModelRead({
    source: selection,
    node: nodeRead,
    edge: edgeRead
  })
  const selectionRead = createSelectionRead({
    model: selectionModel,
    runtime: selectionRuntime,
    nodeType,
    mindmap: mindmapRead,
    tool,
    edit,
    interaction: session.interaction.read,
    defaults
  })
  const toolRead = createToolRead(tool)

  return {
    document: engineRead.document,
    frame: engineRead.frame,
    group: engineRead.group,
    target: targetRead,
    history,
    edit: editRead,
    node: nodeRead,
    edge: edgeRead,
    mindmap: mindmapRead,
    selection: selectionRead,
    scene: engineRead.scene,
    slice: engineRead.slice,
    tool: toolRead,
    draw,
    space: session.interaction.read.space,
    viewport: {
      get: session.viewport.read.get,
      subscribe: session.viewport.read.subscribe,
      pointer: session.viewport.read.pointer,
      worldToScreen: session.viewport.read.worldToScreen,
      screenPoint: session.viewport.input.screenPoint,
      size: session.viewport.input.size
    },
    chrome: {
      draw: session.preview.selectors.draw,
      marquee: session.preview.selectors.marquee,
      edgeGuide: session.preview.selectors.edgeGuide,
      snap: session.preview.selectors.snap
    }
  }
}
