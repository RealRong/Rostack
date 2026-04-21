import { equal, store } from '@shared/core'
import type { NodeId, Rect, Size } from '@whiteboard/core/types'
import type {
  EngineRead,
  MindmapLayoutItem,
  MindmapStructureItem
} from '@whiteboard/engine'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  MindmapEnterPreview,
  MindmapPreviewState
} from '@whiteboard/editor/session/preview/types'

export type MindmapLayoutRead = {
  layout: store.KeyedReadStore<NodeId, MindmapLayoutItem | undefined>
}

export type MindmapLiveLayoutInput = {
  nodeSizes: ReadonlyMap<NodeId, Size>
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

type FrameHandle = number | ReturnType<typeof globalThis.setTimeout>

const scheduleFrame = (
  callback: () => void
): FrameHandle => (
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : globalThis.setTimeout(callback, 16)
)

const cancelFrame = (
  handle: FrameHandle
) => {
  if (typeof requestAnimationFrame === 'function') {
    cancelAnimationFrame(handle as number)
    return
  }

  globalThis.clearTimeout(handle)
}

const readCommittedMindmapNodeSize = (
  nodeItemStore: EngineRead['node']['committed'],
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
  nodeCommitted: EngineRead['node']['committed']
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
  list: EngineRead['mindmap']['list']
  committed: EngineRead['mindmap']['layout']
  structure: EngineRead['mindmap']['structure']
  nodeCommitted: EngineRead['node']['committed']
  liveLayout: store.KeyedReadStore<NodeId, MindmapLiveLayoutInput | undefined>
  preview: store.ReadStore<MindmapPreviewState | undefined>
}): MindmapLayoutRead => {
  const clock = store.createValueStore(0)
  let frame: FrameHandle | null = null

  const stopClock = () => {
    if (frame === null) {
      return
    }

    cancelFrame(frame)
    frame = null
  }

  const tickClock = () => {
    clock.set(
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
    )
    if (store.read(preview)?.enter?.length) {
      frame = scheduleFrame(tickClock)
      return
    }

    frame = null
  }

  preview.subscribe(() => {
    if (!store.read(preview)?.enter?.length) {
      stopClock()
      return
    }

    if (frame === null) {
      tickClock()
    }
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

  return {
    layout: layoutBase
  }
}
