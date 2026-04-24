import {
  mindmap as mindmapApi,
  type MindmapLayout
} from '@whiteboard/core/mindmap'
import type {
  MindmapId,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import { isListEqual } from '@shared/projector'
import type { Input, MindmapView } from '../../contracts/editor'
import type { GraphDelta } from '../../contracts/delta'
import type {
  GraphMindmapEntry,
  GraphNodeEntry,
  WorkingState
} from '../../contracts/working'
import { isMindmapLayoutEqual, isMindmapViewEqual } from '../equality'
import { collectRects, isRectEqual } from '../geometry'
import {
  readMindmapNodeIds,
  readMindmapTree
} from '../indexes'
import {
  readProjectedNodeRect,
  readProjectedNodeSize
} from '../projection'
import { buildMindmapView } from '../views'
import type { GraphPatchQueue } from './fanout'
import { fanoutMindmapGeometry } from './fanout'
import { patchFamilyEntry, patchOrderedIds } from './helpers'

const translateRect = (
  rect: Rect,
  delta: Point
): Rect => ({
  x: rect.x + delta.x,
  y: rect.y + delta.y,
  width: rect.width,
  height: rect.height
})

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
): number => {
  if (durationMs <= 0) {
    return 1
  }

  return Math.max(0, Math.min(1, (now - startedAt) / durationMs))
}

const readNodeEntry = (
  input: Input,
  ownerByNode: WorkingState['indexes']['ownerByNode'],
  nodeId: NodeId
): GraphNodeEntry | undefined => {
  const node = input.document.snapshot.document.nodes[nodeId]
  if (!node) {
    return undefined
  }

  return {
    base: {
      node,
      owner: ownerByNode.get(nodeId)
    },
    draft: input.session.draft.nodes.get(nodeId),
    preview: input.session.preview.nodes.get(nodeId)
  }
}

const applySubtreeMovePreview = (input: {
  layout: MindmapLayout
  tree: ReturnType<typeof mindmapApi.tree.fromRecord>
  preview: NonNullable<NonNullable<Input['session']['preview']['mindmap']>['subtreeMove']>
}) => {
  const sourceRect = input.layout.node[input.preview.nodeId]
  if (!sourceRect) {
    return input.layout
  }

  const delta = {
    x: input.preview.ghost.x - sourceRect.x,
    y: input.preview.ghost.y - sourceRect.y
  }
  if (delta.x === 0 && delta.y === 0) {
    return input.layout
  }

  const node = {
    ...input.layout.node
  }
  mindmapApi.tree.subtreeIds(input.tree, input.preview.nodeId).forEach((nodeId) => {
    const rect = node[nodeId]
    if (!rect) {
      return
    }

    node[nodeId] = translateRect(rect, delta)
  })

  return {
    node,
    bbox: collectRects(Object.values(node)) ?? input.layout.bbox
  }
}

const applyEnterPreview = (input: {
  layout: MindmapLayout
  enter: readonly NonNullable<NonNullable<Input['session']['preview']['mindmap']>['enter']>[number][]
  now: number
}) => {
  if (!input.enter.length) {
    return input.layout
  }

  const node = {
    ...input.layout.node
  }

  input.enter.forEach((entry) => {
    const targetRect = node[entry.nodeId] ?? entry.toRect
    node[entry.nodeId] = interpolateRect(
      entry.fromRect,
      targetRect,
      readEnterProgress(entry.startedAt, entry.durationMs, input.now)
    )
  })

  return {
    node,
    bbox: collectRects(Object.values(node)) ?? input.layout.bbox
  }
}

const buildMindmapEntry = (
  input: Input,
  working: WorkingState,
  mindmapId: MindmapId
): GraphMindmapEntry | undefined => {
  const mindmap = input.document.snapshot.document.mindmaps[mindmapId]
  if (!mindmap) {
    return undefined
  }

  const nodeIds = working.indexes.mindmapNodes.get(mindmapId) ?? readMindmapNodeIds(mindmap)
  const tree = readMindmapTree(mindmap)
  if (!tree) {
    return undefined
  }
  const preview = input.session.preview.mindmap
  const rootEntry = readNodeEntry(input, working.indexes.ownerByNode, tree.rootNodeId)

  if (!rootEntry) {
      return {
        base: {
          mindmap
        },
        rootId: tree.rootNodeId,
        nodeIds,
        structure: tree,
        tree: {
          layout: undefined,
          connectors: []
      }
    }
  }

  const rootRect = readProjectedNodeRect({
    entry: rootEntry,
    measuredSize: input.measure.text.nodes.get(tree.rootNodeId)?.size
  })

  let layout = mindmapApi.layout.anchor({
    tree,
    computed: mindmapApi.layout.compute(
      tree,
      (nodeId) => {
        const nodeEntry = readNodeEntry(input, working.indexes.ownerByNode, nodeId)
        return nodeEntry
          ? readProjectedNodeSize({
              entry: nodeEntry,
              measuredSize: input.measure.text.nodes.get(nodeId)?.size
            })
          : {
              width: 1,
              height: 1
            }
      },
      tree.layout
    ),
    position: {
      x: rootRect.x,
      y: rootRect.y
    }
  })

  if (preview?.rootMove?.mindmapId === mindmapId) {
    layout = mindmapApi.layout.translate(layout, preview.rootMove.delta)
  }

  if (preview?.subtreeMove?.mindmapId === mindmapId) {
    layout = applySubtreeMovePreview({
      layout,
      tree,
      preview: preview.subtreeMove
    })
  }

  const enter = preview?.enter?.filter((entry) => entry.mindmapId === mindmapId) ?? []
  if (enter.length > 0) {
    layout = applyEnterPreview({
      layout,
      enter,
      now: input.clock.now
    })
  }

  return {
    base: {
      mindmap
    },
    rootId: tree.rootNodeId,
    nodeIds,
    structure: tree,
    tree: {
      layout,
      connectors: mindmapApi.render.resolve({
        tree,
        computed: layout
      }).connectors
    }
  }
}

