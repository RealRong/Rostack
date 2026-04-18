import { read as readValue, type ReadStore } from '@shared/core'
import type { EngineRead } from '@whiteboard/engine'
import type { HistoryState } from '@whiteboard/core/kernel'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type {
  DrawMode,
  DrawState
} from '@whiteboard/editor/local/draw'
import type {
  EdgePresetKey,
  InsertPresetKey,
  Tool
} from '@whiteboard/editor/types/tool'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import {
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
  type SelectionModelRead
} from '@whiteboard/editor/query/selection/model'
import {
  createSelectionRead,
  type SelectionRead
} from '@whiteboard/editor/query/selection/read'
import {
  createTargetRead,
  type RuntimeTargetRead
} from '@whiteboard/editor/query/target'
import type { ViewportRuntime } from '@whiteboard/editor/local/viewport/runtime'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EditorInputPreview } from '@whiteboard/editor/session/preview'

export type ToolRead = {
  get: () => Tool
  type: () => Tool['type']
  value: () => EdgePresetKey | InsertPresetKey | DrawMode | undefined
  is: (type: Tool['type'], value?: string) => boolean
}

const readToolValue = (
  tool: Tool
) => (
  'preset' in tool
    ? tool.preset
    : 'mode' in tool
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

  switch (tool.type) {
    case 'edge':
    case 'insert':
      return tool.preset === value
    case 'draw':
      return tool.mode === value
    default:
      return false
  }
}

const createToolRead = (
  source: ReadStore<Tool>
): ToolRead => ({
  get: () => readValue(source),
  type: () => readValue(source).type,
  value: () => readToolValue(readValue(source)),
  is: (type, value) => isToolMatch(readValue(source), type, value)
})

export type EditorQuery = Omit<EngineRead, 'node' | 'edge' | 'index'> & {
  history: ReadStore<HistoryState>
  group: EngineRead['group']
  target: RuntimeTargetRead
  node: NodePresentationRead
  edge: EdgePresentationRead
  mindmap: MindmapPresentationRead
  selection: {
    model: SelectionModelRead
  } & SelectionRead
  tool: ToolRead
  draw: ReadStore<DrawState>
  space: ReadStore<boolean>
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
  session,
  layout
}: {
  engineRead: EngineRead
  registry: NodeRegistry
  history: ReadStore<HistoryState>
  session: Pick<EditorSession, 'state' | 'viewport' | 'interaction' | 'preview'>
  layout: EditorLayout
}): EditorQuery => {
  const {
    draw,
    edit,
    selection,
    tool
  } = session.state
  const mindmapRead = createMindmapRead({
    read: engineRead.mindmap,
    node: engineRead.node.item,
    preview: session.preview.selectors.mindmapPreview,
    edit,
    selection
  })
  const nodeRead: NodePresentationRead = createNodeRead({
    read: engineRead,
    registry,
    feedback: session.preview.selectors.node,
    mindmap: mindmapRead.item,
    edit,
    selection
  })
  const edgeRead = createEdgeRead({
    read: engineRead,
    node: nodeRead,
    feedback: session.preview.selectors.edge,
    edit,
    selection,
    tool,
    interaction: session.interaction.read,
    layout,
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
    registry,
    mindmap: mindmapRead,
    tool,
    edit,
    interaction: session.interaction.read
  })
  const toolRead = createToolRead(tool)

  return {
    document: engineRead.document,
    frame: engineRead.frame,
    group: engineRead.group,
    target: targetRead,
    history,
    node: nodeRead,
    edge: edgeRead,
    mindmap: mindmapRead,
    selection: {
      model: selectionModel,
      ...selectionRead
    },
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
