import type { TransformHandle } from '@whiteboard/core/node'
import type {
  EdgeAnchor,
  EdgeId,
  MindmapNodeId,
  NodeId
} from '@whiteboard/core/types'

export type EditorPick =
  | { kind: 'background' }
  | {
      kind: 'selection-box'
      part: 'body' | 'transform'
      handle?: {
        id: TransformHandle['id']
        kind: TransformHandle['kind']
        direction?: TransformHandle['direction']
      }
    }
  | {
      kind: 'node'
      id: NodeId
      part: 'body' | 'shell' | 'transform' | 'connect'
      handle?: {
        id: TransformHandle['id']
        kind: TransformHandle['kind']
        direction?: TransformHandle['direction']
      }
      side?: EdgeAnchor['side']
    }
  | {
      kind: 'edge'
      id: EdgeId
      part: 'body' | 'end' | 'path'
      end?: 'source' | 'target'
      index?: number
      insert?: number
    }
  | {
      kind: 'mindmap'
      treeId: NodeId
      nodeId: MindmapNodeId
    }
