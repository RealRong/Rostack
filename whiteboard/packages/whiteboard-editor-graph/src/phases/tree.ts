import {
  mindmap as mindmapApi,
  type MindmapLayout
} from '@whiteboard/core/mindmap'
import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import type { Input } from '../contracts/editor'
import type { MindmapStructureState } from '../contracts/working'
import {
  collectRects,
  readProjectedNodeRect,
  readProjectedNodeSize
} from '../runtime/helpers'
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

const applySubtreeMovePreview = (input: {
  layout: MindmapLayout
  structure: MindmapStructureState
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
  mindmapApi.tree.subtreeIds(input.structure.tree, input.preview.nodeId).forEach((nodeId) => {
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

export const createTreePhase = (): EditorPhase => ({
  name: 'tree',
  deps: ['structure', 'measure'],
  run: (context) => {
    const mindmaps = new Map()
    const preview = context.working.input.session.preview.mindmap

    context.working.structure.mindmaps.forEach((entry, mindmapId) => {
      const rootEntry = context.working.graph.nodes.get(entry.tree.rootNodeId)
      if (!rootEntry) {
        mindmaps.set(mindmapId, {
          layout: undefined,
          connectors: []
        })
        return
      }

      const rootRect = readProjectedNodeRect({
        entry: rootEntry,
        measuredSize: context.working.measure.nodes.get(entry.tree.rootNodeId)?.size
      })

      let layout = mindmapApi.layout.anchor({
        tree: entry.tree,
        computed: mindmapApi.layout.compute(
          entry.tree,
          (nodeId) => {
            const graphNode = context.working.graph.nodes.get(nodeId)
            return graphNode
              ? readProjectedNodeSize({
                  entry: graphNode,
                  measuredSize: context.working.measure.nodes.get(nodeId)?.size
                })
              : {
                  width: 1,
                  height: 1
                }
          },
          entry.tree.layout
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
          structure: entry,
          preview: preview.subtreeMove
        })
      }

      const enter = preview?.enter?.filter((item) => item.mindmapId === mindmapId)
      if (enter?.length) {
        layout = applyEnterPreview({
          layout,
          enter,
          now: context.working.input.clock.now
        })
      }
      const connectors = mindmapApi.render.resolve({
        tree: entry.tree,
        computed: layout
      }).connectors

      mindmaps.set(mindmapId, {
        layout,
        connectors
      })
    })

    context.working.tree = {
      mindmaps
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(mindmaps.size)
    }
  }
})
