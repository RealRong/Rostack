import { edge as edgeApi } from '@whiteboard/core/edge'
import type { SelectionInput } from '@whiteboard/core/selection'
import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type { EditorDocumentRuntimeSource } from '@whiteboard/editor/document/source'
import type { EditorSceneRuntime } from '@whiteboard/editor/scene/source'
import type {
  EditCaret,
  EditField
} from '@whiteboard/editor/session/edit'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
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
    document: Pick<EditorDocumentRuntimeSource, 'node'>
    registry: Pick<NodeRegistry, 'get'>
  },
  nodeId: NodeId,
  field: EditField,
  options?: {
    caret?: EditCaret
  }
) => {
  const committed = ctx.document.node.committed.get(nodeId)
  if (!committed) {
    return
  }

  const capability = ctx.registry.get(committed.node.type)?.edit?.fields?.[field]
  if (!capability) {
    return
  }

  const text = typeof committed.node.data?.[field] === 'string'
    ? committed.node.data[field] as string
    : ''

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
    document: Pick<EditorDocumentRuntimeSource, 'edge'>
  },
  edgeId: EdgeId,
  labelId: string,
  options?: {
    caret?: EditCaret
  }
) => {
  const edge = ctx.document.edge.item.get(edgeId)?.edge
  const label = edge?.labels?.find((entry) => entry.id === labelId)
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
    graph: Pick<EditorSceneRuntime, 'edge'>
    write: Pick<EditorWrite, 'edge'>
  },
  edgeId: EdgeId,
  index: number
) => {
  const edge = ctx.graph.edge.graph.get(edgeId)?.base.edge
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
