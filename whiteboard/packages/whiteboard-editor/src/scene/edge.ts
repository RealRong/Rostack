import {
  edge as edgeApi,
  type EdgeConnectCandidate,
  type EdgeView as CoreEdgeView
} from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { collection, equal, store } from '@shared/core'
import type {
  Read as EditorGraphQuery,
  EdgeLabelUiView as RuntimeEdgeLabelUiView,
  EdgeUiView as RuntimeEdgeUiView,
  EdgeView as RuntimeEdgeView
} from '@whiteboard/editor-scene'
import type {
  Edge,
  EdgeId,
  NodeId,
  Rect,
  Size
} from '@whiteboard/core/types'
import {
  resolveEdgeCapability,
  type EdgeBox,
  type EdgeCapability
} from '@whiteboard/editor/session/edge'
import {
  toSpatialNode,
  type GraphNodeRead
} from '@whiteboard/editor/scene/node'

export type EdgeLabelRef = {
  edgeId: EdgeId
  labelId: string
}

export type EditorEdgeLabelView = {
  id: string
  text: string
  displayText: string
  style: NonNullable<Edge['labels']>[number]['style']
  point: RuntimeEdgeView['route']['labels'][number]['point']
  angle: number
  size: Size
  maskRect: RuntimeEdgeView['route']['labels'][number]['maskRect']
  editing: boolean
  caret?: RuntimeEdgeLabelUiView['caret']
}

export type EditorEdgeView = {
  edgeId: EdgeId
  edge: Edge
  selected: boolean
  box?: EdgeBox
  path: {
    svgPath?: string
    points: RuntimeEdgeView['route']['points']
  }
  labels: readonly EditorEdgeLabelView[]
}

export type EditorEdgeDetail = {
  edge: Edge
  route: RuntimeEdgeView['route']
  activeRouteIndex: number | undefined
}

export type GraphEdgeRead = {
  projected: store.KeyedReadStore<EdgeId, RuntimeEdgeView | undefined>
  ui: store.KeyedReadStore<EdgeId, RuntimeEdgeUiView | undefined>
  get: (edgeId: EdgeId) => EditorEdgeView | undefined
  view: store.KeyedReadStore<EdgeId, EditorEdgeView | undefined>
  detail: store.KeyedReadStore<EdgeId, EditorEdgeDetail | undefined>
  model: (edgeId: EdgeId) => Edge | undefined
  geometry: store.KeyedReadStore<EdgeId, CoreEdgeView | undefined>
  ids: () => readonly EdgeId[]
  all: () => readonly EditorEdgeView[]
  edges: (edgeIds: readonly EdgeId[]) => readonly Edge[]
  label: {
    metrics: (ref: EdgeLabelRef) => Size | undefined
  }
  bounds: store.KeyedReadStore<EdgeId, Rect | undefined>
  box: (edgeId: EdgeId) => EdgeBox | undefined
  capability: (edge: Edge) => EdgeCapability
  related: (nodeIds: Iterable<NodeId>) => readonly EdgeId[]
  idsInRect: (rect: Rect, options?: {
    match?: 'touch' | 'contain'
  }) => EdgeId[]
  connectCandidates: (rect: Rect) => readonly EdgeConnectCandidate[]
}

type EditorEdgeViewSources = {
  graph: RuntimeEdgeView | undefined
  ui: RuntimeEdgeUiView | undefined
}

const isEditCaretEqual = (
  left: EditorEdgeLabelView['caret'],
  right: EditorEdgeLabelView['caret']
) => left?.kind === right?.kind && (
  left?.kind !== 'point'
  || (
    right?.kind === 'point'
    && geometryApi.equal.point(left.client, right.client)
  )
)

const isEditorEdgeLabelViewEqual = (
  left: EditorEdgeLabelView,
  right: EditorEdgeLabelView
) => (
  left.id === right.id
  && left.text === right.text
  && left.displayText === right.displayText
  && left.style === right.style
  && geometryApi.equal.point(left.point, right.point)
  && left.angle === right.angle
  && left.size.width === right.size.width
  && left.size.height === right.size.height
  && left.maskRect.x === right.maskRect.x
  && left.maskRect.y === right.maskRect.y
  && left.maskRect.width === right.maskRect.width
  && left.maskRect.height === right.maskRect.height
  && left.maskRect.radius === right.maskRect.radius
  && left.maskRect.angle === right.maskRect.angle
  && geometryApi.equal.point(left.maskRect.center, right.maskRect.center)
  && left.editing === right.editing
  && isEditCaretEqual(left.caret, right.caret)
)

