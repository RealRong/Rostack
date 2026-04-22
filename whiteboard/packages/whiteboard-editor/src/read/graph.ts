import { store } from '@shared/core'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type {
  DocumentRead
} from '@whiteboard/editor/document/read'
import type { ProjectionSources } from '@whiteboard/editor/projection/sources'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import {
  createGraphEdgeRead,
  type GraphEdgeRead
} from './edge'
import {
  createGraphNodeRead,
  type GraphNodeRead
} from './node'
import {
  createGraphSelectionRead,
  type GraphSelectionRead
} from './selection'

export type GraphRead = {
  snapshot: ProjectionSources['snapshot']
  scene: {
    view: ProjectionSources['scene']
  }
  node: GraphNodeRead
  edge: GraphEdgeRead
  selection: GraphSelectionRead
  mindmap: {
    view: ProjectionSources['mindmap']
  }
  group: {
    view: ProjectionSources['group']
  }
  chrome: ProjectionSources['chrome']
  graph: ProjectionSources['graph']
}

export const createGraphRead = ({
  document,
  sources,
  selection,
  nodeType
}: {
  document: Pick<DocumentRead, 'node' | 'edge'>
  sources: Pick<ProjectionSources, 'snapshot' | 'graph' | 'scene' | 'selection' | 'chrome' | 'node' | 'edge' | 'mindmap' | 'group'>
  selection: store.ReadStore<SelectionTarget>
  nodeType: NodeTypeSupport
}): GraphRead => {
  const node = createGraphNodeRead({
    document,
    sources,
    type: nodeType
  })
  const edge = createGraphEdgeRead({
    document,
    sources,
    node
  })

  return {
    snapshot: sources.snapshot,
    scene: {
      view: sources.scene
    },
    node,
    edge,
    selection: createGraphSelectionRead({
      source: selection,
      view: sources.selection,
      node,
      edge
    }),
    mindmap: {
      view: sources.mindmap
    },
    group: {
      view: sources.group
    },
    chrome: sources.chrome,
    graph: sources.graph
  }
}
