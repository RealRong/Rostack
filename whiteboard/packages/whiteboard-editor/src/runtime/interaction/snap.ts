import {
  resolveEdgeConnectQueryRect,
  resolveEdgeConnectTarget,
  type EdgeConnectCandidate,
  type EdgeConnectConfig,
  type EdgeConnectResult
} from '@whiteboard/core/edge'
import {
  computeResizeSnap,
  computeSnap,
  expandRectByThreshold,
  resolveSnapThresholdWorld,
  type Guide,
  type HorizontalResizeEdge,
  type ResizeUpdate,
  type SnapCandidate,
  type SnapThresholdConfig,
  type VerticalResizeEdge
} from '@whiteboard/core/node'
import type { Point, Rect, Size } from '@whiteboard/core/types'
import type { ModifierKeys } from '../../types/input'

const EMPTY_GUIDES: readonly Guide[] = []
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

export type MoveSnapResult = Rect

export type ResizeSnapResult = ResizeUpdate

export type NodeSnapRuntime = {
  move: (input: MoveSnapInput) => MoveSnapResult
  resize: (input: ResizeSnapInput) => ResizeSnapResult
  clear: () => void
}

export type EdgeSnapRuntime = {
  connect: (pointWorld: Point) => EdgeConnectResult | undefined
}

export type SnapRuntime = {
  node: NodeSnapRuntime
  edge: EdgeSnapRuntime
  clear: () => void
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
  query,
  writeGuides
}: {
  config: SnapThresholdConfig
  readZoom: () => number
  query: (rect: Rect) => readonly SnapCandidate[]
  writeGuides: (guides: readonly Guide[]) => void
}): NodeSnapRuntime => {
  const readThreshold = () => resolveSnapThresholdWorld(
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
        writeGuides(EMPTY_GUIDES)
        return rect
      }

      const threshold = readThreshold()
      const allowCrossSnap = modifiers?.alt ?? false
      const result = computeSnap(
        rect,
        filterCandidates(
          query(expandRectByThreshold(rect, threshold)),
          excludeIds
        ),
        threshold,
        undefined,
        { allowCross: allowCrossSnap }
      )

      const guides = result.guides.length > 0
        ? result.guides
        : EMPTY_GUIDES
      writeGuides(guides)

      return {
        x: rect.x + (result.dx ?? 0),
        y: rect.y + (result.dy ?? 0),
        width: rect.width,
        height: rect.height
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
        writeGuides(EMPTY_GUIDES)
        return toResizeUpdate(rect)
      }

      const threshold = readThreshold()
      const result = computeResizeSnap({
        movingRect: rect,
        candidates: filterCandidates(
          query(expandRectByThreshold(rect, threshold)),
          excludeIds
        ),
        threshold,
        minSize,
        sourceEdges: {
          sourceX: source.x,
          sourceY: source.y
        }
      })

      writeGuides(
        result.guides.length > 0
          ? result.guides
          : EMPTY_GUIDES
      )

      return toResizeUpdate(result.rect)
    },
    clear: () => {
      writeGuides(EMPTY_GUIDES)
    }
  }
}

const createEdgeSnapRuntime = ({
  config,
  nodeSize,
  readZoom,
  query
}: {
  config: EdgeConnectConfig
  nodeSize: Size
  readZoom: () => number
  query: (rect: Rect) => readonly EdgeConnectCandidate[]
}): EdgeSnapRuntime => ({
  connect: (pointWorld) => {
    const zoom = readZoom()
    return resolveEdgeConnectTarget({
      pointWorld,
      candidates: query(
        resolveEdgeConnectQueryRect(pointWorld, zoom, config, nodeSize)
      ),
      zoom,
      config
    })
  }
})

export const createSnapRuntime = ({
  readZoom,
  node,
  edge,
  writeGuides
}: {
  readZoom: () => number
  node: {
    config: SnapThresholdConfig
    query: (rect: Rect) => readonly SnapCandidate[]
  }
  edge: {
    config: EdgeConnectConfig
    nodeSize: Size
    query: (rect: Rect) => readonly EdgeConnectCandidate[]
  }
  writeGuides: (guides: readonly Guide[]) => void
}): SnapRuntime => ({
  node: createNodeSnapRuntime({
    config: node.config,
    readZoom,
    query: node.query,
    writeGuides
  }),
  edge: createEdgeSnapRuntime({
    config: edge.config,
    nodeSize: edge.nodeSize,
    readZoom,
    query: edge.query
  }),
  clear: () => {
    writeGuides(EMPTY_GUIDES)
  }
})
