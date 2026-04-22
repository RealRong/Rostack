import { store } from '@shared/core'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { NodeId } from '@whiteboard/core/types'
import type {
  MindmapLayout,
  MindmapRenderConnector
} from '@whiteboard/core/mindmap'
import type {
  DocumentRead,
  MindmapStructureItem
} from '@whiteboard/editor/document/read'
import type { EditorPublishedSources } from '@whiteboard/editor/publish/sources'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import {
  createProjectionEdgeRead,
  type ProjectionEdgeRead
} from './edge'
import {
  createProjectionNodeRead,
  type ProjectionNodeRead
} from './node'
import {
  createProjectionSelectionRead,
  type ProjectionSelectionRead
} from './selection'

export type ProjectionMindmapLayout = {
  id: string
  rootId: NodeId
  nodeIds: readonly NodeId[]
  tree: MindmapStructureItem['tree']
  layout: MindmapStructureItem['layout']
  computed: MindmapLayout
  connectors: readonly MindmapRenderConnector[]
}

export type ProjectionRead = {
  snapshot: EditorPublishedSources['snapshot']
  scene: {
    list: store.ReadStore<readonly {
      kind: 'mindmap' | 'node' | 'edge'
      id: string
    }[]>
  }
  node: ProjectionNodeRead
  edge: ProjectionEdgeRead
  selection: ProjectionSelectionRead
  mindmap: {
    layout: store.KeyedReadStore<NodeId, ProjectionMindmapLayout | undefined>
  }
}

export const createProjectionRead = ({
  document,
  published,
  selection,
  nodeType
}: {
  document: Pick<DocumentRead, 'node' | 'edge' | 'mindmap'>
  published: Pick<EditorPublishedSources, 'snapshot' | 'scene' | 'node' | 'edge' | 'mindmap'>
  selection: store.ReadStore<SelectionTarget>
  nodeType: NodeTypeSupport
}): ProjectionRead => {
  const node = createProjectionNodeRead({
    document,
    published,
    type: nodeType
  })
  const edge = createProjectionEdgeRead({
    document,
    published,
    node
  })
  const sceneList: ProjectionRead['scene']['list'] = store.createDerivedStore({
    get: () => store.read(published.scene).items,
    isEqual: (left, right) => left === right
  })
  const mindmapLayout: ProjectionRead['mindmap']['layout'] = store.createKeyedDerivedStore({
    get: (mindmapId: NodeId) => {
      const structure = store.read(document.mindmap.structure, mindmapId)
      const current = store.read(published.mindmap, mindmapId)
      const computed = current?.tree.layout
      if (!structure || !current || !computed) {
        return undefined
      }

      return {
        id: structure.id,
        rootId: structure.rootId,
        nodeIds: structure.nodeIds,
        tree: structure.tree,
        layout: structure.layout,
        computed,
        connectors: current.render.connectors
      }
    },
    isEqual: (left, right) => left === right || (
      left !== undefined
      && right !== undefined
      && left.rootId === right.rootId
      && left.nodeIds === right.nodeIds
      && left.tree === right.tree
      && left.layout === right.layout
      && left.computed === right.computed
      && left.connectors === right.connectors
    )
  })

  return {
    snapshot: published.snapshot,
    scene: {
      list: sceneList
    },
    node,
    edge,
    selection: createProjectionSelectionRead({
      source: selection,
      node,
      edge
    }),
    mindmap: {
      layout: mindmapLayout
    }
  }
}
