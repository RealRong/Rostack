import type { EngineInstance } from '@engine-types/instance'
import type {
  EditorNodeDocumentCommands,
  EditorNodeLockCommands
} from '../../../types/editor'

export const createNodeLockCommands = ({
  engine,
  document
}: {
  engine: EngineInstance
  document: EditorNodeDocumentCommands
}): EditorNodeLockCommands => {
  const set: EditorNodeLockCommands['set'] = (nodeIds, locked) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: {
        fields: {
          locked
        }
      }
    }))
  )

  return {
    set,
    toggle: (nodeIds) => {
      const shouldLock = nodeIds.some((id) => !engine.read.node.item.get(id)?.node.locked)
      return set(nodeIds, shouldLock)
    }
  }
}
