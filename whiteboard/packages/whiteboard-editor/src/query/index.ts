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
import type { EditorLocalRuntime } from '@whiteboard/editor/local/runtime'
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
  createSelectionPresentationRead,
  type SelectionRead
} from '@whiteboard/editor/query/selection/presentation'
import {
  createTargetRead,
  type RuntimeTargetRead
} from '@whiteboard/editor/query/target'
import type { ViewportRuntime } from '@whiteboard/editor/local/viewport/runtime'
import type { EditorFeedbackRuntime } from '@whiteboard/editor/local/feedback'
import type { LayoutRuntime } from '@whiteboard/editor/layout/runtime'

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

export type EditorQueryRead = Omit<EngineRead, 'node' | 'edge' | 'index'> & {
  history: ReadStore<HistoryState>
  group: EngineRead['group']
  target: RuntimeTargetRead
  node: NodePresentationRead
  edge: EdgePresentationRead
  mindmap: MindmapPresentationRead
  selection: SelectionRead
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
  feedback: {
    node: EditorFeedbackRuntime['selectors']['node']
    draw: EditorFeedbackRuntime['selectors']['draw']
    marquee: EditorFeedbackRuntime['selectors']['marquee']
    mindmapPreview: EditorFeedbackRuntime['selectors']['mindmapPreview']
    edgeGuide: EditorFeedbackRuntime['selectors']['edgeGuide']
    snap: EditorFeedbackRuntime['selectors']['snap']
  }
}

export type QueryRuntime = {
  read: EditorQueryRead
  selectionModel: SelectionModelRead
}

export const createQueryRuntime = ({
  engineRead,
  registry,
  history,
  local,
  layout
}: {
  engineRead: EngineRead
  registry: NodeRegistry
  history: ReadStore<HistoryState>
  local: Pick<EditorLocalRuntime, 'state' | 'interaction' | 'feedback' | 'viewport'>
  layout: LayoutRuntime
}): QueryRuntime => {
  const {
    draw,
    edit,
    selection,
    space,
    tool
  } = local.state
  const mindmapRead = createMindmapRead({
    read: engineRead.mindmap,
    node: engineRead.node.item,
    preview: local.feedback.selectors.mindmapPreview,
    edit: edit.source,
    selection: selection.source
  })
  const nodeRead: NodePresentationRead = createNodeRead({
    read: engineRead,
    registry,
    feedback: local.feedback.selectors.node,
    mindmap: mindmapRead.item,
    edit: edit.source,
    selection: selection.source
  })
  const edgeRead = createEdgeRead({
    read: engineRead,
    node: nodeRead,
    feedback: local.feedback.selectors.edge,
    edit: edit.source,
    selection: selection.source,
    tool,
    interaction: local.interaction,
    layout,
    capability: nodeRead.capability
  })
  const targetRead = createTargetRead({
    node: nodeRead,
    edge: edgeRead
  })
  const selectionModel = createSelectionModelRead({
    source: selection.source,
    node: nodeRead,
    edge: edgeRead
  })
  const selectionRead = createSelectionPresentationRead({
    model: selectionModel,
    registry,
    tool,
    edit: edit.source,
    interaction: local.interaction
  })
  const toolRead = createToolRead(tool)

  return {
    read: {
      document: engineRead.document,
      frame: engineRead.frame,
      group: engineRead.group,
      target: targetRead,
      history,
      node: nodeRead,
      edge: edgeRead,
      mindmap: mindmapRead,
      scene: engineRead.scene,
      selection: selectionRead,
      slice: engineRead.slice,
      tool: toolRead,
      draw: draw.store,
      space,
      viewport: {
        get: local.viewport.read.get,
        subscribe: local.viewport.read.subscribe,
        pointer: local.viewport.read.pointer,
        worldToScreen: local.viewport.read.worldToScreen,
        screenPoint: local.viewport.input.screenPoint,
        size: local.viewport.input.size
      },
      feedback: {
        node: local.feedback.selectors.node,
        draw: local.feedback.selectors.draw,
        marquee: local.feedback.selectors.marquee,
        mindmapPreview: local.feedback.selectors.mindmapPreview,
        edgeGuide: local.feedback.selectors.edgeGuide,
        snap: local.feedback.selectors.snap
      }
    },
    selectionModel
  }
}
