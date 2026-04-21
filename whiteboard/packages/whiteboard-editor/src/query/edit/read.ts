import { store } from '@shared/core'
import type { EdgeId, NodeId, Size } from '@whiteboard/core/types'
import type {
  EditCaret,
  EditField,
  EditSession
} from '@whiteboard/editor/session/edit'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'

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
  node: store.KeyedReadStore<NodeId, NodeEditView | undefined>
  edgeLabel: store.KeyedReadStore<EdgeId, EdgeLabelEditView | undefined>
}

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
  source: store.ReadStore<EditSession>,
  layout: Pick<EditorLayout, 'edit'>
): EditorEditRead => ({
  node: store.createKeyedDerivedStore<NodeId, NodeEditView | undefined>({
    get: (nodeId) => {
      const session = store.read(source)
      if (
        !session
        || session.kind !== 'node'
        || session.nodeId !== nodeId
      ) {
        return undefined
      }

      const draftLayout = store.read(layout.edit.node, nodeId)
      return {
        field: session.field,
        text: session.draft.text,
        caret: session.caret,
        size: session.field === 'text'
          ? draftLayout?.size
          : undefined,
        fontSize: session.field === 'text'
          ? draftLayout?.fontSize
          : undefined
      }
    },
    isEqual: (left, right) => left === right || (
      left !== undefined
      && right !== undefined
      && left.field === right.field
      && left.text === right.text
      && isCaretEqual(left.caret, right.caret)
      && left.size?.width === right.size?.width
      && left.size?.height === right.size?.height
      && left.fontSize === right.fontSize
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
          text: session.draft.text,
          caret: session.caret
        }
      ]])
    },
    emptyValue: undefined
  })
})
