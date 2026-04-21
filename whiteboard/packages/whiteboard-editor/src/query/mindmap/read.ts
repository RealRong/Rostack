import { equal, store } from '@shared/core'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { NodeId, Rect } from '@whiteboard/core/types'
import type { EngineRead, MindmapItem } from '@whiteboard/engine'
import type { MindmapRenderConnector } from '@whiteboard/core/mindmap'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type { MindmapLayoutRead } from '@whiteboard/editor/layout/mindmap'

export type MindmapRenderView = {
  treeId: NodeId
  rootId: NodeId
  tree: MindmapItem['tree']
  bbox: Rect
  rootRect: Rect
  rootLocked: boolean
  childNodeIds: readonly NodeId[]
  connectors: readonly MindmapRenderConnector[]
  addChildren: readonly {
    targetNodeId: NodeId
    x: number
    y: number
    placement: 'left' | 'right'
  }[]
}

export type MindmapPresentationRead = Omit<EngineRead['mindmap'], 'item'> & {
  item: store.KeyedReadStore<NodeId, MindmapItem | undefined>
  render: store.KeyedReadStore<NodeId, MindmapRenderView | undefined>
  navigate: (input: {
    id: NodeId
    fromNodeId: NodeId
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }) => NodeId | undefined
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
    && equal.sameRect(left.bbox, right.bbox)
    && equal.sameRect(left.rootRect, right.rootRect)
    && left.rootLocked === right.rootLocked
    && left.childNodeIds.length === right.childNodeIds.length
    && left.childNodeIds.every((nodeId, index) => nodeId === right.childNodeIds[index])
    && left.connectors.length === right.connectors.length
    && left.connectors.every((connector, index) => isConnectorEqual(connector, right.connectors[index]!))
    && left.addChildren.length === right.addChildren.length
    && left.addChildren.every((entry, index) => (
      entry.targetNodeId === right.addChildren[index]?.targetNodeId
      && entry.x === right.addChildren[index]?.x
      && entry.y === right.addChildren[index]?.y
      && entry.placement === right.addChildren[index]?.placement
    ))
  )
)

const MINDMAP_ADD_BUTTON_OFFSET = 12

const readAddButtonY = (
  rect: Rect
) => rect.y + Math.max(rect.height / 2 - 14, 0)

const readAddChildren = ({
  tree,
  computed,
  selection,
  edit,
  node
}: {
  tree: MindmapItem['tree']
  computed: MindmapItem['computed']
  selection: SelectionTarget
  edit: EditSession
  node: EngineRead['node']['item']
}) => {
  const selectedNodeId = selection.nodeIds.length === 1
    ? selection.nodeIds[0]
    : undefined
  if (!selectedNodeId || tree.nodes[selectedNodeId] === undefined) {
    return []
  }

  if (edit?.kind === 'node' && edit.nodeId === selectedNodeId) {
    return []
  }

  if (store.read(node, selectedNodeId)?.node.locked) {
    return []
  }

  const rect = computed.node[selectedNodeId]
  if (!rect) {
    return []
  }

  if (selectedNodeId === tree.rootNodeId) {
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

  const side = tree.nodes[selectedNodeId]?.side ?? 'right'
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

const toMindmapRenderView = (
  treeId: NodeId,
  treeView: MindmapItem,
  selection: SelectionTarget,
  edit: EditSession,
  node: EngineRead['node']['item']
): MindmapRenderView => {
  const rootRect = treeView.computed.node[treeView.tree.rootNodeId] ?? {
    x: treeView.node.position.x,
    y: treeView.node.position.y,
    width: 0,
    height: 0
  }

  return {
    treeId,
    rootId: treeView.tree.rootNodeId,
    tree: treeView.tree,
    bbox: treeView.computed.bbox,
    rootRect,
    rootLocked: Boolean(treeView.rootLocked),
    childNodeIds: treeView.childNodeIds,
    connectors: treeView.connectors,
    addChildren: readAddChildren({
      tree: treeView.tree,
      computed: treeView.computed,
      selection,
      edit,
      node
    })
  }
}

const readMindmapNavigateTarget = ({
  tree,
  fromNodeId,
  direction
}: {
  tree: MindmapItem['tree']
  fromNodeId: NodeId
  direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
}) => {
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

export const createMindmapRead = ({
  read,
  layout,
  node,
  edit,
  selection
}: {
  read: EngineRead['mindmap']
  layout: MindmapLayoutRead
  node: EngineRead['node']['item']
  edit: store.ReadStore<EditSession>
  selection: store.ReadStore<SelectionTarget>
}): MindmapPresentationRead => {
  const render: MindmapPresentationRead['render'] = store.createKeyedDerivedStore({
    get: (treeId: NodeId) => {
      const treeView = store.read(layout.item, treeId)
      return treeView
        ? toMindmapRenderView(
            treeId,
            treeView,
            store.read(selection),
            store.read(edit),
            node
          )
        : undefined
    },
    isEqual: isMindmapRenderViewEqual
  })

  return {
    ...read,
    item: layout.item,
    render,
    navigate: (input) => {
      const currentTree = store.read(layout.item, input.id)?.tree
      if (!currentTree) {
        return undefined
      }

      return readMindmapNavigateTarget({
        tree: currentTree,
        fromNodeId: input.fromNodeId,
        direction: input.direction
      })
    }
  }
}
