import { equal, store } from '@shared/core'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { MindmapRenderConnector } from '@whiteboard/core/mindmap'
import type { NodeId, Rect } from '@whiteboard/core/types'
import type {
  EngineRead,
  MindmapLayoutItem,
  MindmapSceneItem,
  MindmapStructureItem
} from '@whiteboard/engine'
import type {
  MindmapLayoutRead
} from '@whiteboard/editor/layout/mindmap'
import type { EditSession } from '@whiteboard/editor/session/edit'

export type MindmapChrome = {
  addChildTargets: readonly {
    targetNodeId: NodeId
    x: number
    y: number
    placement: 'left' | 'right'
  }[]
}

export type MindmapPresentationRead = Omit<EngineRead['mindmap'], 'layout' | 'scene'> & {
  layout: store.KeyedReadStore<NodeId, MindmapLayoutItem | undefined>
  scene: store.KeyedReadStore<NodeId, MindmapSceneItem | undefined>
  chrome: store.KeyedReadStore<NodeId, MindmapChrome | undefined>
  navigate: (input: {
    id: NodeId
    fromNodeId: NodeId
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }) => NodeId | undefined
}

const MINDMAP_ADD_BUTTON_OFFSET = 12

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

const isMindmapChromeEqual = (
  left: MindmapChrome | undefined,
  right: MindmapChrome | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.addChildTargets.length === right.addChildTargets.length
    && left.addChildTargets.every((entry, index) => (
      entry.targetNodeId === right.addChildTargets[index]?.targetNodeId
      && entry.x === right.addChildTargets[index]?.x
      && entry.y === right.addChildTargets[index]?.y
      && entry.placement === right.addChildTargets[index]?.placement
    ))
  )
)

const readAddButtonY = (
  rect: Rect
) => rect.y + Math.max(rect.height / 2 - 14, 0)

const readAddChildTargets = ({
  structure,
  layout,
  selection,
  edit,
  node
}: {
  structure: MindmapStructureItem
  layout: MindmapLayoutItem
  selection: SelectionTarget
  edit: EditSession
  node: EngineRead['node']['committed']
}) => {
  const selectedNodeId = selection.nodeIds.length === 1
    ? selection.nodeIds[0]
    : undefined
  if (!selectedNodeId || structure.tree.nodes[selectedNodeId] === undefined) {
    return []
  }

  if (edit?.kind === 'node' && edit.nodeId === selectedNodeId) {
    return []
  }

  if (store.read(node, selectedNodeId)?.node.locked) {
    return []
  }

  const rect = layout.computed.node[selectedNodeId]
  if (!rect) {
    return []
  }

  if (selectedNodeId === structure.rootId) {
    return [
      {
        targetNodeId: selectedNodeId,
        x: rect.x - 28 - MINDMAP_ADD_BUTTON_OFFSET,
        y: readAddButtonY(rect),
        placement: 'left' as const
      },
      {
        targetNodeId: selectedNodeId,
        x: rect.x + rect.width + MINDMAP_ADD_BUTTON_OFFSET,
        y: readAddButtonY(rect),
        placement: 'right' as const
      }
    ]
  }

  const side = structure.tree.nodes[selectedNodeId]?.side ?? 'right'
  return [{
    targetNodeId: selectedNodeId,
    x: side === 'left'
      ? rect.x - 28 - MINDMAP_ADD_BUTTON_OFFSET
      : rect.x + rect.width + MINDMAP_ADD_BUTTON_OFFSET,
    y: readAddButtonY(rect),
    placement: side === 'left'
      ? 'left' as const
      : 'right' as const
  }]
}

const readMindmapNavigateTarget = ({
  structure,
  fromNodeId,
  direction
}: {
  structure: MindmapStructureItem
  fromNodeId: NodeId
  direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
}) => {
  const tree = structure.tree

  switch (direction) {
    case 'parent':
      return tree.nodes[fromNodeId]?.parentId
    case 'first-child':
      return tree.children[fromNodeId]?.[0]
    case 'prev-sibling': {
      const parentId = tree.nodes[fromNodeId]?.parentId
      if (!parentId) {
        return undefined
      }

      const siblings = tree.children[parentId] ?? []
      const index = siblings.indexOf(fromNodeId)
      return index > 0 ? siblings[index - 1] : undefined
    }
    case 'next-sibling': {
      const parentId = tree.nodes[fromNodeId]?.parentId
      if (!parentId) {
        return undefined
      }

      const siblings = tree.children[parentId] ?? []
      const index = siblings.indexOf(fromNodeId)
      return index >= 0 ? siblings[index + 1] : undefined
    }
  }
}

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

export const createMindmapRead = ({
  read,
  layout,
  node,
  edit,
  selection
}: {
  read: EngineRead['mindmap']
  layout: MindmapLayoutRead
  node: EngineRead['node']['committed']
  edit: store.ReadStore<EditSession>
  selection: store.ReadStore<SelectionTarget>
}): MindmapPresentationRead => {
  const scene = store.createKeyedDerivedStore<NodeId, MindmapSceneItem | undefined>({
    get: (mindmapId) => {
      const structure = store.read(read.structure, mindmapId)
      const currentLayout = store.read(layout.layout, mindmapId)
      if (!structure || !currentLayout) {
        return undefined
      }

      return toMindmapScene(structure, currentLayout)
    },
    isEqual: isMindmapSceneEqual
  })

  const chrome = store.createKeyedDerivedStore<NodeId, MindmapChrome | undefined>({
    get: (mindmapId) => {
      const structure = store.read(read.structure, mindmapId)
      const currentLayout = store.read(layout.layout, mindmapId)
      if (!structure || !currentLayout) {
        return undefined
      }

      return {
        addChildTargets: readAddChildTargets({
          structure,
          layout: currentLayout,
          selection: store.read(selection),
          edit: store.read(edit),
          node
        })
      }
    },
    isEqual: isMindmapChromeEqual
  })

  return {
    list: read.list,
    structure: read.structure,
    layout: layout.layout,
    scene,
    chrome,
    navigate: (input) => {
      const currentStructure = store.read(read.structure, input.id)
      if (!currentStructure) {
        return undefined
      }

      return readMindmapNavigateTarget({
        structure: currentStructure,
        fromNodeId: input.fromNodeId,
        direction: input.direction
      })
    }
  }
}
