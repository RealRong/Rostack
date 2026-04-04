import type { EngineRead, ReadStore } from '@whiteboard/engine'
import type { HistoryState } from '@whiteboard/core/kernel'
import type { NodeRegistry } from '../../types/node'
import type { DrawPreferences } from '../../types/draw'
import type { EditorOverlay } from '../overlay'
import type { EditorViewportRuntime } from '../editor/types'
import type { RuntimeStateController } from '../state'
import type { EditorHost } from '../../host/types'
import {
  createNodeRead,
  type NodeRead
} from './node'
import {
  createEdgeRead,
  type EdgeRead
} from './edge'
import {
  createSelectionRead,
  type SelectionRead
} from './selection'
import { createToolRead, type ToolRead } from './tool'
import { createTargetBoundsQuery } from '../query/targetBounds'

export type RuntimeRead = Omit<EngineRead, 'node' | 'edge'> & {
  history: ReadStore<HistoryState>
  node: NodeRead
  edge: EdgeRead
  selection: SelectionRead
  tool: ToolRead
  space: ReadStore<boolean>
  inputPolicy: ReadStore<{
    panEnabled: boolean
    wheelEnabled: boolean
    wheelSensitivity: number
  }>
  draw: {
    preferences: ReadStore<DrawPreferences>
  }
  viewport: {
    get: EditorViewportRuntime['get']
    subscribe: EditorViewportRuntime['subscribe']
    pointer: EditorViewportRuntime['pointer']
    worldToScreen: EditorViewportRuntime['worldToScreen']
    screenPoint: EditorViewportRuntime['input']['screenPoint']
    size: EditorViewportRuntime['input']['size']
  }
  overlay: {
    feedback: EditorOverlay['selectors']['feedback']
  }
}

export const createRead = ({
  engineRead,
  registry,
  history,
  runtime,
  overlay,
  host
}: {
  engineRead: EngineRead
  registry: NodeRegistry
  history: ReadStore<HistoryState>
  runtime: Pick<RuntimeStateController, 'state'>
  overlay: Pick<EditorOverlay, 'selectors'>
  host: Pick<EditorHost, 'viewport' | 'inputPolicy' | 'draw'>
}): RuntimeRead => {
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
  const targetBounds = createTargetBoundsQuery({
    node: nodeRead,
    edge: edgeRead
  })
  const selectionRead = createSelectionRead({
    source: runtime.state.selection.source,
    node: nodeRead,
    edge: edgeRead,
    targetBounds
  })
  const toolRead = createToolRead({
    tool: runtime.state.tool
  })

  return {
    document: engineRead.document,
    frame: engineRead.frame,
    history,
    node: nodeRead,
    edge: edgeRead,
    mindmap: engineRead.mindmap,
    selection: selectionRead,
    tree: engineRead.tree,
    slice: engineRead.slice,
    index: engineRead.index,
    tool: toolRead,
    space: runtime.state.space,
    inputPolicy: host.inputPolicy.store,
    draw: {
      preferences: host.draw.preferences
    },
    viewport: {
      get: host.viewport.read.get,
      subscribe: host.viewport.read.subscribe,
      pointer: host.viewport.read.pointer,
      worldToScreen: host.viewport.read.worldToScreen,
      screenPoint: host.viewport.input.screenPoint,
      size: host.viewport.input.size
    },
    overlay: {
      feedback: overlay.selectors.feedback
    }
  }
}
