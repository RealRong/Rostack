import { store } from '@shared/core'
import type { EdgeId, NodeId } from '@whiteboard/core/types'
import type {
  EditCaret,
  EditField,
  EditSession
} from '@whiteboard/editor/session/edit'

export type NodeEditView = {
  field: EditField
  text: string
  caret: EditCaret
}

export type EdgeLabelEditView = {
  labelId: string
  text: string
  caret: EditCaret
}

export type EditorEditRead = {
  node: store.KeyedReadStore<NodeId, NodeEditView | undefined>
  edgeLabel: store.KeyedReadStore<EdgeId, EdgeLabelEditView | undefined>
}

const EMPTY_NODE_EDIT_MAP = new Map<NodeId, NodeEditView>()
const EMPTY_EDGE_LABEL_EDIT_MAP = new Map<EdgeId, EdgeLabelEditView>()

const isCaretEqual = (
  left: EditCaret,
  right: EditCaret
) => (
  left.kind === right.kind
  && (
    left.kind !== 'point'
    || (
      right.kind === 'point'
      && left.client.x === right.client.x
      && left.client.y === right.client.y
    )
  )
)

export const createEditRead = (
  source: store.ReadStore<EditSession>
): EditorEditRead => ({
  node: store.createProjectedKeyedStore({
    source,
    select: (session) => {
      if (!session || session.kind !== 'node') {
        return EMPTY_NODE_EDIT_MAP
      }

      return new Map<NodeId, NodeEditView>([[
        session.nodeId,
        {
          field: session.field,
          text: session.text,
          caret: session.caret
        }
      ]])
    },
    emptyValue: undefined,
    isEqual: (left, right) => left === right || (
      left !== undefined
      && right !== undefined
      && left.field === right.field
      && left.text === right.text
      && isCaretEqual(left.caret, right.caret)
    )
  }),
  edgeLabel: store.createProjectedKeyedStore({
    source,
    select: (session) => {
      if (!session || session.kind !== 'edge-label') {
        return EMPTY_EDGE_LABEL_EDIT_MAP
      }

      return new Map<EdgeId, EdgeLabelEditView>([[
        session.edgeId,
        {
          labelId: session.labelId,
          text: session.text,
          caret: session.caret
        }
      ]])
    },
    emptyValue: undefined
  })
})
