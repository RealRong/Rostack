import { json, record } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { markChange } from '@whiteboard/core/kernel/reduce/commit'
import { getNode } from '@whiteboard/core/kernel/reduce/runtime'

const applyNodeRecordMutation = (
  node: import('@whiteboard/core/types').Node,
  scope: import('@whiteboard/core/types').NodeRecordScope,
  mutation: { op: 'set'; path: string; value: unknown } | { op: 'unset'; path: string }
) => {
  const current = scope === 'data'
    ? node.data
    : node.style
  const result = record.apply(current, mutation)
  if (!result.ok) {
    return result
  }
  return {
    ok: true as const,
    node: {
      ...node,
      ...(scope === 'data'
        ? { data: result.value as import('@whiteboard/core/types').Node['data'] }
        : { style: result.value as import('@whiteboard/core/types').Node['style'] })
    }
  }
}

export const createNodeRecordApi = (
  tx: ReducerTx
) => ({
  set: (
    id: import('@whiteboard/core/types').NodeId,
    scope: import('@whiteboard/core/types').NodeRecordScope,
    path: string,
    value: unknown
  ) => {
    const current = getNode(tx._runtime.draft, id)
    if (!current) {
      throw new Error(`Node ${id} not found.`)
    }
    const currentRoot = scope === 'data'
      ? current.data
      : current.style
    const previous = tx.read.record.path(currentRoot, path)
    tx._runtime.inverse.unshift(previous === undefined
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
    tx._runtime.draft.nodes.set(id, next.node)
    markChange(tx._runtime.changes.nodes, 'update', id)
    tx.dirty.node.value(id)
    if (current.owner?.kind === 'mindmap') {
      tx.dirty.mindmap.layout(current.owner.id)
    }
  },
  unset: (
    id: import('@whiteboard/core/types').NodeId,
    scope: import('@whiteboard/core/types').NodeRecordScope,
    path: string
  ) => {
    const current = getNode(tx._runtime.draft, id)
    if (!current) {
      throw new Error(`Node ${id} not found.`)
    }
    const currentRoot = scope === 'data'
      ? current.data
      : current.style
    tx._runtime.inverse.unshift({
      type: 'node.record.set',
      id,
      scope,
      path,
      value: json.clone(tx.read.record.path(currentRoot, path))
    })
    const next = applyNodeRecordMutation(current, scope, {
      op: 'unset',
      path
    })
    if (!next.ok) {
      throw new Error(next.message)
    }
    tx._runtime.draft.nodes.set(id, next.node)
    markChange(tx._runtime.changes.nodes, 'update', id)
    tx.dirty.node.value(id)
    if (current.owner?.kind === 'mindmap') {
      tx.dirty.mindmap.layout(current.owner.id)
    }
  }
})
