import { edge as edgeApi, type EdgeConnectCandidate, type EdgeConnectConfig, type EdgeConnectEvaluation } from '@whiteboard/core/edge'
import { node as nodeApi,
  type Guide,
  type HorizontalResizeEdge,
  type ResizeUpdate,
  type SnapCandidate,
  type SnapThresholdConfig,
  type VerticalResizeEdge
} from '@whiteboard/core/node'
import type { Point, Rect, Size } from '@whiteboard/core/types'
import type { ModifierKeys } from '@whiteboard/editor/types/input'
import { EMPTY_GUIDES } from '@whiteboard/editor/preview/selection'

const DEFAULT_MIN_SIZE: Size = {
  width: 20,
  height: 20
}

export type ResizeSnapSource = {
  x?: HorizontalResizeEdge
  y?: VerticalResizeEdge
}

export type MoveSnapInput = {
  rect: Rect
  excludeIds?: readonly string[]
  modifiers?: ModifierKeys
  disabled?: boolean
}

export type ResizeSnapInput = {
  rect: Rect
  source: ResizeSnapSource
  minSize?: Size
  excludeIds?: readonly string[]
  disabled?: boolean
}

export type MoveSnapResult = {
  rect: Rect
  guides: readonly Guide[]
}

export type ResizeSnapResult = {
  update: ResizeUpdate
  guides: readonly Guide[]
}

export type NodeSnapRuntime = {
  move: (input: MoveSnapInput) => MoveSnapResult
  resize: (input: ResizeSnapInput) => ResizeSnapResult
}

export type EdgeSnapRuntime = {
  connect: (input: {
    pointerWorld: Point
  }) => EdgeConnectEvaluation
}

export type SnapRuntime = {
  node: NodeSnapRuntime
  edge: EdgeSnapRuntime
}

const toResizeUpdate = (
  rect: Rect
): ResizeUpdate => ({
  position: {
    x: rect.x,
    y: rect.y
  },
  size: {
    width: rect.width,
    height: rect.height
  }
})

const filterCandidates = (
  candidates: readonly SnapCandidate[],
  excludeIds?: readonly string[]
) => {
  if (!excludeIds?.length) {
    return [...candidates]
  }

  const exclude = new Set(excludeIds)
  return candidates.filter((candidate) => !exclude.has(candidate.id))
}

const createNodeSnapRuntime = ({
  config,
  readZoom,
  query
}: {
  config: SnapThresholdConfig
  readZoom: () => number
  query: (rect: Rect) => readonly SnapCandidate[]
}): NodeSnapRuntime => {
  const readThreshold = () => nodeApi.snap.thresholdWorld(
    config,
    readZoom()
  )

  return {
    move: ({
      rect,
      excludeIds,
      modifiers,
      disabled = false
    }) => {
      if (disabled) {
        return {
          rect,
          guides: EMPTY_GUIDES
        }
      }

      const threshold = readThreshold()
      const allowCrossSnap = modifiers?.alt ?? false
      const result = nodeApi.snap.compute(
        rect,
        filterCandidates(
          query(nodeApi.snap.expandRectByThreshold(rect, threshold)),
          excludeIds
        ),
        threshold,
        undefined,
        { allowCross: allowCrossSnap }
      )

      return {
        rect: {
          x: rect.x + (result.dx ?? 0),
          y: rect.y + (result.dy ?? 0),
          width: rect.width,
          height: rect.height
        },
        guides: result.guides.length > 0
          ? result.guides
          : EMPTY_GUIDES
      }
    },
    resize: ({
      rect,
      source,
      minSize = DEFAULT_MIN_SIZE,
      excludeIds,
      disabled = false
    }) => {
      if (disabled || (!source.x && !source.y)) {
        return {
          update: toResizeUpdate(rect),
          guides: EMPTY_GUIDES
        }
      }

      const threshold = readThreshold()
      const result = nodeApi.snap.computeResize({
        movingRect: rect,
        candidates: filterCandidates(
          query(nodeApi.snap.expandRectByThreshold(rect, threshold)),
          excludeIds
        ),
        threshold,
        minSize,
        sourceEdges: {
          sourceX: source.x,
          sourceY: source.y
        }
      })

      return {
        update: toResizeUpdate(result.rect),
        guides: result.guides.length > 0
          ? result.guides
          : EMPTY_GUIDES
      }
    }
  }
}

const createEdgeSnapRuntime = ({
  config,
  readZoom,
  query
}: {
  config: EdgeConnectConfig
  readZoom: () => number
  query: (rect: Rect) => readonly EdgeConnectCandidate[]
}): EdgeSnapRuntime => ({
  connect: ({
    pointerWorld
  }) => {
    const zoom = readZoom()
    return edgeApi.connect.evaluate({
      pointWorld: pointerWorld,
      candidates: query(
        edgeApi.connect.queryRect(pointerWorld, zoom, config)
      ),
      zoom,
      config
    })
  }
})

export const createSnapRuntime = ({
  readZoom,
  node,
  edge
}: {
  readZoom: () => number
  node: {
    config: SnapThresholdConfig
    query: (rect: Rect) => readonly SnapCandidate[]
  }
  edge: {
    config: EdgeConnectConfig
    query: (rect: Rect) => readonly EdgeConnectCandidate[]
  }
}): SnapRuntime => ({
  node: createNodeSnapRuntime({
    config: node.config,
    readZoom,
    query: node.query
  }),
  edge: createEdgeSnapRuntime({
    config: edge.config,
    readZoom,
    query: edge.query
  })
})
