import { compileNodeFieldUpdate } from '@whiteboard/core/schema'
import type { NodeUpdateInput } from '@whiteboard/core/types'
import type { EngineInstance } from '@engine-types/instance'
import type { EditorNodeDocumentCommands } from '../../../types/editor'

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

export const createNodeDocumentCommands = (
  engine: EngineInstance
): EditorNodeDocumentCommands => ({
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