const isEditorEdgeViewEqual = (
  left: EditorEdgeView | undefined,
  right: EditorEdgeView | undefined
) => left === right || (
  left !== undefined
  && right !== undefined
  && left.edgeId === right.edgeId
  && left.edge === right.edge
  && left.selected === right.selected
  && left.box?.pad === right.box?.pad
  && equal.sameOptionalRect(left.box?.rect, right.box?.rect)
  && left.path.svgPath === right.path.svgPath
  && equal.samePointArray(left.path.points, right.path.points)
  && equal.sameOrder(left.labels, right.labels, isEditorEdgeLabelViewEqual)
)

const toEditorEdgeView = (
  graph: RuntimeEdgeView | undefined,
  ui: RuntimeEdgeUiView | undefined
): EditorEdgeView | undefined => {
  if (!graph) {
    return undefined
  }

  return {
    edgeId: graph.base.edge.id,
    edge: graph.base.edge,
    selected: ui?.selected ?? false,
    box: graph.box,
    path: {
      svgPath: graph.route.svgPath,
      points: graph.route.points
    },
    labels: graph.route.labels.map((label) => {
      const labelUi = ui?.labels.get(label.labelId)
      return {
        id: label.labelId,
        text: label.text,
        displayText: label.displayText,
        style: label.style,
        point: label.point,
        angle: label.angle,
        size: label.size,
        maskRect: label.maskRect,
        editing: labelUi?.editing ?? false,
        caret: labelUi?.caret
      }
    })
  }
}

const isEdgePathSegmentEqual = (
  left: CoreEdgeView['path']['segments'][number],
  right: CoreEdgeView['path']['segments'][number]
) => (
  left === right
  || (
    left.role === right.role
    && left.insertIndex === right.insertIndex
    && geometryApi.equal.point(left.from, right.from)
    && geometryApi.equal.point(left.to, right.to)
    && geometryApi.equal.point(left.insertPoint, right.insertPoint)
    && equal.samePointArray(left.hitPoints, right.hitPoints)
  )
)

