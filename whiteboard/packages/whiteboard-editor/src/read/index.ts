import type { ReadStore } from '@shared/core'
import type { EngineRead } from '@whiteboard/engine'
import type { HistoryState } from '@whiteboard/core/kernel'
import type { NodeRegistry } from '../types/node'
import type {
  DrawMode,
  DrawState
} from '../model/draw'
import type { InteractionRuntime } from '../input/core/types'
import type { EditorOverlay } from '../overlay'
import type { EditorViewportRuntime } from '../editor/types'
import type { EditorStateController } from '../state'
import {
  createNodeRead,
  type NodeRead
} from './node'
import {
  createEdgeRead,
  type EdgeRead
} from './edge'
import {
  createMindmapRead,
  type MindmapRead
} from './mindmap'
import { createEdgeToolbarRead } from '../presentation/edgeToolbar'
import {
  createSelectionPresentationRead,
  type SelectionRead
} from '../presentation/selection'
import {
  createTargetRead,
  type RuntimeTargetRead
} from './target'
import {
  createSelectionModelRead,
  type SelectionModelRead
} from './selectionModel'
import type {
  EdgePresetKey,
  InsertPresetKey,
  Tool
} from '../types/tool'
import type { EdgeToolbarContext } from '../types/edgePresentation'

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
  source: Pick<ReadStore<Tool>, 'get'>
): ToolRead => ({
  get: () => source.get(),
  type: () => source.get().type,
  value: () => readToolValue(source.get()),
  is: (type, value) => isToolMatch(source.get(), type, value)
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
    get: EditorViewportRuntime['read']['get']
    subscribe: EditorViewportRuntime['read']['subscribe']
    pointer: EditorViewportRuntime['read']['pointer']
    worldToScreen: EditorViewportRuntime['read']['worldToScreen']
    screenPoint: EditorViewportRuntime['input']['screenPoint']
    size: EditorViewportRuntime['input']['size']
  }
  overlay: {
    node: EditorOverlay['selectors']['node']
    feedback: EditorOverlay['selectors']['feedback']
  }
}

export const createRead = ({
  engineRead,
  registry,
  history,
  runtime,
  interaction,
  overlay,
  viewport
}: {
  engineRead: EngineRead
  registry: NodeRegistry
  history: ReadStore<HistoryState>
  runtime: Pick<EditorStateController, 'state'>
  interaction: Pick<InteractionRuntime, 'mode' | 'chrome'>
  overlay: Pick<EditorOverlay, 'selectors'>
  viewport: EditorViewportRuntime
}): {
  read: RuntimeRead
  selectionModel: SelectionModelRead
} => {
  const {
    draw,
    edit,
    selection,
    space,
    tool
  } = runtime.state
  const nodeRead: NodeRead = createNodeRead({
    read: engineRead,
    registry,
    overlay: overlay.selectors.node,
    edit: edit.source
  })
  const edgeRead = createEdgeRead({
    read: engineRead,
    node: nodeRead,
    overlay: overlay.selectors.edge,
    edit: edit.source,
    capability: nodeRead.capability
  })
  const mindmapRead = createMindmapRead({
    read: engineRead.mindmap,
    drag: overlay.selectors.feedback.mindmapDrag
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
    interaction
  })
  const edgeToolbar = createEdgeToolbarRead({
    selection: selection.source,
    target: targetRead,
    tool,
    edit: edit.source,
    interaction
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
        get: viewport.read.get,
        subscribe: viewport.read.subscribe,
        pointer: viewport.read.pointer,
        worldToScreen: viewport.read.worldToScreen,
        screenPoint: viewport.input.screenPoint,
        size: viewport.input.size
      },
      overlay: {
        node: overlay.selectors.node,
        feedback: overlay.selectors.feedback
      }
    },
    selectionModel
  }
}
