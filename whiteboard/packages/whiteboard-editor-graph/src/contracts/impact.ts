import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'

export type Token =
  | {
      domain: 'document'
      kind: 'root' | 'entities' | 'relations'
    }
  | {
      domain: 'session'
      kind: 'edit' | 'draft' | 'preview' | 'tool'
    }
  | {
      domain: 'measure'
      kind: 'text'
      nodeIds?: ReadonlySet<NodeId>
      edgeIds?: ReadonlySet<EdgeId>
    }
  | {
      domain: 'interaction'
      kind: 'selection' | 'hover' | 'drag'
    }
  | {
      domain: 'viewport'
      kind: 'camera' | 'visible-world'
    }
  | {
      domain: 'clock'
      kind: 'tick'
    }
  | {
      domain: 'graph'
      kind: 'node'
      ids: ReadonlySet<NodeId>
    }
  | {
      domain: 'graph'
      kind: 'edge'
      ids: ReadonlySet<EdgeId>
    }
  | {
      domain: 'graph'
      kind: 'mindmap'
      ids: ReadonlySet<MindmapId>
    }
  | {
      domain: 'graph'
      kind: 'group'
      ids: ReadonlySet<GroupId>
    }
  | {
      domain: 'structure'
      kind: 'mindmap-tree'
      ids: ReadonlySet<MindmapId>
    }
  | {
      domain: 'structure'
      kind: 'group-items'
      ids: ReadonlySet<GroupId>
    }
  | {
      domain: 'tree'
      kind: 'mindmap-layout'
      ids: ReadonlySet<MindmapId>
    }
  | {
      domain: 'element'
      kind: 'node-geometry'
      ids: ReadonlySet<NodeId>
    }
  | {
      domain: 'element'
      kind: 'edge-geometry'
      ids: ReadonlySet<EdgeId>
    }
  | {
      domain: 'ui'
      kind: 'selection' | 'chrome'
    }
  | {
      domain: 'scene'
      kind: 'order' | 'pick' | 'spatial'
    }
