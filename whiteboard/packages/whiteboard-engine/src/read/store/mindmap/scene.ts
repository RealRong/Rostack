import { equal, store } from '@shared/core'
import type { MindmapId } from '@whiteboard/core/types'
import type {
  MindmapLayoutItem,
  MindmapSceneItem,
  MindmapStructureItem
} from '@whiteboard/engine/types/projection'

const isConnectorEqual = (
  left: MindmapSceneItem['connectors'][number],
  right: MindmapSceneItem['connectors'][number]
) => (
  left.id === right.id
  && left.parentId === right.parentId
  && left.childId === right.childId
  && left.path === right.path
  && left.style.color === right.style.color
  && left.style.line === right.style.line
  && left.style.width === right.style.width
  && left.style.stroke === right.style.stroke
)

const isMindmapSceneEqual = (
  left: MindmapSceneItem | undefined,
  right: MindmapSceneItem | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.id === right.id
    && left.rootId === right.rootId
    && left.nodeIds.length === right.nodeIds.length
    && left.nodeIds.every((nodeId, index) => nodeId === right.nodeIds[index])
    && equal.sameRect(left.bbox, right.bbox)
    && left.connectors.length === right.connectors.length
    && left.connectors.every((connector, index) => isConnectorEqual(connector, right.connectors[index]!))
  )
)

const toMindmapScene = (
  structure: MindmapStructureItem,
  layout: MindmapLayoutItem
): MindmapSceneItem => ({
  id: structure.id,
  rootId: structure.rootId,
  nodeIds: structure.nodeIds,
  bbox: layout.computed.bbox,
  connectors: layout.connectors
})

export const createMindmapSceneRead = ({
  structure,
  layout
}: {
  structure: store.KeyedReadStore<MindmapId, MindmapStructureItem | undefined>
  layout: store.KeyedReadStore<MindmapId, MindmapLayoutItem | undefined>
}) => store.createKeyedDerivedStore<MindmapId, MindmapSceneItem | undefined>({
  get: (mindmapId) => {
    const currentStructure = store.read(structure, mindmapId)
    const currentLayout = store.read(layout, mindmapId)
    if (!currentStructure || !currentLayout) {
      return undefined
    }

    return toMindmapScene(currentStructure, currentLayout)
  },
  isEqual: isMindmapSceneEqual
})
