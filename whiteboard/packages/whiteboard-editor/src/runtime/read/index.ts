import type { KeyedReadStore, ReadStore } from '@shared/store'
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
  type SelectionInternalRead,
  type SelectionRead
} from './selection'
import { createToolRead, type ToolRead } from './tool'
import { createTargetBoundsQuery } from '../query/targetBounds'
import type { EdgeToolbarContext } from '../../types/edgePresentation'

export type RuntimeRead = Omit<EngineRead, 'node' | 'edge'> & {
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

export type RuntimeReadBundle = {
  read: RuntimeRead
  internal: {
    selection: SelectionInternalRead
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
}): RuntimeReadBundle => {
  const nodeRead: NodeRead = createNodeRead({
    read: engineRead,
    registry,
    overlay: overlay.selectors.node
  })
  const edgeRead = createEdgeRead({
    read: engineRead,
    nodeItem: nodeRead.item,
    overlay: overlay.selectors.edge,
    capability: nodeRead.capability
  })
  const mindmapView = createMindmapViewStore({
    item: engineRead.mindmap.item,
    drag: overlay.selectors.feedback.mindmapDrag
  })
  const targetBounds = createTargetBoundsQuery({
    node: nodeRead,
    edge: edgeRead
  })
  const edgeToolbar = createEdgeToolbarRead({
    selection: runtime.state.selection.source,
    edge: edgeRead,
    targetBounds,
    tool: runtime.state.tool,
    edit: runtime.state.edit.source,
    interaction
  })
  const selectionRead = createSelectionRead({
    source: runtime.state.selection.source,
    node: nodeRead,
    edge: edgeRead,
    targetBounds,
    registry,
    tool: runtime.state.tool,
    edit: runtime.state.edit.source,
    interaction
  })
  const toolRead = createToolRead({
    tool: runtime.state.tool
  })

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
      index: engineRead.index,
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
    internal: {
      selection: selectionRead.internal
    }
  }
}
