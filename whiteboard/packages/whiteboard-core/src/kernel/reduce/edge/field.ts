import { changeSet, json } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { getEdge } from '@whiteboard/core/kernel/reduce/runtime'

const GEOMETRY_FIELDS = new Set(['source', 'target', 'type'])

const setEdgeField = <Field extends import('@whiteboard/core/types').EdgeField>(
  edge: import('@whiteboard/core/types').Edge,
  field: Field,
  value: import('@whiteboard/core/types').Edge[Field]
): import('@whiteboard/core/types').Edge => ({
  ...edge,
  [field]: value
})

const unsetEdgeField = (
  edge: import('@whiteboard/core/types').Edge,
  field: import('@whiteboard/core/types').EdgeUnsetField
): import('@whiteboard/core/types').Edge => {
  const next = { ...edge } as import('@whiteboard/core/types').Edge & Record<string, unknown>
  delete next[field]
  return next
}

export const createEdgeFieldApi = (
  tx: ReducerTx
) => ({
  set: <Field extends import('@whiteboard/core/types').EdgeField>(
    id: import('@whiteboard/core/types').EdgeId,
    field: Field,
    value: import('@whiteboard/core/types').Edge[Field]
  ) => {
    const current = getEdge(tx._runtime.draft, id)
    if (!current) {
      throw new Error(`Edge ${id} not found.`)
    }
    tx._runtime.inverse.unshift(
      ((current as unknown as Record<string, unknown>)[field] === undefined) && field !== 'source' && field !== 'target' && field !== 'type'
        ? {
            type: 'edge.field.unset',
            id,
            field: field as import('@whiteboard/core/types').EdgeUnsetField
          }
        : {
            type: 'edge.field.set',
            id,
            field,
            value: json.clone((current as unknown as Record<string, unknown>)[field])
          }
    )
    tx._runtime.draft.edges.set(id, setEdgeField(current, field, value))
    changeSet.markUpdated(tx._runtime.changes.edges, id)
    if (GEOMETRY_FIELDS.has(field)) {
      tx.dirty.edge.geometry(id)
    } else {
      tx.dirty.edge.value(id)
    }
  },
  unset: (
    id: import('@whiteboard/core/types').EdgeId,
    field: import('@whiteboard/core/types').EdgeUnsetField
  ) => {
    const current = getEdge(tx._runtime.draft, id)
    if (!current) {
      throw new Error(`Edge ${id} not found.`)
    }
    tx._runtime.inverse.unshift({
      type: 'edge.field.set',
      id,
      field,
      value: json.clone((current as unknown as Record<string, unknown>)[field])
    })
    tx._runtime.draft.edges.set(id, unsetEdgeField(current, field))
    changeSet.markUpdated(tx._runtime.changes.edges, id)
    tx.dirty.edge.value(id)
  }
})
