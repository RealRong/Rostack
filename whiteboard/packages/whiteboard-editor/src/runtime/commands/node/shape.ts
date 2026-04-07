import type { EngineInstance } from '@whiteboard/engine'
import type {
  EditorNodeDocumentCommands,
  EditorNodeShapeCommands
} from '../../../types/editor'
import { dataUpdate } from './document'

export const createNodeShapeCommands = ({
  engine,
  document
}: {
  engine: EngineInstance
  document: EditorNodeDocumentCommands
}): EditorNodeShapeCommands => ({
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
