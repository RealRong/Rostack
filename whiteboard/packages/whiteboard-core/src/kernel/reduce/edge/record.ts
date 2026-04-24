import { changeSet, json, record } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { getEdge } from '@whiteboard/core/kernel/reduce/runtime'

const applyEdgeRecordMutation = (
  edge: import('@whiteboard/core/types').Edge,
  scope: import('@whiteboard/core/types').EdgeRecordScope,
  mutation: { op: 'set'; path: string; value: unknown } | { op: 'unset'; path: string }
) => {
  const current = scope === 'data'
    ? edge.data
    : edge.style
  const result = record.apply(current, mutation)
  if (!result.ok) {
    return result
  }
  return {
    ok: true as const,
    edge: {
      ...edge,
      ...(scope === 'data'
        ? { data: result.value as import('@whiteboard/core/types').Edge['data'] }
        : { style: result.value as import('@whiteboard/core/types').Edge['style'] })
    }
  }
}

export const createEdgeRecordApi = (
  tx: ReducerTx
) => ({
  set: (
    id: import('@whiteboard/core/types').EdgeId,
    scope: import('@whiteboard/core/types').EdgeRecordScope,
    path: string,
    value: unknown
  ) => {
    const current = getEdge(tx._runtime.draft, id)
    if (!current) {
      throw new Error(`Edge ${id} not found.`)
    }
    const currentRoot = scope === 'data'
      ? current.data
      : current.style
    const previous = tx.read.record.path(currentRoot, path)
    tx._runtime.inverse.unshift(previous === undefined
      ? {
          type: 'edge.record.unset',
          id,
          scope,
          path
        }
        : {
          type: 'edge.record.set',
          id,
          scope,
          path,
          value: json.clone(previous)
        })
    const next = applyEdgeRecordMutation(current, scope, {
      op: 'set',
      path,
      value
    })
    if (!next.ok) {
      throw new Error(next.message)
    }
    tx._runtime.draft.edges.set(id, next.edge)
    changeSet.markUpdated(tx._runtime.changes.edges, id)
    tx.dirty.edge.value(id)
  },
  unset: (
    id: import('@whiteboard/core/types').EdgeId,
    scope: import('@whiteboard/core/types').EdgeRecordScope,
    path: string
  ) => {
    const current = getEdge(tx._runtime.draft, id)
    if (!current) {
      throw new Error(`Edge ${id} not found.`)
    }
    const currentRoot = scope === 'data'
      ? current.data
      : current.style
    tx._runtime.inverse.unshift({
      type: 'edge.record.set',
      id,
      scope,
      path,
      value: json.clone(tx.read.record.path(currentRoot, path))
    })
    const next = applyEdgeRecordMutation(current, scope, {
      op: 'unset',
      path
    })
    if (!next.ok) {
      throw new Error(next.message)
    }
    tx._runtime.draft.edges.set(id, next.edge)
    changeSet.markUpdated(tx._runtime.changes.edges, id)
    tx.dirty.edge.value(id)
  }
})
