import { compileNodeFieldUpdate } from '@whiteboard/core/schema'
import type { NodeId, NodeUpdateInput } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { NodePatchWriter } from './types'

export const mergeNodeUpdates = (
  ...updates: Array<NodeUpdateInput | undefined>
): NodeUpdateInput => {
  const fields = updates.reduce<NodeUpdateInput['fields']>(
    (current, update) => {
      if (!update?.fields) {
        return current
      }

      return {
        ...(current ?? {}),
        ...update.fields
      }
    },
    undefined
  )
  const records = updates.flatMap((update) => update?.records ?? [])

  return {
    ...(fields ? { fields } : {}),
    ...(records.length ? { records } : {})
  }
}

export const styleUpdate = (
  path: string,
  value: unknown
) => compileNodeFieldUpdate(
  {
    scope: 'style',
    path
  },
  value
)

export const dataUpdate = (
  path: string,
  value: unknown
) => compileNodeFieldUpdate(
  {
    scope: 'data',
    path
  },
  value
)

export const toNodeBatchUpdates = (
  nodeIds: readonly NodeId[],
  update: NodeUpdateInput
) => nodeIds.map((id) => ({
  id,
  update
}))

export const toNodeStyleUpdates = (
  nodeIds: readonly NodeId[],
  path: string,
  value: unknown
) => toNodeBatchUpdates(
  nodeIds,
  styleUpdate(path, value)
)

export const toNodeDataUpdates = (
  nodeIds: readonly NodeId[],
  path: string,
  value: unknown
) => toNodeBatchUpdates(
  nodeIds,
  dataUpdate(path, value)
)

export const createNodePatchWriter = (
  engine: Engine
): NodePatchWriter => ({
  update: (id, update) => engine.execute({
    type: 'node.patch',
    updates: [{
      id,
      update
    }]
  }),
  updateMany: (updates, options) => engine.execute({
    type: 'node.patch',
    updates,
    origin: options?.origin
  })
})
