import { store } from '@shared/core'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type {
  Read as EditorGraphQuery
} from '@whiteboard/editor-graph'
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
  items: ProjectionSources['items']
  spatial: EditorGraphQuery['spatial']
  node: GraphNodeRead
  edge: GraphEdgeRead
  selection: GraphSelectionRead
  mindmap: {
    view: ProjectionSources['mindmap']
  }
  group: {
    view: ProjectionSources['group']
  }
  ui: ProjectionSources['ui']
  chrome: ProjectionSources['chrome']
  graph: ProjectionSources['graph']
}

export const createGraphRead = ({
  document,
  sources,
  spatial,
  selection,
  nodeType
}: {
  document: Pick<DocumentRead, 'node' | 'edge'>
  sources: Pick<ProjectionSources, 'snapshot' | 'graph' | 'items' | 'ui' | 'chrome' | 'nodeGraph' | 'edgeGraph' | 'mindmap' | 'group' | 'nodeUi' | 'edgeUi'>
  spatial: EditorGraphQuery['spatial']
  selection: store.ReadStore<SelectionTarget>
  nodeType: NodeTypeSupport
}): GraphRead => {
  const node = createGraphNodeRead({
    document,
    sources,
    spatial,
    type: nodeType
  })
  const edge = createGraphEdgeRead({
    document,
    sources,
    spatial,
    node
  })

  return {
    snapshot: sources.snapshot,
    items: sources.items,
    spatial,
    node,
    edge,
    selection: createGraphSelectionRead({
      source: selection,
      node,
      edge
    }),
    mindmap: {
      view: sources.mindmap
    },
    group: {
      view: sources.group
    },
    ui: sources.ui,
    chrome: sources.chrome,
    graph: sources.graph
  }
}
