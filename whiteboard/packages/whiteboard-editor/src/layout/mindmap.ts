import { equal, scheduler, store } from '@shared/core'
import { node as nodeApi } from '@whiteboard/core/node'
import type { NodeId, Rect, Size } from '@whiteboard/core/types'
import type {
  CommittedRead,
  MindmapLayoutItem,
  MindmapStructureItem
} from '@whiteboard/editor/committed/read'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  MindmapEnterPreview,
  MindmapPreviewState
} from '@whiteboard/editor/session/preview/types'

export type MindmapLayoutRead = {
  layout: store.KeyedReadStore<NodeId, MindmapLayoutItem | undefined>
  nodeGeometry: store.KeyedReadStore<NodeId, MindmapNodeGeometry | undefined>
}

export type MindmapLiveLayoutInput = {
  nodeSizes: ReadonlyMap<NodeId, Size>
}

export type MindmapNodeGeometry = {
  rect: Rect
  rotation: number
}

type MindmapSubtreeMove = {
  nodeId: NodeId
  ghost: Rect
}

const EMPTY_ROOT_MOVE_MAP = new Map<NodeId, {
  delta: {
    x: number
    y: number
  }
}>()
const EMPTY_SUBTREE_MOVE_MAP = new Map<NodeId, MindmapSubtreeMove>()
const EMPTY_ENTER_MAP = new Map<NodeId, readonly MindmapEnterPreview[]>()

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

const readCommittedMindmapNodeSize = (
  nodeItemStore: CommittedRead['node']['committed'],
  nodeId: NodeId
): Size | undefined => {
  const item = store.read(nodeItemStore, nodeId)
  return item
    ? {
        width: item.rect.width,
        height: item.rect.height
      }
    : undefined
}

const translateRect = (
  rect: Rect,
  delta: {
    x: number
    y: number
  }
): Rect => ({
  x: rect.x + delta.x,
  y: rect.y + delta.y,
  width: rect.width,
  height: rect.height
})

