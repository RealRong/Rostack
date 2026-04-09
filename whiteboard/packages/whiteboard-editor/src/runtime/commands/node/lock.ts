import type { EngineInstance } from '@engine-types/instance'
import type {
  NodeLockMutations,
  NodePatchWriter
} from '../../../internal/types'

export const createNodeLockMutations = ({
  engine,
  document
}: {
  engine: EngineInstance
  document: NodePatchWriter
}): NodeLockMutations => {
  const set: NodeLockMutations['set'] = (nodeIds, locked) => document.updateMany(
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
