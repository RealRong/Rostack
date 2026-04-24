import { changeSet, json } from '@shared/core'
import type { Path } from '@shared/mutation'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { getNode } from '@whiteboard/core/kernel/reduce/runtime'
import { applyRecordPathMutation } from '../../../mutation/recordPath'

const applyNodeRecordMutation = (
  node: import('@whiteboard/core/types').Node,
  scope: import('@whiteboard/core/types').NodeRecordScope,
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
    path: Path,
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
    tx.inverse.prepend(previous === undefined
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
    changeSet.markUpdated(tx._runtime.changes.nodes, id)
    tx.dirty.node.touch(id)
    if (current.owner?.kind === 'mindmap') {
      tx.dirty.mindmap.layout(current.owner.id)
    }
  },
  unset: (
    id: import('@whiteboard/core/types').NodeId,
    scope: import('@whiteboard/core/types').NodeRecordScope,
    path: Path
  ) => {
    const current = getNode(tx._runtime.draft, id)
    if (!current) {
      throw new Error(`Node ${id} not found.`)
    }
    const currentRoot = scope === 'data'
      ? current.data
      : current.style
    tx.inverse.prepend({
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
    changeSet.markUpdated(tx._runtime.changes.nodes, id)
    tx.dirty.node.touch(id)
    if (current.owner?.kind === 'mindmap') {
      tx.dirty.mindmap.layout(current.owner.id)
    }
  }
})
