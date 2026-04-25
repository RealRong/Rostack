import { store } from '@shared/core'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  GroupId,
  MindmapId,
} from '@whiteboard/core/types'
import type {
  GroupView,
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
  snap: {
    rect: EditorGraphQuery['snap']
  }
  frame: EditorGraphQuery['frame']
  node: GraphNodeRead
  edge: GraphEdgeRead
  selection: GraphSelectionRead
  mindmap: {
    view: ProjectionSources['mindmap']
    id: (value: string) => MindmapId | undefined
    structure: (
      value: MindmapId | string
    ) => ReturnType<EditorGraphQuery['mindmapStructure']>
  }
  group: {
    view: ProjectionSources['group']
    ofNode: (nodeId: string) => GroupId | undefined
    ofEdge: (edgeId: string) => GroupId | undefined
    target: (groupId: GroupId) => SelectionTarget | undefined
    exact: (target: SelectionTarget) => readonly GroupId[]
  }
  chrome: ProjectionSources['chrome']
}

const toGroupTarget = (
  items: GroupView['structure']['items']
): SelectionTarget => selectionApi.target.normalize({
  nodeIds: items.flatMap((item) => (
    item.kind === 'node'
      ? [item.id]
      : []
  )),
  edgeIds: items.flatMap((item) => (
    item.kind === 'edge'
      ? [item.id]
      : []
  ))
})

export const createGraphRead = ({
  document,
  sources,
  query,
  spatial,
  selection,
  nodeType
}: {
  document: Pick<DocumentRead, 'node' | 'edge'>
  sources: Pick<ProjectionSources, 'snapshot' | 'items' | 'chrome' | 'nodeGraphIds' | 'nodeGraph' | 'edgeGraphIds' | 'edgeGraph' | 'mindmap' | 'group' | 'nodeUi' | 'edgeUi'>
  query: Pick<EditorGraphQuery, 'mindmapId' | 'mindmapStructure' | 'relatedEdges' | 'groupExact' | 'snap' | 'frame'>
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
    relatedEdges: query.relatedEdges,
    node
  })

  return {
    snapshot: sources.snapshot,
    items: sources.items,
    spatial,
    snap: {
      rect: query.snap
    },
    frame: query.frame,
    node,
    edge,
    selection: createGraphSelectionRead({
      source: selection,
      node,
      edge
    }),
    mindmap: {
      view: sources.mindmap,
      id: (value) => {
        store.read(sources.snapshot)
        return query.mindmapId(value)
      },
      structure: (value) => {
        store.read(sources.snapshot)
        return query.mindmapStructure(value as MindmapId | string)
      }
    },
    group: {
      view: sources.group,
      ofNode: (nodeId) => store.read(sources.nodeGraph, nodeId)?.base.node.groupId,
      ofEdge: (edgeId) => store.read(sources.edgeGraph, edgeId)?.base.edge.groupId,
      target: (groupId) => {
        const group = store.read(sources.group, groupId)
        return group
          ? toGroupTarget(group.structure.items)
          : undefined
      },
      exact: query.groupExact
    },
    chrome: sources.chrome
  }
}