const computeBBox = (
  nodes: Record<NodeId, Rect>
): Rect => {
  const rects = Object.values(nodes)
  if (rects.length === 0) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    }
  }

  let minX = rects[0]!.x
  let minY = rects[0]!.y
  let maxX = rects[0]!.x + rects[0]!.width
  let maxY = rects[0]!.y + rects[0]!.height

  for (let index = 1; index < rects.length; index += 1) {
    const rect = rects[index]!
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

const readDebugRelatedNodeIds = (
  structure: MindmapStructureItem,
  nodeId: NodeId | undefined
) => {
  if (!nodeId) {
    return []
  }

  const parentId = structure.tree.nodes[nodeId]?.parentId
  if (!parentId) {
    return [nodeId]
  }

  return [
    parentId,
    ...(structure.tree.children[parentId] ?? [])
  ]
}

const readProjectedMindmapItem = ({
  base,
  structure,
  nodeCommitted,
  liveLayout,
  rootMove,
  subtreeMove,
  enter,
  now
}: {
  base: MindmapLayoutItem
  structure: MindmapStructureItem
  nodeCommitted: CommittedRead['node']['committed']
  liveLayout: MindmapLiveLayoutInput | undefined
  rootMove: {
    delta: {
      x: number
      y: number
    }
  } | undefined
  subtreeMove: MindmapSubtreeMove | undefined
  enter: readonly MindmapEnterPreview[]
  now: number
}): MindmapLayoutItem => {
  if (!liveLayout && !rootMove && !subtreeMove && enter.length === 0) {
    return base
  }

  let computed = base.computed
  const rootPosition = store.read(nodeCommitted, structure.rootId)?.node.position
    ?? {
      x: computed.node[structure.rootId]?.x ?? 0,
      y: computed.node[structure.rootId]?.y ?? 0
    }

  if (liveLayout) {
    const editedNodeId = liveLayout.nodeSizes.keys().next().value as NodeId | undefined
    const nextComputed = mindmapApi.layout.compute(
      structure.tree,
      (nodeId) => {
        const liveSize = liveLayout.nodeSizes.get(nodeId)
        if (liveSize) {
          return liveSize
        }

        return readCommittedMindmapNodeSize(nodeCommitted, nodeId) ?? (
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
      structure.layout
    )

    computed = mindmapApi.layout.anchor({
      tree: structure.tree,
      computed: nextComputed,
      position: rootPosition
    })
  }

  if (rootMove) {
    computed = mindmapApi.layout.translate(computed, rootMove.delta)
  }

  if (subtreeMove) {
    const sourceRect = computed.node[subtreeMove.nodeId]
    if (sourceRect) {
      const delta = {
        x: subtreeMove.ghost.x - sourceRect.x,
        y: subtreeMove.ghost.y - sourceRect.y
      }

      if (delta.x !== 0 || delta.y !== 0) {
        const nextNode = {
          ...computed.node
        }
        mindmapApi.tree.subtreeIds(structure.tree, subtreeMove.nodeId).forEach((nodeId) => {
          const rect = nextNode[nodeId]
          if (!rect) {
            return
          }

          nextNode[nodeId] = translateRect(rect, delta)
        })

        computed = {
          node: nextNode,
          bbox: computeBBox(nextNode)
        }
      }
    }
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

  const render = mindmapApi.render.resolve({
    tree: structure.tree,
    computed
  })

  return {
    ...base,
    computed,
    connectors: render.connectors
  }
}

export const createMindmapLayoutRead = ({
  list,
  committed,
  structure,
  nodeCommitted,
  liveLayout,
  preview
}: {
  list: CommittedRead['mindmap']['list']
  committed: CommittedRead['mindmap']['layout']
  structure: CommittedRead['mindmap']['structure']
  nodeCommitted: CommittedRead['node']['committed']
  liveLayout: store.KeyedReadStore<NodeId, MindmapLiveLayoutInput | undefined>
  preview: store.ReadStore<MindmapPreviewState | undefined>
}): MindmapLayoutRead => {
  const clock = store.createValueStore(0)
  const frameTask = scheduler.createFrameTask(() => {
    tickClock()
  })

  const stopClock = () => {
    frameTask.cancel()
  }

  const tickClock = () => {
    clock.set(scheduler.readMonotonicNow())
    if (store.read(preview)?.enter?.length) {
      frameTask.schedule()
      return
    }
  }

  preview.subscribe(() => {
    if (!store.read(preview)?.enter?.length) {
      stopClock()
      return
    }

    tickClock()
  })

  const rootMove = store.createProjectedKeyedStore({
    source: preview,
    select: (currentPreview) => {
      const currentRootMove = currentPreview?.rootMove
      return currentRootMove
        ? new Map([[currentRootMove.treeId, {
            delta: currentRootMove.delta
          }]])
        : EMPTY_ROOT_MOVE_MAP
    },
    emptyValue: undefined
  })

  const subtreeMove = store.createProjectedKeyedStore({
    source: preview,
    select: (currentPreview) => {
      const currentSubtreeMove = currentPreview?.subtreeMove
      return currentSubtreeMove
        ? new Map([[currentSubtreeMove.treeId, {
            nodeId: currentSubtreeMove.nodeId,
            ghost: currentSubtreeMove.ghost
          }]])
        : EMPTY_SUBTREE_MOVE_MAP
    },
    emptyValue: undefined
  })

  const enter = store.createProjectedKeyedStore({
    source: preview,
    select: (currentPreview) => {
      const currentEnter = currentPreview?.enter
      if (!currentEnter?.length) {
        return EMPTY_ENTER_MAP
      }

      const grouped = new Map<NodeId, MindmapEnterPreview[]>()
      currentEnter.forEach((entry) => {
        const entries = grouped.get(entry.treeId)
        if (entries) {
          entries.push(entry)
          return
        }
        grouped.set(entry.treeId, [entry])
      })

      return grouped
    },
    emptyValue: []
  })

  const layoutBase = store.createKeyedDerivedStore<NodeId, MindmapLayoutItem | undefined>({
    get: (treeId) => {
      const base = store.read(committed, treeId)
      const currentStructure = store.read(structure, treeId)
      if (!base || !currentStructure) {
        return undefined
      }

      const currentEnter = store.read(enter, treeId)
      const currentLiveLayout = store.read(liveLayout, treeId)
      const currentRootMove = store.read(rootMove, treeId)
      const currentSubtreeMove = store.read(subtreeMove, treeId)

      const item = readProjectedMindmapItem({
        base,
        structure: currentStructure,
        nodeCommitted,
        liveLayout: currentLiveLayout,
        rootMove: currentRootMove,
        subtreeMove: currentSubtreeMove,
        enter: currentEnter,
        now: currentEnter.length > 0
          ? store.read(clock)
          : 0
      })

      return item
    },
    isEqual: (left, right) => left === right || (
      left !== undefined
      && right !== undefined
      && left.rootId === right.rootId
      && left.computed === right.computed
      && left.nodeIds === right.nodeIds
      && left.connectors === right.connectors
    )
  })

  const nodeGeometry = store.createProjectedKeyedStore({
    source: store.createDerivedStore<ReadonlyMap<NodeId, MindmapNodeGeometry>>({
      get: () => {
        const next = new Map<NodeId, MindmapNodeGeometry>()

        store.read(list).forEach((treeId) => {
          const currentLayout = store.read(layoutBase, treeId)
          if (!currentLayout) {
            return
          }

          currentLayout.nodeIds.forEach((nodeId) => {
            const rect = currentLayout.computed.node[nodeId]
            const node = store.read(nodeCommitted, nodeId)?.node
            if (!rect || !node) {
              return
            }

            next.set(nodeId, {
              rect,
              rotation: nodeApi.geometry.rotation(node)
            })
          })
        })

        return next as ReadonlyMap<NodeId, MindmapNodeGeometry>
      },
      isEqual: (left, right) => left === right
    }),
    select: (value) => value,
    emptyValue: undefined,
    isEqual: (left, right) => left === right || (
      left !== undefined
      && right !== undefined
      && equal.sameRect(left.rect, right.rect)
      && left.rotation === right.rotation
    )
  })

  return {
    layout: layoutBase,
    nodeGeometry
  }
}
