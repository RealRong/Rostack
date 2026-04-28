import { json } from '@shared/core'
import {
  record as draftRecord,
  type RecordWrite
} from '@shared/draft'
import type {
  Node,
  NodeFieldPatch,
  NodeId,
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

const NODE_PATCH_FIELDS = [
  'position',
  'size',
  'rotation',
  'groupId',
  'owner',
  'locked'
] as const

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const applyNodeFieldPatch = (
  node: Node,
  fields?: NodeFieldPatch
): Node => {
  if (!fields) {
    return node
  }

  let next = node
  NODE_PATCH_FIELDS.forEach((field) => {
    if (!hasOwn(fields, field)) {
      return
    }

    const value = json.clone(fields[field])
    next = {
      ...next,
      [field]: value
    }
  })
  return next
}

const buildNodeFieldInverse = (
  node: Node,
  fields?: NodeFieldPatch
): NodeFieldPatch | undefined => {
  if (!fields) {
    return undefined
  }

  const inverse: NodeFieldPatch = {}
  if (hasOwn(fields, 'position')) {
    inverse.position = json.clone(node.position)
  }
  if (hasOwn(fields, 'size')) {
    inverse.size = json.clone(node.size)
  }
  if (hasOwn(fields, 'rotation')) {
    inverse.rotation = json.clone(node.rotation)
  }
  if (hasOwn(fields, 'groupId')) {
    inverse.groupId = json.clone(node.groupId)
  }
  if (hasOwn(fields, 'owner')) {
    inverse.owner = json.clone(node.owner)
  }
  if (hasOwn(fields, 'locked')) {
    inverse.locked = json.clone(node.locked)
  }

  return Object.keys(inverse).length > 0
    ? inverse
    : undefined
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
    state.draft.canvasOrder.set(appendCanvasRef(state.draft.canvasOrder.current(), {
      kind: 'node',
      id: node.id
    }))
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
    state.draft.canvasOrder.set(insertCanvasSlot(state.draft.canvasOrder.current(), {
      kind: 'node',
      id: node.id
    }, slot))
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
    state.draft.canvasOrder.set(removeCanvasRef(state.draft.canvasOrder.current(), {
      kind: 'node',
      id
    }))
    markCanvasOrderTouched(state)
  }
  markNodeRemoved(state, id)
}

export const patchNode = (
  state: WhiteboardReduceState,
  id: NodeId,
  input: {
    fields?: NodeFieldPatch
    record?: RecordWrite
  }
): void => {
  const current = getNode(state.draft, id)
  if (!current) {
    throw new Error(`Node ${id} not found.`)
  }

  const inverseFields = buildNodeFieldInverse(current, input.fields)
  const inverseRecord = input.record
    ? draftRecord.inverse(current, input.record)
    : undefined
  const fieldPatched = applyNodeFieldPatch(current, input.fields)
  const next = input.record
    ? draftRecord.apply(fieldPatched, input.record)
    : fieldPatched

  state.inverse.prepend({
    type: 'node.patch',
    id,
    ...(inverseFields ? { fields: inverseFields } : {}),
    ...(inverseRecord && Object.keys(inverseRecord).length
      ? { record: inverseRecord }
      : {})
  })
  state.draft.nodes.set(id, next)
  markNodeUpdated(state, id)
  enqueueNodeOwnerLayouts(state, [
    current.owner,
    next.owner
  ])
}
