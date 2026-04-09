import type { Engine } from '@whiteboard/engine'
import type {
  NodePatchWriter,
  NodeShapeMutations
} from './types'
import { dataUpdate } from './patch'

export const createNodeShapeMutations = ({
  engine,
  document
}: {
  engine: Engine
  document: NodePatchWriter
}): NodeShapeMutations => ({
  setKind: (nodeIds, kind) => document.updateMany(
    nodeIds.flatMap((id) => {
      const node = engine.read.node.item.get(id)?.node
      if (node?.type !== 'shape') {
        return []
      }

      return [{
        id,
        update: dataUpdate('kind', kind)
      }]
    })
  )
})
