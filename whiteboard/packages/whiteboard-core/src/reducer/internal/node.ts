import { json } from '@shared/core'
import { applyRecordPathMutation, readRecordPath } from '../../mutation/recordPath'
import type { Path } from '@shared/mutation'
import type {
  Node,
  NodeField,
  NodeId,
  NodeRecordScope,
  NodeUnsetField
} from '@whiteboard/core/types'
import {
  captureNode,
  enqueueMindmapLayout,
  getNode,
  isTopLevelNode,
  markCanvasOrderTouched,
  markNodeAdded,
  markNodeRemoved,
  markNodeUpdated,
  type WhiteboardReduceState
} from './state'
import {
  appendCanvasRef,
  captureCanvasSlot,
  insertCanvasSlot,
  removeCanvasRef
} from './canvas'

const setNodeField = <Field extends NodeField>(
  node: Node,
  field: Field,
  value: Node[Field]
): Node => ({
  ...node,
  [field]: value
})

const unsetNodeField = (
  node: Node,
  field: NodeUnsetField
): Node => {
  const next = { ...node } as Node & Record<string, unknown>
  delete next[field]
  return next
}

const applyNodeRecordMutation = (
  node: Node,
  scope: NodeRecordScope,
  mutation: { op: 'set'; path: Path; value: unknown } | { op: 'unset'; path: Path }
) => {
  const current = scope === 'data'
    ? node.data
    : node.style
  const result = applyRecordPathMutation(current, mutation)
  if (!result.ok) {
    return result
  }

  return {
    ok: true as const,
    node: {
      ...node,
      ...(scope === 'data'
        ? { data: result.value as Node['data'] }
        : { style: result.value as Node['style'] })
    }
  }
}

const enqueueNodeOwnerLayouts = (
  state: WhiteboardReduceState,
  owners: readonly Node['owner'][]
): void => {
  const mindmapIds = new Set(
    owners
      .filter((owner): owner is NonNullable<Node['owner']> => owner !== undefined)
      .filter((owner) => owner.kind === 'mindmap')
      .map((owner) => owner.id)
  )
  mindmapIds.forEach((mindmapId) => {
    enqueueMindmapLayout(state, mindmapId)
  })
}

export const createNode = (
  state: WhiteboardReduceState,
  node: Node
): void => {
  state.draft.nodes.set(node.id, node)
  if (isTopLevelNode(node)) {
    state.draft.canvasOrder = appendCanvasRef(state.draft.canvasOrder, {
      kind: 'node',
      id: node.id
    })
    markCanvasOrderTouched(state)
  }
  state.inverse.prepend({
    type: 'node.delete',
    id: node.id
  })
  markNodeAdded(state, node.id)
}

export const restoreNode = (
  state: WhiteboardReduceState,
  node: Node,
  slot?: import('@whiteboard/core/types').CanvasSlot
): void => {
  state.draft.nodes.set(node.id, node)
  if (isTopLevelNode(node)) {
    state.draft.canvasOrder = insertCanvasSlot(state.draft.canvasOrder, {
      kind: 'node',
      id: node.id
    }, slot)
    markCanvasOrderTouched(state)
  }
  state.inverse.prepend({
    type: 'node.delete',
    id: node.id
  })
  markNodeAdded(state, node.id)
}

export const deleteNode = (
  state: WhiteboardReduceState,
  id: NodeId
): void => {
  const current = getNode(state.draft, id)
  if (!current) {
    return
  }

  const slot = isTopLevelNode(current)
    ? captureCanvasSlot(state, {
        kind: 'node',
        id
      })
    : undefined
  state.inverse.prepend({
    type: 'node.restore',
    node: captureNode(state, id),
    slot
  })
  state.draft.nodes.delete(id)
  if (slot) {
    state.draft.canvasOrder = removeCanvasRef(state.draft.canvasOrder, {
      kind: 'node',
      id
    })
    markCanvasOrderTouched(state)
  }
  markNodeRemoved(state, id)
}

export const setNodeFieldValue = <Field extends NodeField>(
  state: WhiteboardReduceState,
  id: NodeId,
  field: Field,
  value: Node[Field]
): void => {
  const current = getNode(state.draft, id)
  if (!current) {
    throw new Error(`Node ${id} not found.`)
  }

  const previous = (current as Record<string, unknown>)[field]
  state.inverse.prepend(
    previous === undefined && field !== 'position'
      ? {
          type: 'node.field.unset',
          id,
          field: field as NodeUnsetField
        }
      : {
          type: 'node.field.set',
          id,
          field,
          value: json.clone(previous)
        }
  )
  state.draft.nodes.set(id, setNodeField(current, field, value))
  markNodeUpdated(state, id)
  enqueueNodeOwnerLayouts(state, [
    current.owner,
    field === 'owner'
      ? value as Node['owner']
      : undefined
  ])
}

export const unsetNodeFieldValue = (
  state: WhiteboardReduceState,
  id: NodeId,
  field: NodeUnsetField
): void => {
  const current = getNode(state.draft, id)
  if (!current) {
    throw new Error(`Node ${id} not found.`)
  }

  state.inverse.prepend({
    type: 'node.field.set',
    id,
    field,
    value: json.clone((current as Record<string, unknown>)[field])
  })
  state.draft.nodes.set(id, unsetNodeField(current, field))
  markNodeUpdated(state, id)
  enqueueNodeOwnerLayouts(state, [current.owner])
}

export const setNodeRecord = (
  state: WhiteboardReduceState,
  id: NodeId,
  scope: NodeRecordScope,
  path: Path,
  value: unknown
): void => {
  const current = getNode(state.draft, id)
  if (!current) {
    throw new Error(`Node ${id} not found.`)
  }

  const currentRoot = scope === 'data'
    ? current.data
    : current.style
  const previous = readRecordPath(currentRoot, path)
  state.inverse.prepend(previous === undefined
    ? {
        type: 'node.record.unset',
        id,
        scope,
        path
      }
    : {
        type: 'node.record.set',
        id,
        scope,
        path,
        value: json.clone(previous)
      })
  const next = applyNodeRecordMutation(current, scope, {
    op: 'set',
    path,
    value
  })
  if (!next.ok) {
    throw new Error(next.message)
  }

  state.draft.nodes.set(id, next.node)
  markNodeUpdated(state, id)
  enqueueNodeOwnerLayouts(state, [current.owner])
}

export const unsetNodeRecord = (
  state: WhiteboardReduceState,
  id: NodeId,
  scope: NodeRecordScope,
  path: Path
): void => {
  const current = getNode(state.draft, id)
  if (!current) {
    throw new Error(`Node ${id} not found.`)
  }

  const currentRoot = scope === 'data'
    ? current.data
    : current.style
  state.inverse.prepend({
    type: 'node.record.set',
    id,
    scope,
    path,
    value: json.clone(readRecordPath(currentRoot, path))
  })
  const next = applyNodeRecordMutation(current, scope, {
    op: 'unset',
    path
  })
  if (!next.ok) {
    throw new Error(next.message)
  }

  state.draft.nodes.set(id, next.node)
  markNodeUpdated(state, id)
  enqueueNodeOwnerLayouts(state, [current.owner])
}
