import { store } from '@shared/core'
import type { NodeId, Rect, Size } from '@whiteboard/core/types'
import type {
  EngineRead,
  MindmapLayoutItem,
  MindmapStructureItem
} from '@whiteboard/engine'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type {
  MindmapEnterPreview,
  MindmapPreviewState
} from '@whiteboard/editor/session/preview/types'

export type MindmapLayoutRead = {
  item: store.KeyedReadStore<NodeId, MindmapLayoutItem | undefined>
}

type MindmapLiveEdit = {
  nodeId: NodeId
  size: Size
}

const EMPTY_LIVE_EDIT_MAP = new Map<NodeId, MindmapLiveEdit>()
const EMPTY_ROOT_MOVE_MAP = new Map<NodeId, {
  delta: {
    x: number
    y: number
  }
}>()
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

const readMindmapTreeId = (
  node: {
    id: NodeId
    owner?: {
      kind: 'mindmap'
      id: NodeId
    }
  }
) => node.owner?.kind === 'mindmap'
  ? node.owner.id
  : undefined

const readCommittedMindmapNodeSize = (
  nodeItemStore: EngineRead['node']['item'],
  nodeId: NodeId
): Size | undefined => {
  const item = nodeItemStore.get(nodeId)
  return item
    ? {
        width: item.rect.width,
        height: item.rect.height
      }
    : undefined
}

const readProjectedMindmapItem = ({
  base,
  structure,
  nodeCommitted,
  liveEdit,
  rootMove,
  enter,
  now
}: {
  base: MindmapLayoutItem
  structure: MindmapStructureItem
  nodeCommitted: EngineRead['node']['item']
  liveEdit: MindmapLiveEdit | undefined
  rootMove: {
    delta: {
      x: number
      y: number
    }
  } | undefined
  enter: readonly MindmapEnterPreview[]
  now: number
}): MindmapLayoutItem => {
  if (!liveEdit && !rootMove && enter.length === 0) {
    return base
  }

  let computed = base.computed
  const rootPosition = store.read(nodeCommitted, structure.rootId)?.node.position
    ?? {
      x: computed.node[structure.rootId]?.x ?? 0,
      y: computed.node[structure.rootId]?.y ?? 0
    }

  if (liveEdit) {
    const nextComputed = mindmapApi.layout.compute(
      structure.tree,
      (nodeId) => {
        if (nodeId === liveEdit.nodeId) {
          return liveEdit.size
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
  committed,
  structure,
  nodeCommitted,
  edit,
  preview
}: {
  committed: EngineRead['mindmap']['layout']
  structure: EngineRead['mindmap']['structure']
  nodeCommitted: EngineRead['node']['item']
  edit: store.ReadStore<EditSession>
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

  const liveEdit = store.createProjectedKeyedStore({
    source: edit,
    select: (session) => {
      if (
        !session
        || session.kind !== 'node'
        || session.field !== 'text'
        || !session.layout.size
      ) {
        return EMPTY_LIVE_EDIT_MAP
      }

      const node = store.read(nodeCommitted, session.nodeId)?.node
      if (!node) {
        return EMPTY_LIVE_EDIT_MAP
      }

      const treeId = readMindmapTreeId(node)
      if (!treeId) {
        return EMPTY_LIVE_EDIT_MAP
      }

      return new Map<NodeId, MindmapLiveEdit>([[
        treeId,
        {
          nodeId: session.nodeId,
          size: session.layout.size
        }
      ]])
    },
    emptyValue: undefined
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

  const item = store.createKeyedDerivedStore<NodeId, MindmapLayoutItem | undefined>({
    get: (treeId) => {
      const base = store.read(committed, treeId)
      const currentStructure = store.read(structure, treeId)
      if (!base || !currentStructure) {
        return undefined
      }

      const currentEnter = store.read(enter, treeId)
      return readProjectedMindmapItem({
        base,
        structure: currentStructure,
        nodeCommitted,
        liveEdit: store.read(liveEdit, treeId),
        rootMove: store.read(rootMove, treeId),
        enter: currentEnter,
        now: currentEnter.length > 0
          ? store.read(clock)
          : 0
      })
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
    item
  }
}