const isMindmapRenderConnectorEqual = (
  left: MindmapView['render']['connectors'][number],
  right: MindmapView['render']['connectors'][number]
): boolean => (
  left.id === right.id
  && left.parentId === right.parentId
  && left.childId === right.childId
  && left.path === right.path
  && left.style.color === right.style.color
  && left.style.line === right.style.line
  && left.style.width === right.style.width
  && left.style.stroke === right.style.stroke
)

const isMindmapGeometryChanged = (
  previous: MindmapView | undefined,
  next: MindmapView | undefined
): boolean => (
  previous === undefined
  || next === undefined
  || !isMindmapLayoutEqual(previous.tree.layout, next.tree.layout)
  || !isRectEqual(previous.tree.bbox, next.tree.bbox)
  || !isListEqual(
    previous.render.connectors,
    next.render.connectors,
    isMindmapRenderConnectorEqual
  )
)

export const diffMindmapMemberNodes = (input: {
  previous: MindmapView | undefined
  next: MindmapView | undefined
}): ReadonlySet<NodeId> => {
  const changed = new Set<NodeId>()
  const previousNodeIds = input.previous?.structure.nodeIds ?? []
  const nextNodeIds = input.next?.structure.nodeIds ?? []

  if (!input.previous || !input.next) {
    previousNodeIds.forEach((nodeId) => {
      changed.add(nodeId)
    })
    nextNodeIds.forEach((nodeId) => {
      changed.add(nodeId)
    })
    return changed
  }

  previousNodeIds.forEach((nodeId) => {
    if (!nextNodeIds.includes(nodeId)) {
      changed.add(nodeId)
    }
  })
  nextNodeIds.forEach((nodeId) => {
    if (!previousNodeIds.includes(nodeId)) {
      changed.add(nodeId)
    }
  })

  const nodeIds = new Set<NodeId>([
    ...previousNodeIds,
    ...nextNodeIds
  ])
  nodeIds.forEach((nodeId) => {
    const previousRect = input.previous?.tree.layout?.node[nodeId]
    const nextRect = input.next?.tree.layout?.node[nodeId]
    if (!isRectEqual(previousRect, nextRect)) {
      changed.add(nodeId)
    }
  })

  return changed
}

export const patchMindmap = (input: {
  input: Input
  working: WorkingState
  queue: GraphPatchQueue
  delta: GraphDelta
  mindmapId: MindmapId
}): boolean => {
  const previous = input.working.graph.owners.mindmaps.get(input.mindmapId)
  const entry = buildMindmapEntry(input.input, input.working, input.mindmapId)
  const next = entry
    ? buildMindmapView({
        mindmap: entry.base.mindmap,
        rootId: entry.rootId,
        nodeIds: patchOrderedIds({
          previous: previous?.structure.nodeIds,
          next: entry.nodeIds
        }),
        tree: entry.structure,
        layout: entry.tree.layout,
        connectors: entry.tree.connectors
      })
    : undefined
  const action = patchFamilyEntry({
    family: input.working.graph.owners.mindmaps,
    id: input.mindmapId,
    next,
    isEqual: isMindmapViewEqual,
    delta: input.delta.entities.mindmaps
  })
  const current = input.working.graph.owners.mindmaps.get(input.mindmapId)
  const memberNodeIds = diffMindmapMemberNodes({
    previous,
    next: current
  })
  memberNodeIds.forEach((nodeId) => {
    input.queue.nodes.add(nodeId)
  })

  const geometryTouched = action === 'added'
    || action === 'removed'
    || isMindmapGeometryChanged(previous, current)

  if (geometryTouched) {
    input.delta.geometry.mindmaps.add(input.mindmapId)
    fanoutMindmapGeometry({
      queue: input.queue,
      mindmapId: input.mindmapId
    })
  }

  return action !== 'unchanged'
}
