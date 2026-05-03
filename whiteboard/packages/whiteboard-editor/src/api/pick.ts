import type { TransformHandle } from '@whiteboard/core/node'
import type {
  EdgeAnchor,
  MindmapNodeId,
} from '@whiteboard/core/types'

export type TransformPickHandle = {
  id: TransformHandle['id']
  kind: TransformHandle['kind']
  direction?: TransformHandle['direction']
}

export type EditorPick =
  | { kind: 'background' }
  | {
      kind: 'group'
      id: string
      part: 'shell'
    }
  | {
      kind: 'selection-box'
      part: 'body' | 'transform'
      handle?: TransformPickHandle
    }
  | {
      kind: 'node'
      id: string
      part: 'body' | 'transform' | 'connect'
      handle?: TransformPickHandle
      side?: EdgeAnchor['side']
    }
  | {
      kind: 'node'
      id: string
      part: 'field'
      field: 'text' | 'title'
    }
  | {
      kind: 'edge'
      id: string
      part: 'body' | 'end' | 'path' | 'label'
      labelId?: string
      end?: 'source' | 'target'
      index?: number
      insert?: number
      segment?: number
    }
  | {
      kind: 'mindmap'
      treeId: string
      nodeId: MindmapNodeId
    }
