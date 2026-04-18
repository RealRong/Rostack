import {
  createKeyedDerivedStore,
  createValueStore,
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
import type { MindmapPreviewState } from '@whiteboard/editor/session/preview/types'
import type { EditSession } from '@whiteboard/editor/session/edit'

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
  item: KeyedReadStore<NodeId, MindmapItem | undefined>
  tree: KeyedReadStore<NodeId, MindmapItem['tree'] | undefined>
  render: KeyedReadStore<NodeId, MindmapRenderView | undefined>
  navigate: (input: {
    id: NodeId
    fromNodeId: NodeId
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }) => NodeId | undefined
  preview: ReadStore<MindmapPreviewState | undefined>
}

const interpolateRect = (
  from: Rect,
  to: Rect,
  progress: number
): Rect => ({
  x: from.x + (to.x - from.x) * progress,
  y: from.y + (to.y - from.y) * progress,
  width: from.width + (to.width - from.width) * progress,
  height: from.height + (to.height - from.height) * progress
})

const readEnterProgress = (
  startedAt: number,
  durationMs: number,
  now: number
) => {
  if (durationMs <= 0) {
    return 1
  }

  return Math.max(0, Math.min(1, (now - startedAt) / durationMs))
}

const scheduleFrame = (
  callback: () => void
) => (
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : globalThis.setTimeout(callback, 16)
)

const cancelFrame = (
  handle: number
) => {
  if (typeof requestAnimationFrame === 'function') {
    cancelAnimationFrame(handle)
    return
  }

  globalThis.clearTimeout(handle)
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

  if (readValue(node, selectedNodeId)?.node.locked) {
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
    addChildren: readAddChildren({
      tree: treeView.tree,
      computed: treeView.computed,
      selection,
      edit,
      node
    })
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

const readProjectedMindmapItem = ({
  treeId,
  base,
  node,
  preview,
  edit,
  now
}: {
  treeId: NodeId
  base: MindmapItem
  node: EngineRead['node']['item']
  preview: MindmapPreviewState | undefined
  edit: EditSession
  now: number
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
  const enter = preview?.enter?.filter((entry) => entry.treeId === treeId) ?? []

  if (!liveEdit && !rootMove && enter.length === 0) {
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

  if (enter.length > 0) {
    computed = {
      ...computed,
      node: {
        ...computed.node
      }
    }

    enter.forEach((entry) => {
      const targetRect = computed.node[entry.nodeId] ?? entry.toRect
      computed.node[entry.nodeId] = interpolateRect(
        entry.fromRect,
        targetRect,
        readEnterProgress(entry.startedAt, entry.durationMs, now)
      )
    })
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
  const clock = createValueStore(0)
  let frame = 0

  const stopClock = () => {
    if (!frame) {
      return
    }

    cancelFrame(frame)
    frame = 0
  }

  const tickClock = () => {
    clock.set(
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
    )
    if (readValue(preview)?.enter?.length) {
      frame = scheduleFrame(tickClock)
      return
    }

    frame = 0
  }

  preview.subscribe(() => {
    if (!readValue(preview)?.enter?.length) {
      stopClock()
      return
    }

    if (frame) {
      return
    }

    tickClock()
  })

  const item: MindmapPresentationRead['item'] = createKeyedDerivedStore({
    get: (treeId: NodeId) => {
      const treeView = readValue(read.item, treeId)
      const currentPreview = readValue(preview)
      return treeView
        ? readProjectedMindmapItem({
            treeId,
            base: treeView,
            node,
            preview: currentPreview,
            edit: readValue(edit),
            now: currentPreview?.enter?.length
              ? readValue(clock)
              : 0
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
            readValue(edit),
            node
          )
        : undefined
    },
    isEqual: isMindmapRenderViewEqual
  })

  return {
    ...read,
    item,
    tree,
    render,
    navigate: (input) => {
      const currentTree = readValue(tree, input.id)
      if (!currentTree) {
        return undefined
      }

      return readMindmapNavigateTarget({
        tree: currentTree,
        fromNodeId: input.fromNodeId,
        direction: input.direction
      })
    },
    preview
  }
}
