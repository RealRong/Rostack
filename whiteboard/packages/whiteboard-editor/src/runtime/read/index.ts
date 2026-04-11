import type { KeyedReadStore, ReadStore } from '@shared/core'
import type { EngineRead } from '@whiteboard/engine'
import type { GroupRead } from '@engine-types/instance'
import type { HistoryState } from '@whiteboard/core/kernel'
import type { NodeId } from '@whiteboard/core/types'
import type { NodeRegistry } from '../../types/node'
import type { DrawPreferences } from '../../types/draw'
import type { InteractionRuntime } from '../interaction/types'
import type { EditorOverlay } from '../overlay'
import type { EditorViewportRuntime } from '../editor/types'
import type { RuntimeStateController } from '../state'
import {
  createNodeRead,
  type NodeRead
} from './node'
import {
  createEdgeRead,
  type EdgeRead
} from './edge'
import {
  createMindmapViewStore,
  type MindmapView
} from './mindmap'
import { createEdgeToolbarRead } from './edgeToolbar'
import {
  createSelectionRead,
  type SelectionModelRead,
  type SelectionRead
} from './selection'
import type {
  DrawKind,
  EdgePresetKey,
  InsertPresetKey,
  Tool
} from '../../types/tool'
import type { EdgeToolbarContext } from '../../types/edgePresentation'

export type ToolRead = {
  get: () => Tool
  type: () => Tool['type']
  preset: () => EdgePresetKey | InsertPresetKey | DrawKind | undefined
  is: (type: Tool['type'], preset?: string) => boolean
}

const readToolPreset = (
  tool: Tool
) => (
  'preset' in tool
    ? tool.preset
    : 'kind' in tool
      ? tool.kind
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
      return tool.kind === value
    default:
      return false
  }
}

export type RuntimeRead = Omit<EngineRead, 'node' | 'edge' | 'index'> & {
  history: ReadStore<HistoryState>
  group: GroupRead
  node: NodeRead
  edge: EdgeRead & {
    toolbar: ReadStore<EdgeToolbarContext | undefined>
  }
  mindmap: EngineRead['mindmap'] & {
    view: KeyedReadStore<NodeId, MindmapView | undefined>
  }
  selection: SelectionRead
  tool: ToolRead
  draw: ReadStore<DrawPreferences>
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
  runtime: Pick<RuntimeStateController, 'state'>
  interaction: Pick<InteractionRuntime, 'mode' | 'chrome'>
  overlay: Pick<EditorOverlay, 'selectors'>
  viewport: EditorViewportRuntime
}): {
  read: RuntimeRead
  selectionModel: SelectionModelRead
} => {
  const nodeRead: NodeRead = createNodeRead({
    read: engineRead,
    registry,
    overlay: overlay.selectors.node,
    edit: runtime.state.edit.source
  })
  const edgeRead = createEdgeRead({
    read: engineRead,
    node: nodeRead,
    overlay: overlay.selectors.edge,
    edit: runtime.state.edit.source,
    capability: nodeRead.capability
  })
  const mindmapView = createMindmapViewStore({
    item: engineRead.mindmap.item,
    drag: overlay.selectors.feedback.mindmapDrag
  })
  const edgeToolbar = createEdgeToolbarRead({
    selection: runtime.state.selection.source,
    node: nodeRead,
    edge: edgeRead,
    tool: runtime.state.tool,
    edit: runtime.state.edit.source,
    interaction
  })
  const selectionRead = createSelectionRead({
    source: runtime.state.selection.source,
    node: nodeRead,
    edge: edgeRead,
    registry,
    tool: runtime.state.tool,
    edit: runtime.state.edit.source,
    interaction
  })
  const toolRead: ToolRead = {
    get: () => runtime.state.tool.get(),
    type: () => runtime.state.tool.get().type,
    preset: () => readToolPreset(runtime.state.tool.get()),
    is: (type, preset) => isToolMatch(runtime.state.tool.get(), type, preset)
  }

  return {
    read: {
      document: engineRead.document,
      frame: engineRead.frame,
      group: engineRead.group,
      history,
      node: nodeRead,
      edge: {
        ...edgeRead,
        toolbar: edgeToolbar
      },
      mindmap: {
        ...engineRead.mindmap,
        view: mindmapView
      },
      scene: engineRead.scene,
      selection: selectionRead.public,
      slice: engineRead.slice,
      tool: toolRead,
      draw: runtime.state.draw.store,
      space: runtime.state.space,
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
    selectionModel: selectionRead.model
  }
}
