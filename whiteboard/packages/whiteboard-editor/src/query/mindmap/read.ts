import {
  createKeyedDerivedStore,
  read as readValue,
  sameRect,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { NodeId, Rect, Size } from '@whiteboard/core/types'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { EngineRead, MindmapItem } from '@whiteboard/engine'
import {
  anchorMindmapLayout,
  computeMindmapLayout,
  resolveMindmapRender,
  translateMindmapLayout,
  type MindmapRenderConnector
} from '@whiteboard/core/mindmap'
import type { MindmapPreviewState } from '@whiteboard/editor/local/feedback/types'
import type { EditSession } from '@whiteboard/editor/local/session/edit'

export type MindmapRenderView = {
  treeId: NodeId
  rootId: NodeId
  tree: MindmapItem['tree']
  bbox: Rect
  rootRect: Rect
  rootLocked: boolean
  childNodeIds: readonly NodeId[]
  connectors: readonly MindmapRenderConnector[]
  addChild?: {
    visible: true
    x: number
    y: number
    placement: 'right'
  }
}

export type MindmapPresentationRead = Omit<EngineRead['mindmap'], 'item'> & {
  item: KeyedReadStore<NodeId, MindmapItem | undefined>
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
    && sameRect(left.rootRect, right.rootRect)
    && left.rootLocked === right.rootLocked
    && left.childNodeIds.length === right.childNodeIds.length
    && left.childNodeIds.every((nodeId, index) => nodeId === right.childNodeIds[index])
    && left.connectors.length === right.connectors.length
    && left.connectors.every((connector, index) => isConnectorEqual(connector, right.connectors[index]!))
    && left.addChild?.visible === right.addChild?.visible
    && left.addChild?.x === right.addChild?.x
    && left.addChild?.y === right.addChild?.y
    && left.addChild?.placement === right.addChild?.placement
  )
)

const toMindmapRenderView = (
  treeId: NodeId,
  treeView: MindmapItem,
  selection: SelectionTarget,
  edit: EditSession
): MindmapRenderView => {
  const rootRect = treeView.computed.node[treeView.tree.rootNodeId] ?? {
    x: treeView.node.position.x,
    y: treeView.node.position.y,
    width: 0,
    height: 0
  }
  const rootSelected = (
    selection.nodeIds.length === 1
    && selection.nodeIds[0] === treeView.tree.rootNodeId
  )
  const rootEditing = edit?.kind === 'node'
    && edit.nodeId === treeView.tree.rootNodeId
  const rootLocked = Boolean((treeView as MindmapItem & {
    rootLocked?: boolean
  }).rootLocked)

  return {
    treeId,
    rootId: treeView.tree.rootNodeId,
    tree: treeView.tree,
    bbox: treeView.computed.bbox,
    rootRect,
    rootLocked,
    childNodeIds: treeView.childNodeIds,
    connectors: treeView.connectors,
    addChild: rootSelected && !rootEditing && !rootLocked
      ? {
          visible: true,
          x: rootRect.x + rootRect.width + 12,
          y: rootRect.y + Math.max(rootRect.height / 2 - 14, 0),
          placement: 'right'
        }
      : undefined
  }
}

const readCommittedMindmapNodeSize = (
  read: EngineRead['node']['item'],
  nodeId: NodeId
): Size | undefined => {
  const item = readValue(read, nodeId)
  return item
    ? {
        width: item.rect.width,
        height: item.rect.height
      }
    : undefined
}

const readProjectedMindmapItem = ({
  treeId,
  base,
  node,
  preview,
  edit
}: {
  treeId: NodeId
  base: MindmapItem
  node: EngineRead['node']['item']
  preview: MindmapPreviewState | undefined
  edit: EditSession
}): MindmapItem => {
  const liveEdit = edit?.kind === 'node'
    && edit.field === 'text'
    && base.tree.nodes[edit.nodeId] !== undefined
    && edit.layout.size
      ? edit
      : null
  const rootMove = preview?.rootMove?.treeId === treeId
    ? preview.rootMove
    : undefined

  if (!liveEdit && !rootMove) {
    return base
  }

  let computed = base.computed

  if (liveEdit) {
    const nextComputed = computeMindmapLayout(
      base.tree,
      (nodeId) => {
        if (nodeId === liveEdit.nodeId) {
          return liveEdit.layout.size!
        }

        return readCommittedMindmapNodeSize(node, nodeId) ?? (
          base.computed.node[nodeId]
            ? {
                width: base.computed.node[nodeId]!.width,
                height: base.computed.node[nodeId]!.height
              }
            : {
                width: 1,
                height: 1
              }
        )
      },
      base.tree.layout
    )

    computed = anchorMindmapLayout({
      tree: base.tree,
      computed: nextComputed,
      position: base.node.position
    })
  }

  if (rootMove) {
    computed = translateMindmapLayout(computed, rootMove.delta)
  }

  const render = resolveMindmapRender({
    tree: base.tree,
    computed
  })
  const rootLocked = Boolean(readValue(node, base.tree.rootNodeId)?.node.locked)

  return {
    ...base,
    node: rootMove
      ? {
          ...base.node,
          position: {
            x: base.node.position.x + rootMove.delta.x,
            y: base.node.position.y + rootMove.delta.y
          }
        }
      : base.node,
    rootLocked,
    computed,
    connectors: render.connectors
  }
}

export const createMindmapRead = ({
  read,
  node,
  preview,
  edit,
  selection
}: {
  read: EngineRead['mindmap']
  node: EngineRead['node']['item']
  preview: ReadStore<MindmapPreviewState | undefined>
  edit: ReadStore<EditSession>
  selection: ReadStore<SelectionTarget>
}): MindmapPresentationRead => {
  const item: MindmapPresentationRead['item'] = createKeyedDerivedStore({
    get: (treeId: NodeId) => {
      const treeView = readValue(read.item, treeId)
      return treeView
        ? readProjectedMindmapItem({
            treeId,
            base: treeView,
            node,
            preview: readValue(preview),
            edit: readValue(edit)
          })
        : undefined
    },
    isEqual: (left, right) => left === right || (
      left !== undefined
      && right !== undefined
      && left.node === right.node
      && left.tree === right.tree
      && sameRect(left.computed.bbox, right.computed.bbox)
      && left.childNodeIds === right.childNodeIds
      && left.connectors === right.connectors
    )
  })
  const tree: MindmapPresentationRead['tree'] = createKeyedDerivedStore({
    get: (treeId: NodeId) => readValue(item, treeId)?.tree,
    isEqual: (left, right) => left === right
  })
  const render: MindmapPresentationRead['render'] = createKeyedDerivedStore({
    get: (treeId: NodeId) => {
      const treeView = readValue(item, treeId)
      return treeView
        ? toMindmapRenderView(
            treeId,
            treeView,
            readValue(selection),
            readValue(edit)
          )
        : undefined
    },
    isEqual: isMindmapRenderViewEqual
  })

  return {
    ...read,
    item,
    tree,
    render
  }
}
