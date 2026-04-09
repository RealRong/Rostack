import type { Engine } from '@whiteboard/engine'
import type {
  NodeLockMutations,
  NodePatchWriter
} from './types'

export const createNodeLockMutations = ({
  engine,
  document
}: {
  engine: Engine
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
