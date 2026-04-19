import {
  createProjectedKeyedStore,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { EdgeId, NodeId, Size } from '@whiteboard/core/types'
import type {
  EditCaret,
  EditField,
  EditSession
} from '@whiteboard/editor/session/edit'

export type NodeEditView = {
  field: EditField
  text: string
  caret: EditCaret
  size?: Size
  fontSize?: number
}

export type EdgeLabelEditView = {
  labelId: string
  text: string
  caret: EditCaret
}

export type EditorEditRead = {
  node: KeyedReadStore<NodeId, NodeEditView | undefined>
  edgeLabel: KeyedReadStore<EdgeId, EdgeLabelEditView | undefined>
}

const EMPTY_NODE_EDIT_MAP = new Map<NodeId, NodeEditView>()
const EMPTY_EDGE_LABEL_EDIT_MAP = new Map<EdgeId, EdgeLabelEditView>()

export const createEditRead = (
  source: ReadStore<EditSession>
): EditorEditRead => ({
  node: createProjectedKeyedStore({
    source,
    select: (session) => {
      if (!session || session.kind !== 'node') {
        return EMPTY_NODE_EDIT_MAP
      }

      return new Map<NodeId, NodeEditView>([[
        session.nodeId,
        {
          field: session.field,
          text: session.draft.text,
          caret: session.caret,
          size: session.field === 'text'
            ? session.layout.size
            : undefined,
          fontSize: session.field === 'text'
            ? session.layout.fontSize
            : undefined
        }
      ]])
    },
    emptyValue: undefined
  }),
  edgeLabel: createProjectedKeyedStore({
    source,
    select: (session) => {
      if (!session || session.kind !== 'edge-label') {
        return EMPTY_EDGE_LABEL_EDIT_MAP
      }

      return new Map<EdgeId, EdgeLabelEditView>([[
        session.edgeId,
        {
          labelId: session.labelId,
          text: session.draft.text,
          caret: session.caret
        }
      ]])
    },
    emptyValue: undefined
  })
})
