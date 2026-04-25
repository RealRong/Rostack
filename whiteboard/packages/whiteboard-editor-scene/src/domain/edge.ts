import { equal } from '@shared/core'
import { idDelta } from '@shared/projector/delta'
import { edge as edgeApi } from '@whiteboard/core/edge'
import type {
  Edge,
  EdgeId,
  NodeId,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import type { GraphDelta } from '../contracts/delta'
import type {
  EdgeView,
  Input,
  NodeView,
  SessionInput
} from '../contracts/editor'
import type {
  GraphEdgeEntry,
  WorkingState
} from '../contracts/working'
import { geometry as geometryApi } from '@whiteboard/core/geometry'

const readEdgePatch = (
  entry: GraphEdgeEntry
) => entry.preview?.patch ?? entry.draft?.patch

const readEdgeLabelDisplayText = (
  value: string,
  editing: boolean
) => value || (editing ? 'Label' : '')

const buildEdgeLabelRect = (
  point: Point,
  size: Size
): Rect => ({
  x: point.x - size.width / 2,
  y: point.y - size.height / 2,
  width: size.width,
  height: size.height
})

const toEdgeNodeSnapshot = (
  nodeView: NodeView | undefined
) => nodeView
  ? {
      node: {
        ...nodeView.base.node,
        position: {
          x: nodeView.geometry.rect.x,
          y: nodeView.geometry.rect.y
        },
        size: {
          width: nodeView.geometry.rect.width,
          height: nodeView.geometry.rect.height
        },
        rotation: nodeView.geometry.rotation
      },
      geometry: nodeView.geometry.outline
    }
  : undefined

export type EdgeNodeSnapshot = ReturnType<typeof toEdgeNodeSnapshot>

const readEdgeNodeSnapshot = (input: {
  nodeId: NodeId | undefined
  nodes: ReadonlyMap<string, NodeView>
  cache?: Map<NodeId, EdgeNodeSnapshot>
}): EdgeNodeSnapshot => {
  if (!input.nodeId) {
    return undefined
  }

  const cached = input.cache?.get(input.nodeId)
  if (cached || input.cache?.has(input.nodeId)) {
    return cached
  }

  const snapshot = toEdgeNodeSnapshot(input.nodes.get(input.nodeId))
  input.cache?.set(input.nodeId, snapshot)
  return snapshot
}

const readProjectedEdge = (
  entry: GraphEdgeEntry
): Edge => {
  const patch = readEdgePatch(entry)
  return patch
    ? edgeApi.patch.apply(entry.base.edge, patch)
    : entry.base.edge
}

const readProjectedEdgeNodes = (
  edge: Edge
) => ({
  source: edge.source.kind === 'node'
    ? edge.source.nodeId
    : undefined,
  target: edge.target.kind === 'node'
    ? edge.target.nodeId
    : undefined
})

const readEdgePoints = (
  edge: Edge
): readonly Point[] => edge.route?.kind === 'manual'
  ? edge.route.points
  : []

const readEdgeBox = (
  rect: Rect | undefined,
  edge: GraphEdgeEntry['base']['edge']
) => rect
  ? {
      rect,
      pad: Math.max(24, (edge.style?.width ?? 2) + 16)
    }
  : undefined

const isEdgeHandleEqual = (
  left: EdgeView['route']['handles'][number],
  right: EdgeView['route']['handles'][number]
): boolean => {
  if (left === right) {
    return true
  }

  if (left.kind !== right.kind || !equal.sameOptionalPoint(left.point, right.point)) {
    return false
  }

  switch (left.kind) {
    case 'end':
      return right.kind === 'end' && left.end === right.end
    case 'anchor':
      return (
        right.kind === 'anchor'
        && left.index === right.index
        && left.mode === right.mode
      )
    case 'segment':
      return (
        right.kind === 'segment'
        && left.role === right.role
        && left.insertIndex === right.insertIndex
        && left.segmentIndex === right.segmentIndex
        && left.axis === right.axis
      )
  }
}

const isEdgeLabelViewEqual = (
  left: EdgeView['route']['labels'][number],
  right: EdgeView['route']['labels'][number]
): boolean => (
  left.labelId === right.labelId
  && left.text === right.text
  && left.displayText === right.displayText
  && left.style === right.style
  && geometryApi.equal.size(left.size, right.size)
  && geometryApi.equal.point(left.point, right.point)
  && left.angle === right.angle
  && equal.sameRect(left.rect, right.rect)
  && left.maskRect.x === right.maskRect.x
  && left.maskRect.y === right.maskRect.y
  && left.maskRect.width === right.maskRect.width
  && left.maskRect.height === right.maskRect.height
  && left.maskRect.radius === right.maskRect.radius
  && left.maskRect.angle === right.maskRect.angle
  && equal.sameOptionalPoint(left.maskRect.center, right.maskRect.center)
)

const isEdgeViewEqual = (
  left: EdgeView,
  right: EdgeView
): boolean => (
  left.base.edge === right.base.edge
  && left.base.nodes.source === right.base.nodes.source
  && left.base.nodes.target === right.base.nodes.target
  && left.route.svgPath === right.route.svgPath
  && equal.sameOptionalRect(left.route.bounds, right.route.bounds)
  && equal.sameOptionalPoint(left.route.source, right.route.source)
  && equal.sameOptionalPoint(left.route.target, right.route.target)
  && (
    left.route.ends === right.route.ends
    || (
      left.route.ends !== undefined
      && right.route.ends !== undefined
      && edgeApi.equal.resolvedEnd(left.route.ends.source, right.route.ends.source)
      && edgeApi.equal.resolvedEnd(left.route.ends.target, right.route.ends.target)
    )
  )
  && equal.sameOrder(left.route.points, right.route.points, geometryApi.equal.point)
  && equal.sameOrder(left.route.handles, right.route.handles, isEdgeHandleEqual)
  && equal.sameOrder(left.route.labels, right.route.labels, isEdgeLabelViewEqual)
  && left.box?.pad === right.box?.pad
  && equal.sameOptionalRect(left.box?.rect, right.box?.rect)
)

const isEdgeGeometryChanged = (
  previous: EdgeView | undefined,
  next: EdgeView | undefined
): boolean => (
  previous === undefined
  || next === undefined
  || previous.route.svgPath !== next.route.svgPath
  || !equal.sameOptionalRect(previous.route.bounds, next.route.bounds)
  || !equal.sameOptionalPoint(previous.route.source, next.route.source)
  || !equal.sameOptionalPoint(previous.route.target, next.route.target)
  || (
    previous.route.ends !== next.route.ends
    && (
      previous.route.ends === undefined
      || next.route.ends === undefined
      || !edgeApi.equal.resolvedEnd(previous.route.ends.source, next.route.ends.source)
      || !edgeApi.equal.resolvedEnd(previous.route.ends.target, next.route.ends.target)
    )
  )
  || !equal.sameOrder(previous.route.points, next.route.points, geometryApi.equal.point)
  || !equal.sameOrder(previous.route.handles, next.route.handles, isEdgeHandleEqual)
  || !equal.sameOrder(previous.route.labels, next.route.labels, isEdgeLabelViewEqual)
  || previous.box?.pad !== next.box?.pad
  || !equal.sameOptionalRect(previous.box?.rect, next.box?.rect)
)

export const readEdgeEntry = (
  input: Input,
  indexes: WorkingState['indexes'],
  edgeId: EdgeId
): GraphEdgeEntry | undefined => {
  const edge = input.document.snapshot.document.edges[edgeId]
  if (!edge) {
    return undefined
  }

  return {
    base: {
      edge,
      nodes: indexes.edgeNodesByEdge.get(edgeId) ?? {}
    },
    draft: input.session.draft.edges.get(edgeId),
    preview: input.session.preview.edges.get(edgeId)
  }
}

export const buildEdgeView = (input: {
  edgeId: EdgeId
  entry: GraphEdgeEntry
  nodes: ReadonlyMap<string, NodeView>
  nodeSnapshotCache?: Map<NodeId, EdgeNodeSnapshot>
  measure?: WorkingState['measure']
  edit: SessionInput['edit']
}): EdgeView => {
  const edge = readProjectedEdge(input.entry)
  const sourceNodeId = edge.source.kind === 'node'
    ? edge.source.nodeId
    : undefined
  const targetNodeId = edge.target.kind === 'node'
    ? edge.target.nodeId
    : undefined
  const geometry = (() => {
    try {
      return edgeApi.view.resolve({
        edge,
        source: readEdgeNodeSnapshot({
          nodeId: sourceNodeId,
          nodes: input.nodes,
          cache: input.nodeSnapshotCache
        }),
        target: readEdgeNodeSnapshot({
          nodeId: targetNodeId,
          nodes: input.nodes,
          cache: input.nodeSnapshotCache
        })
      })
    } catch {
      return undefined
    }
  })()
  const textMode = edge.textMode ?? 'horizontal'
  const labels = (edge.labels ?? []).flatMap((label) => {
    const editSession = input.edit?.kind === 'edge-label'
      && input.edit.edgeId === input.edgeId
      && input.edit.labelId === label.id
      ? input.edit
      : undefined
    const text = editSession
      ? editSession.text
      : label.text ?? ''
    const displayText = readEdgeLabelDisplayText(text, Boolean(editSession))
    if (!displayText.trim()) {
      return []
    }

    const measuredLabel = label.text === displayText
      ? label
      : {
          ...label,
          text: displayText
        }
    const measuredSize = input.measure?.({
      kind: 'edge-label',
      edgeId: input.edgeId,
      labelId: label.id,
      label: measuredLabel
    })
    const size = edgeApi.label.placementSize({
      textMode,
      measuredSize,
      text: displayText,
      fontSize: label.style?.size
    })
    if (!size) {
      return []
    }

    const placement = geometry
      ? edgeApi.label.placement({
          path: geometry.path,
          t: label.t,
          offset: label.offset,
          textMode,
          labelSize: size,
          sideGap: edgeApi.label.sideGap(textMode)
        })
      : undefined

    if (!placement) {
      return []
    }

    const angle = textMode === 'tangent'
      ? placement.angle
      : 0

    return [{
      labelId: label.id,
      text,
      displayText,
      style: label.style,
      size,
      point: placement.point,
      angle,
      rect: buildEdgeLabelRect(placement.point, size),
      maskRect: edgeApi.label.mask({
        center: placement.point,
        size,
        angle,
        margin: 4
      })
    }]
  })
  const pathBounds = geometry
    ? edgeApi.path.bounds(geometry.path)
    : undefined
  const bounds = geometryApi.rect.boundingRect([
    ...(
      pathBounds
        ? [pathBounds]
        : []
    ),
    ...labels.map((label) => label.rect)
  ])

  return {
    base: {
      edge,
      nodes: readProjectedEdgeNodes(edge)
    },
    route: {
      points: geometry?.path.points ?? readEdgePoints(edge),
      svgPath: geometry?.path.svgPath,
      bounds,
      source: geometry?.ends.source.point,
      target: geometry?.ends.target.point,
      ends: geometry?.ends,
      handles: geometry?.handles ?? [],
      labels
    },
    box: readEdgeBox(pathBounds, edge)
  }
}

export const patchEdge = (input: {
  input: Input
  working: WorkingState
  delta: GraphDelta
  edgeId: EdgeId
  nodeSnapshotCache?: Map<NodeId, EdgeNodeSnapshot>
}): {
  changed: boolean
  geometryChanged: boolean
} => {
  const previous = input.working.graph.edges.get(input.edgeId)
  const entry = readEdgeEntry(input.input, input.working.indexes, input.edgeId)
  const next = entry
      ? buildEdgeView({
        edgeId: input.edgeId,
        entry,
        nodes: input.working.graph.nodes,
        nodeSnapshotCache: input.nodeSnapshotCache,
        measure: input.working.measure,
        edit: input.input.session.edit
      })
    : undefined

  if (next === undefined) {
    if (previous === undefined) {
      return {
        changed: false,
        geometryChanged: false
      }
    }

    input.working.graph.edges.delete(input.edgeId)
    idDelta.remove(input.delta.entities.edges, input.edgeId)
    input.delta.geometry.edges.add(input.edgeId)
    return {
      changed: true,
      geometryChanged: true
    }
  }

  if (previous === undefined) {
    input.working.graph.edges.set(input.edgeId, next)
    idDelta.add(input.delta.entities.edges, input.edgeId)
    input.delta.geometry.edges.add(input.edgeId)
    return {
      changed: true,
      geometryChanged: true
    }
  }

  if (isEdgeViewEqual(previous, next)) {
    return {
      changed: false,
      geometryChanged: false
    }
  }

  input.working.graph.edges.set(input.edgeId, next)
  idDelta.update(input.delta.entities.edges, input.edgeId)

  const geometryChanged = isEdgeGeometryChanged(previous, next)
  if (geometryChanged) {
    input.delta.geometry.edges.add(input.edgeId)
  }

  return {
    changed: true,
    geometryChanged
  }
}
