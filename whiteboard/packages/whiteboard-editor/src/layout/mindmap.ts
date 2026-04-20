import {
  createKeyedDerivedStore,
  createProjectedKeyedStore,
  createValueStore,
  read as readStore,
  read as readValue,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { NodeId, Rect, Size } from '@whiteboard/core/types'
import type { EngineRead, MindmapItem } from '@whiteboard/engine'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type {
  MindmapEnterPreview,
  MindmapPreviewState
} from '@whiteboard/editor/session/preview/types'

export type MindmapLayoutRead = {
  item: KeyedReadStore<NodeId, MindmapItem | undefined>
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
  store: EngineRead['node']['item'],
  nodeId: NodeId
): Size | undefined => {
  const item = readStore(store, nodeId)
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
  nodeCommitted,
  liveEdit,
  rootMove,
  enter,
  now
}: {
  treeId: NodeId
  base: MindmapItem
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
}): MindmapItem => {
  if (!liveEdit && !rootMove && enter.length === 0) {
    return base
  }

  let computed = base.computed

  if (liveEdit) {
    const nextComputed = mindmapApi.layout.compute(
      base.tree,
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
      base.tree.layout
    )

    computed = mindmapApi.layout.anchor({
      tree: base.tree,
      computed: nextComputed,
      position: base.node.position
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
    tree: base.tree,
    computed
  })
  const rootLocked = Boolean(
    readStore(nodeCommitted, base.tree.rootNodeId)?.node.locked
  )

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

export const createMindmapLayoutRead = ({
  committed,
  nodeCommitted,
  edit,
  preview
}: {
  committed: EngineRead['mindmap']['item']
  nodeCommitted: EngineRead['node']['item']
  edit: ReadStore<EditSession>
  preview: ReadStore<MindmapPreviewState | undefined>
}): MindmapLayoutRead => {
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

    if (!frame) {
      tickClock()
    }
  })

  const liveEdit = createProjectedKeyedStore({
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

      const node = readStore(nodeCommitted, session.nodeId)?.node
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

  const rootMove = createProjectedKeyedStore({
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

  const enter = createProjectedKeyedStore({
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

  const item = createKeyedDerivedStore<NodeId, MindmapItem | undefined>({
    get: (treeId) => {
      const base = readValue(committed, treeId)
      if (!base) {
        return undefined
      }

      const currentEnter = readValue(enter, treeId)
      return readProjectedMindmapItem({
        treeId,
        base,
        nodeCommitted,
        liveEdit: readValue(liveEdit, treeId),
        rootMove: readValue(rootMove, treeId),
        enter: currentEnter,
        now: currentEnter.length > 0
          ? readValue(clock)
          : 0
      })
    },
    isEqual: (left, right) => left === right || (
      left !== undefined
      && right !== undefined
      && left.node === right.node
      && left.tree === right.tree
      && left.computed === right.computed
      && left.childNodeIds === right.childNodeIds
      && left.connectors === right.connectors
      && left.rootLocked === right.rootLocked
    )
  })

  return {
    item
  }
}
