import {
  mindmap as mindmapApi,
  type MindmapLayout
} from '@whiteboard/core/mindmap'
import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import type { Input } from '../contracts/editor'
import type {
  GraphEdgeEntry,
  GraphGroupEntry,
  GraphMindmapEntry,
  GraphNodeEntry
} from '../contracts/working'
import {
  readProjectedNodeRect,
  readProjectedNodeSize
} from '../runtime/projection'
import {
  buildEdgeView,
  buildGroupView,
  buildMindmapView,
  buildNodeView
} from '../runtime/views'
import type { EditorPhase } from './shared'
import { toMetric } from './shared'

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

const collectRects = (
  values: Iterable<Rect>
): Rect | undefined => {
  const rects = [...values]
  if (rects.length === 0) {
    return undefined
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
  if (!input.enter?.length) {
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

const readNodeEntries = (
  input: Pick<Input, 'document' | 'session'>
): ReadonlyMap<string, GraphNodeEntry> => {
  const entries = new Map<string, GraphNodeEntry>()
  const snapshot = input.document.snapshot

  snapshot.state.facts.entities.nodes.forEach((node, nodeId) => {
    entries.set(nodeId, {
      base: {
        node,
        owner: snapshot.state.facts.relations.nodeOwner.get(nodeId)
      },
      draft: input.session.draft.nodes.get(nodeId),
      preview: input.session.preview.nodes.get(nodeId)
    })
  })

  return entries
}

const readEdgeEntries = (
  input: Pick<Input, 'document' | 'session'>
): ReadonlyMap<string, GraphEdgeEntry> => {
  const entries = new Map<string, GraphEdgeEntry>()
  const snapshot = input.document.snapshot

  snapshot.state.facts.entities.edges.forEach((edge, edgeId) => {
    entries.set(edgeId, {
      base: {
        edge,
        nodes: snapshot.state.facts.relations.edgeNodes.get(edgeId) ?? {}
      },
      draft: input.session.draft.edges.get(edgeId),
      preview: input.session.preview.edges.get(edgeId)
    })
  })

  return entries
}

const readMindmapEntries = (input: {
  document: Input['document']
  session: Input['session']
  measure: Input['measure']
  clock: Input['clock']
  nodes: ReadonlyMap<string, GraphNodeEntry>
}): ReadonlyMap<string, GraphMindmapEntry> => {
  const entries = new Map<string, GraphMindmapEntry>()
  const snapshot = input.document.snapshot
  const preview = input.session.preview.mindmap

  snapshot.state.facts.entities.owners.mindmaps.forEach((mindmap, mindmapId) => {
    const nodeIds = snapshot.state.facts.relations.ownerNodes.mindmaps.get(mindmapId) ?? []
    const tree = mindmapApi.tree.fromRecord(mindmap)
    const rootEntry = input.nodes.get(tree.rootNodeId)

    if (!rootEntry) {
      entries.set(mindmapId, {
        base: {
          mindmap
        },
        nodeIds,
        tree: {
          layout: undefined,
          connectors: []
        }
      })
      return
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
          const graphNode = input.nodes.get(nodeId)
          return graphNode
            ? readProjectedNodeSize({
                entry: graphNode,
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

    const enter = preview?.enter?.filter((item) => item.mindmapId === mindmapId)
    if (enter?.length) {
      layout = applyEnterPreview({
        layout,
        enter,
        now: input.clock.now
      })
    }

    entries.set(mindmapId, {
      base: {
        mindmap
      },
      nodeIds,
      tree: {
        layout,
        connectors: mindmapApi.render.resolve({
          tree,
          computed: layout
        }).connectors
      }
    })
  })

  return entries
}

const readGroupEntries = (
  input: Pick<Input, 'document'>
): ReadonlyMap<string, GraphGroupEntry> => {
  const entries = new Map<string, GraphGroupEntry>()

  input.document.snapshot.state.facts.entities.owners.groups.forEach((_group, groupId) => {
    entries.set(groupId, {
      items: input.document.snapshot.state.facts.relations.groupItems.get(groupId) ?? []
    })
  })

  return entries
}

export const createGraphPhase = (): EditorPhase => ({
  name: 'graph',
  deps: [],
  run: (context) => {
    const nodes = readNodeEntries(context.input)
    const edges = readEdgeEntries(context.input)
    const mindmaps = readMindmapEntries({
      document: context.input.document,
      session: context.input.session,
      measure: context.input.measure,
      clock: context.input.clock,
      nodes
    })
    const groups = readGroupEntries(context.input)

    const nodeViews = new Map()
    nodes.forEach((entry, nodeId) => {
      const treeRect = entry.base.owner?.kind === 'mindmap'
        ? mindmaps.get(entry.base.owner.id)?.tree.layout?.node[nodeId]
        : undefined

      nodeViews.set(nodeId, buildNodeView({
        entry,
        measuredSize: context.input.measure.text.nodes.get(nodeId)?.size,
        treeRect,
        edit: context.input.session.edit
      }))
    })

    const edgeViews = new Map()
    edges.forEach((entry, edgeId) => {
      edgeViews.set(edgeId, buildEdgeView({
        edgeId,
        entry,
        nodes: nodeViews,
        labelMeasures: context.input.measure.text.edgeLabels.get(edgeId),
        edit: context.input.session.edit
      }))
    })

    const mindmapViews = new Map()
    mindmaps.forEach((entry, mindmapId) => {
      mindmapViews.set(mindmapId, buildMindmapView({
        mindmap: entry.base.mindmap,
        nodeIds: entry.nodeIds,
        layout: entry.tree.layout,
        connectors: entry.tree.connectors
      }))
    })

    const groupViews = new Map()
    groups.forEach((entry, groupId) => {
      const group = context.input.document.snapshot.state.facts.entities.owners.groups.get(groupId)
      if (!group) {
        return
      }

      groupViews.set(groupId, buildGroupView({
        group,
        items: entry.items,
        nodes: nodeViews,
        mindmaps: mindmapViews
      }))
    })

    context.working.revision = {
      document: context.input.document.snapshot.revision
    }
    context.working.graph = {
      nodes: nodeViews,
      edges: edgeViews,
      owners: {
        mindmaps: mindmapViews,
        groups: groupViews
      }
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(
        nodeViews.size
        + edgeViews.size
        + mindmapViews.size
        + groupViews.size
      )
    }
  }
})
