import type { EdgeLabel, EdgeId, NodeId } from '@whiteboard/core/types'
import type { DocumentFrame } from '@whiteboard/editor-scene'
import type { EditCaret, EditField } from '@whiteboard/editor/session/edit'
import type { EditorCommand } from '@whiteboard/editor/state-engine/intents'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'

export const startNodeEdit = (input: {
  session: Pick<EditorSession, 'dispatch'>
  document: Pick<DocumentFrame, 'node'>
  nodeType: Pick<NodeTypeSupport, 'edit'>
  nodeId: NodeId
  field: EditField
  caret?: EditCaret
}) => {
  const committed = input.document.node(input.nodeId)
  if (!committed) {
    return
  }

  const capability = input.nodeType.edit(committed.type, input.field)
  if (!capability) {
    return
  }

  const value = committed.data?.[input.field]
  input.session.dispatch({
    type: 'edit.set',
    edit: {
      kind: 'node',
      nodeId: input.nodeId,
      field: input.field,
      text: typeof value === 'string' ? value : '',
      composing: false,
      caret: input.caret ?? { kind: 'end' }
    }
  } satisfies EditorCommand)
}

export const startEdgeLabelEdit = (input: {
  session: Pick<EditorSession, 'dispatch'>
  document: Pick<DocumentFrame, 'edge'>
  edgeId: EdgeId
  labelId: string
  caret?: EditCaret
}) => {
  const edge = input.document.edge(input.edgeId)
  const label = edge?.labels?.find((entry: EdgeLabel) => entry.id === input.labelId)
  if (!edge || !label) {
    return
  }

  input.session.dispatch({
    type: 'edit.set',
    edit: {
      kind: 'edge-label',
      edgeId: input.edgeId,
      labelId: input.labelId,
      text: typeof label.text === 'string' ? label.text : '',
      composing: false,
      caret: input.caret ?? { kind: 'end' }
    }
  } satisfies EditorCommand)
}
