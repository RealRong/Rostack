import { edge as edgeApi } from '@whiteboard/core/edge'
import type { SelectionInput } from '@whiteboard/core/selection'
import type {
  EdgeLabel,
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type { DocumentQuery } from '@whiteboard/editor-scene'
import type {
  EditCaret,
  EditField
} from '@whiteboard/editor/session/edit'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorSceneApi } from '@whiteboard/editor/types/editor'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { EditorWrite } from '@whiteboard/editor/write'

export const applySelectionMutation = (
  session: Pick<EditorSession, 'mutate'>,
  apply: () => boolean
) => {
  if (!apply()) {
    return
  }

  session.mutate.edit.clear()
}

export const replaceSelection = (
  ctx: {
    session: Pick<EditorSession, 'mutate'>
  },
  input: SelectionInput
) => {
  applySelectionMutation(ctx.session, () => ctx.session.mutate.selection.replace(input))
}

export const clearSelection = (
  ctx: {
    session: Pick<EditorSession, 'mutate'>
  }
) => {
  applySelectionMutation(ctx.session, () => ctx.session.mutate.selection.clear())
}

export const startNodeEdit = (
  ctx: {
    session: Pick<EditorSession, 'mutate'>
    document: Pick<DocumentQuery, 'node'>
    nodeType: Pick<NodeTypeSupport, 'edit'>
  },
  nodeId: NodeId,
  field: EditField,
  options?: {
    caret?: EditCaret
  }
) => {
  const committed = ctx.document.node(nodeId)
  if (!committed) {
    return
  }

  const capability = ctx.nodeType.edit(committed.type, field)
  if (!capability) {
    return
  }

  const value = committed.data?.[field]
  const text = typeof value === 'string' ? value : ''

  ctx.session.mutate.edit.set({
    kind: 'node',
    nodeId,
    field,
    text,
    composing: false,
    caret: options?.caret ?? { kind: 'end' }
  })
}

export const startEdgeLabelEdit = (
  ctx: {
    session: Pick<EditorSession, 'mutate'>
    document: Pick<DocumentQuery, 'edge'>
  },
  edgeId: EdgeId,
  labelId: string,
  options?: {
    caret?: EditCaret
  }
) => {
  const edge = ctx.document.edge(edgeId)
  const label = edge?.labels?.find((entry: EdgeLabel) => entry.id === labelId)
  if (!edge || !label) {
    return
  }

  const text = typeof label.text === 'string' ? label.text : ''

  ctx.session.mutate.edit.set({
    kind: 'edge-label',
    edgeId,
    labelId,
    text,
    composing: false,
    caret: options?.caret ?? { kind: 'end' }
  })
}

export const removeEdgeRoutePoint = (
  ctx: {
    graph: Pick<EditorSceneApi, 'query'>
    write: Pick<EditorWrite, 'edge'>
  },
  edgeId: EdgeId,
  index: number
) => {
  const edge = ctx.graph.query.edge.get(edgeId)?.base.edge
  if (!edge) {
    throw new Error(`Edge ${edgeId} not found.`)
  }

  const patch = edgeApi.route.remove(edge, index)
  if (!patch) {
    throw new Error(`Edge route point ${edgeId}:${index} not found.`)
  }

  ctx.write.edge.route.set(edgeId, patch.route ?? {
    kind: 'auto'
  })
}
