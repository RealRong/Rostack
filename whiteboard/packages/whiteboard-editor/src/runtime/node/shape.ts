import type { EngineInstance } from '@engine-types/instance'
import type {
  NodePatchWriter,
  NodeShapeMutations
} from '../../../internal/types'
import { dataUpdate } from './document'

export const createNodeShapeMutations = ({
  engine,
  document
}: {
  engine: EngineInstance
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
