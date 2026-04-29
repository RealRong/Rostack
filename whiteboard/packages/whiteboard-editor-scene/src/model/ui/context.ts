import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type { Input } from '../../contracts/editor'
import type {
  WhiteboardExecution
} from '../../contracts/execution'
import type { WorkingState } from '../../contracts/working'
import {
  appendIds,
  appendMindmapNodeIds,
  appendMindmapNodeScope,
  appendScopeIds
} from '../scope'
import { collectUiRuntimeTouch } from './runtime'

export interface UiContext {
  current: Input
  execution: WhiteboardExecution
  reset: boolean
  working: WorkingState
  touched: {
    node: ReadonlySet<NodeId>
    edge: ReadonlySet<EdgeId>
    chrome: boolean
  }
}

export const createUiContext = (input: {
  current: Input
  execution: WhiteboardExecution
  working: WorkingState
  reset: boolean
}): UiContext => {
  const touchedNodeIds = new Set<NodeId>()
  const touchedEdgeIds = new Set<EdgeId>()
  let chrome = input.execution.runtime.ui

  appendScopeIds(
    touchedNodeIds,
    input.execution.graph.node.entity,
    () => input.working.graph.nodes.keys()
  )
  appendScopeIds(
    touchedNodeIds,
    input.execution.graph.node.geometry,
    () => input.working.graph.nodes.keys()
  )
  appendScopeIds(
    touchedNodeIds,
    input.execution.graph.node.content,
    () => input.working.graph.nodes.keys()
  )
  appendScopeIds(
    touchedNodeIds,
    input.execution.graph.node.owner,
    () => input.working.graph.nodes.keys()
  )
  appendScopeIds(
    touchedEdgeIds,
    input.execution.graph.edge.entity,
    () => input.working.graph.edges.keys()
  )
  appendScopeIds(
    touchedEdgeIds,
    input.execution.graph.edge.geometry,
    () => input.working.graph.edges.keys()
  )
  appendScopeIds(
    touchedEdgeIds,
    input.execution.graph.edge.content,
    () => input.working.graph.edges.keys()
  )
  appendMindmapNodeScope({
    target: touchedNodeIds,
    scope: input.execution.graph.mindmap.entity,
    working: input.working
  })
  appendMindmapNodeScope({
    target: touchedNodeIds,
    scope: input.execution.graph.mindmap.geometry,
    working: input.working
  })
  appendMindmapNodeScope({
    target: touchedNodeIds,
    scope: input.execution.graph.mindmap.owner,
    working: input.working
  })
  appendIds(touchedNodeIds, input.execution.runtime.node)
  appendIds(touchedEdgeIds, input.execution.runtime.edge)
  appendMindmapNodeIds({
    target: touchedNodeIds,
    mindmapIds: input.execution.runtime.mindmap,
    working: input.working
  })

  if (input.execution.runtime.ui) {
    const runtimeTouch = collectUiRuntimeTouch({
      current: input.current,
      working: input.working
    })
    appendIds(touchedNodeIds, runtimeTouch.node)
    appendIds(touchedEdgeIds, runtimeTouch.edge)
    chrome = chrome || runtimeTouch.chrome
  }

  return {
    current: input.current,
    execution: input.execution,
    reset: input.reset,
    working: input.working,
    touched: {
      node: touchedNodeIds,
      edge: touchedEdgeIds,
      chrome
    }
  }
}
