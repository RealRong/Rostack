import { changeSet, json } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { getNode } from '@whiteboard/core/kernel/reduce/runtime'

const GEOMETRY_FIELDS = new Set(['position', 'size', 'rotation'])

const setNodeField = <Field extends import('@whiteboard/core/types').NodeField>(
  node: import('@whiteboard/core/types').Node,
  field: Field,
  value: import('@whiteboard/core/types').Node[Field]
): import('@whiteboard/core/types').Node => ({
  ...node,
  [field]: value
})

const unsetNodeField = (
  node: import('@whiteboard/core/types').Node,
  field: import('@whiteboard/core/types').NodeUnsetField
): import('@whiteboard/core/types').Node => {
  const next = { ...node } as import('@whiteboard/core/types').Node & Record<string, unknown>
  delete next[field]
  return next
}

export const createNodeFieldApi = (
  tx: ReducerTx
) => ({
  set: <Field extends import('@whiteboard/core/types').NodeField>(
    id: import('@whiteboard/core/types').NodeId,
    field: Field,
    value: import('@whiteboard/core/types').Node[Field]
  ) => {
    const current = getNode(tx._runtime.draft, id)
    if (!current) {
      throw new Error(`Node ${id} not found.`)
    }
    tx._runtime.inverse.unshift(
      (current as Record<string, unknown>)[field] === undefined && field !== 'position'
        ? {
            type: 'node.field.unset',
            id,
            field: field as import('@whiteboard/core/types').NodeUnsetField
          }
        : {
            type: 'node.field.set',
            id,
            field,
            value: json.clone((current as Record<string, unknown>)[field])
          }
    )
    tx._runtime.draft.nodes.set(id, setNodeField(current, field, value))
    changeSet.markUpdated(tx._runtime.changes.nodes, id)
    if (GEOMETRY_FIELDS.has(field)) {
      tx.dirty.node.geometry(id)
    } else {
      tx.dirty.node.value(id)
    }
    if (field === 'owner' && current.owner?.kind === 'mindmap') {
      tx.dirty.mindmap.layout(current.owner.id)
    }
    if (current.owner?.kind === 'mindmap') {
      tx.dirty.mindmap.layout(current.owner.id)
    }
  },
  unset: (
    id: import('@whiteboard/core/types').NodeId,
    field: import('@whiteboard/core/types').NodeUnsetField
  ) => {
    const current = getNode(tx._runtime.draft, id)
    if (!current) {
      throw new Error(`Node ${id} not found.`)
    }
    tx._runtime.inverse.unshift({
      type: 'node.field.set',
      id,
      field,
      value: json.clone((current as Record<string, unknown>)[field])
    })
    tx._runtime.draft.nodes.set(id, unsetNodeField(current, field))
    changeSet.markUpdated(tx._runtime.changes.nodes, id)
    if (GEOMETRY_FIELDS.has(field)) {
      tx.dirty.node.geometry(id)
    } else {
      tx.dirty.node.value(id)
    }
    if (current.owner?.kind === 'mindmap') {
      tx.dirty.mindmap.layout(current.owner.id)
    }
  }
})