const isEdgeHandleEqual = (
  left: CoreEdgeView['handles'][number],
  right: CoreEdgeView['handles'][number]
) => {
  if (left === right) {
    return true
  }
  if (left.kind !== right.kind) {
    return false
  }
  if (!geometryApi.equal.point(left.point, right.point)) {
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

const isEdgeGeometryEqual = (
  left: CoreEdgeView | undefined,
  right: CoreEdgeView | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && edgeApi.equal.resolvedEnd(left.ends.source, right.ends.source)
    && edgeApi.equal.resolvedEnd(left.ends.target, right.ends.target)
    && left.path.svgPath === right.path.svgPath
    && equal.samePointArray(left.path.points, right.path.points)
    && geometryApi.equal.point(left.path.label, right.path.label)
    && equal.sameOrder(
      left.path.segments,
      right.path.segments,
      isEdgePathSegmentEqual
    )
    && equal.sameOrder(
      left.handles,
      right.handles,
      isEdgeHandleEqual
    )
  )
)

const readResolvedNodeSnapshot = (
  readNode: Pick<GraphNodeRead, 'geometry'>,
  edgeEnd: Edge['source'] | Edge['target']
): {
  node: ReturnType<typeof toSpatialNode>
  geometry: NonNullable<ReturnType<GraphNodeRead['geometry']>>
} | undefined => {
  if (edgeEnd.kind !== 'node') {
    return undefined
  }

  const geometry = readNode.geometry(edgeEnd.nodeId)
  return geometry
    ? {
        node: toSpatialNode({
          node: geometry.node,
          rect: geometry.rect,
          rotation: geometry.rotation
        }),
        geometry
      }
    : undefined
}

export const resolveGraphEdgeGeometry = (input: {
  edge: Edge
  readNodeGeometry: (nodeId: NodeId) => NonNullable<ReturnType<GraphNodeRead['geometry']>> | undefined
}): CoreEdgeView | undefined => {
  const source = readResolvedNodeSnapshot({
    geometry: input.readNodeGeometry
  }, input.edge.source)
  const target = readResolvedNodeSnapshot({
    geometry: input.readNodeGeometry
  }, input.edge.target)

  if (
    (input.edge.source.kind === 'node' && !source)
    || (input.edge.target.kind === 'node' && !target)
  ) {
    return undefined
  }

  try {
    return edgeApi.view.resolve({
      edge: input.edge,
      source,
      target
    })
  } catch {
    return undefined
  }
}

const readLabelMetrics = ({
  edgeGraph,
  ref
}: {
  edgeGraph: store.KeyedReadStore<EdgeId, RuntimeEdgeView | undefined>
  ref: EdgeLabelRef
}): Size | undefined => store.read(edgeGraph, ref.edgeId)?.route.labels
  .find((entry) => entry.labelId === ref.labelId)?.size

export const createGraphEdgeRead = ({
  sources,
  spatial,
  relatedEdges,
  node,
  geometry: readGeometry
}: {
  sources: {
    edgeGraphIds: store.ReadStore<readonly EdgeId[]>
    edgeGraph: store.KeyedReadStore<EdgeId, RuntimeEdgeView | undefined>
    edgeUi: store.KeyedReadStore<EdgeId, RuntimeEdgeUiView | undefined>
  }
  spatial: EditorGraphQuery['spatial']
  relatedEdges: EditorGraphQuery['relatedEdges']
  node: Pick<GraphNodeRead, 'geometry' | 'capability'>
  geometry: (edgeId: EdgeId) => CoreEdgeView | undefined
}): GraphEdgeRead => {
  const readIds = () => store.read(sources.edgeGraphIds) as readonly EdgeId[]

  const viewSources = store.createStructKeyedStore<EdgeId, EditorEdgeViewSources>({
    fields: {
      graph: {
        get: (edgeId) => store.read(sources.edgeGraph, edgeId)
      },
      ui: {
        get: (edgeId) => store.read(sources.edgeUi, edgeId)
      }
    }
  })

  const view: GraphEdgeRead['view'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const current = store.read(viewSources, edgeId)
      return toEditorEdgeView(current.graph, current.ui)
    },
    isEqual: isEditorEdgeViewEqual
  })

  const detail: GraphEdgeRead['detail'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const graph = store.read(sources.edgeGraph, edgeId)
      if (!graph) {
        return undefined
      }

      return {
        edge: graph.base.edge,
        route: graph.route,
        activeRouteIndex: store.read(sources.edgeUi, edgeId)?.activeRouteIndex
      }
    },
    isEqual: (left, right) => left === right
  })

  const geometry: GraphEdgeRead['geometry'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => readGeometry(edgeId),
    isEqual: isEdgeGeometryEqual
  })

  const bounds: GraphEdgeRead['bounds'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => store.read(sources.edgeGraph, edgeId)?.route.bounds,
    isEqual: equal.sameOptionalRect
  })

  const connectCandidates: GraphEdgeRead['connectCandidates'] = (
    rect
  ) => {
    const nodeIds = spatial.rect(rect, {
      kinds: ['node']
    }).map((record) => record.item.id)
    const candidates: EdgeConnectCandidate[] = []

    for (let index = 0; index < nodeIds.length; index += 1) {
      const geometry = node.geometry(nodeIds[index])
      if (!geometry || !node.capability(geometry.node).connect) {
        continue
      }

      candidates.push({
        nodeId: geometry.node.id,
        node: toSpatialNode({
          node: geometry.node,
          rect: geometry.rect,
          rotation: geometry.rotation
        }),
        geometry
      })
    }

    return candidates
  }

  const readNodeLocked = (
    nodeId: NodeId
  ) => Boolean(node.geometry(nodeId)?.node.locked)

  return {
    projected: sources.edgeGraph,
    ui: sources.edgeUi,
    get: (edgeId) => store.read(view, edgeId),
    view,
    detail,
    model: (edgeId) => store.read(sources.edgeGraph, edgeId)?.base.edge,
    geometry,
    ids: readIds,
    all: () => collection.presentValues(
      readIds(),
      (edgeId) => store.read(view, edgeId)
    ),
    edges: (edgeIds) => collection.presentValues(edgeIds, (edgeId) => store.read(sources.edgeGraph, edgeId)?.base.edge),
    label: {
      metrics: (ref) => readLabelMetrics({
        edgeGraph: sources.edgeGraph,
        ref
      })
    },
    bounds,
    box: (edgeId) => store.read(sources.edgeGraph, edgeId)?.box,
    capability: (edge) => resolveEdgeCapability({
      edge,
      readNodeLocked
    }),
    related: relatedEdges,
    idsInRect: (rect, options) => {
      const mode = options?.match ?? 'touch'
      return spatial.rect(rect, {
        kinds: ['edge']
      }).flatMap((record) => {
        const edgeId = record.item.id
        const current = store.read(geometry, edgeId)
        return current && edgeApi.hit.test({
          path: current.path,
          queryRect: rect,
          mode
        })
          ? [edgeId]
          : []
      })
    },
    connectCandidates
  }
}
