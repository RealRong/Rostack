import { compileNodeFieldUpdate } from '@whiteboard/core/schema'
import type { NodeUpdateInput } from '@whiteboard/core/types'
import type { EngineInstance } from '@whiteboard/engine'
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
  value: string | number | undefined
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
  update: engine.commands.node.update,
  updateMany: engine.commands.node.updateMany
})
