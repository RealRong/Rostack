import {
  createKeyedDerivedStore,
  read as readValue,
  sameRect,
  type KeyedReadStore
} from '@shared/core'
import type { NodeId, Rect } from '@whiteboard/core/types'
import type { EngineRead, MindmapItem } from '@whiteboard/engine'
import type { MindmapRenderConnector } from '@whiteboard/core/mindmap/render'

export type MindmapRenderView = {
  treeId: NodeId
  rootId: NodeId
  tree: MindmapItem['tree']
  bbox: Rect
  childNodeIds: readonly NodeId[]
  connectors: readonly MindmapRenderConnector[]
}

export type MindmapPresentationRead = EngineRead['mindmap'] & {
  tree: KeyedReadStore<NodeId, MindmapItem['tree'] | undefined>
  render: KeyedReadStore<NodeId, MindmapRenderView | undefined>
}

const isConnectorEqual = (
  left: MindmapRenderConnector,
  right: MindmapRenderConnector
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

const isMindmapRenderViewEqual = (
  left: MindmapRenderView | undefined,
  right: MindmapRenderView | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.treeId === right.treeId
    && left.rootId === right.rootId
    && left.tree === right.tree
    && sameRect(left.bbox, right.bbox)
    && left.childNodeIds.length === right.childNodeIds.length
    && left.childNodeIds.every((nodeId, index) => nodeId === right.childNodeIds[index])
    && left.connectors.length === right.connectors.length
    && left.connectors.every((connector, index) => isConnectorEqual(connector, right.connectors[index]!))
  )
)

const toMindmapRenderView = (
  treeId: NodeId,
  treeView: MindmapItem
): MindmapRenderView => ({
  treeId,
  rootId: treeView.tree.rootNodeId,
  tree: treeView.tree,
  bbox: treeView.computed.bbox,
  childNodeIds: treeView.childNodeIds,
  connectors: treeView.connectors
})

export const createMindmapRead = ({
  read
}: {
  read: EngineRead['mindmap']
}): MindmapPresentationRead => {
  const tree: MindmapPresentationRead['tree'] = createKeyedDerivedStore({
    get: (treeId: NodeId) => readValue(read.item, treeId)?.tree,
    isEqual: (left, right) => left === right
  })
  const render: MindmapPresentationRead['render'] = createKeyedDerivedStore({
    get: (treeId: NodeId) => {
      const treeView = readValue(read.item, treeId)
      return treeView ? toMindmapRenderView(treeId, treeView) : undefined
    },
    isEqual: isMindmapRenderViewEqual
  })

  return {
    ...read,
    tree,
    render
  }
}
