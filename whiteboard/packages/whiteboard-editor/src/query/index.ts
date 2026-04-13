import { read as readValue, type ReadStore } from '@shared/core'
import type { EngineRead } from '@whiteboard/engine'
import type { HistoryState } from '@whiteboard/core/kernel'
import type { NodeRegistry } from '../types/node'
import type {
  DrawMode,
  DrawState
} from '../local/draw'
import type { EdgeToolbarContext } from '../types/edgePresentation'
import type {
  EdgePresetKey,
  InsertPresetKey,
  Tool
} from '../types/tool'
import type { EditorLocalRuntime } from '../local/runtime'
import {
  createNodeRead,
  type NodeRead
} from './node/read'
import {
  createEdgeRead,
  type EdgeRead
} from './edge/read'
import {
  createMindmapRead,
  type MindmapRead
} from './mindmap/read'
import {
  createSelectionModelRead,
  type SelectionModelRead
} from './selection/model'
import {
  createSelectionPresentationRead,
  type SelectionRead
} from './selection/presentation'
import { createEdgeToolbarRead } from './selection/edgeToolbar'
import {
  createTargetRead,
  type RuntimeTargetRead
} from './target'
import type { ViewportRuntime } from '../local/viewport/runtime'
import type { EditorFeedbackRuntime } from '../local/feedback'

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

export type RuntimeRead = Omit<EngineRead, 'node' | 'edge' | 'index'> & {
  history: ReadStore<HistoryState>
  group: EngineRead['group']
  target: RuntimeTargetRead
  node: NodeRead
  edge: EdgeRead & {
    toolbar: ReadStore<EdgeToolbarContext | undefined>
  }
  mindmap: MindmapRead
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
    draw: EditorFeedbackRuntime['selectors']['draw']
    marquee: EditorFeedbackRuntime['selectors']['marquee']
    edgeGuide: EditorFeedbackRuntime['selectors']['edgeGuide']
    snap: EditorFeedbackRuntime['selectors']['snap']
  }
}

export type QueryRuntime = {
  read: RuntimeRead
  selectionModel: SelectionModelRead
}

export const createQueryRuntime = ({
  engineRead,
  registry,
  history,
  local
}: {
  engineRead: EngineRead
  registry: NodeRegistry
  history: ReadStore<HistoryState>
  local: Pick<EditorLocalRuntime, 'state' | 'interaction' | 'feedback' | 'viewport'>
}): QueryRuntime => {
  const {
    draw,
    edit,
    selection,
    space,
    tool
  } = local.state
  const nodeRead: NodeRead = createNodeRead({
    read: engineRead,
    registry,
    feedback: local.feedback.selectors.node,
    edit: edit.source
  })
  const edgeRead = createEdgeRead({
    read: engineRead,
    node: nodeRead,
    feedback: local.feedback.selectors.edge,
    edit: edit.source,
    capability: nodeRead.capability
  })
  const mindmapRead = createMindmapRead({
    read: engineRead.mindmap,
    drag: local.feedback.selectors.mindmapDrag
  })
  const targetRead = createTargetRead({
    node: nodeRead,
    edge: edgeRead
  })
  const selectionModel = createSelectionModelRead({
    source: selection.source,
    node: nodeRead,
    target: targetRead
  })
  const selectionRead = createSelectionPresentationRead({
    model: selectionModel,
    registry,
    tool,
    edit: edit.source,
    interaction: local.interaction
  })
  const edgeToolbar = createEdgeToolbarRead({
    selection: selection.source,
    target: targetRead,
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
      edge: {
        ...edgeRead,
        toolbar: edgeToolbar
      },
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
        draw: local.feedback.selectors.draw,
        marquee: local.feedback.selectors.marquee,
        edgeGuide: local.feedback.selectors.edgeGuide,
        snap: local.feedback.selectors.snap
      }
    },
    selectionModel
  }
}
