import { equal, store } from '@shared/core'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type {
  EdgeId,
  Point
} from '@whiteboard/core/types'
import type { HoverStore } from '@whiteboard/editor/input/hover/store'
import type { GraphEdgeRead } from '@whiteboard/editor/scene/edge'
import {
  readSelectedEdgeId,
  readSelectedEdgeRoutePoints,
  type SelectedEdgeChrome
} from '@whiteboard/editor/session/edge'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type { EdgeGuide } from '@whiteboard/editor/session/preview/types'
import type {
  EditorInteractionState,
  EdgeActiveRenderItem,
  EdgeActiveRenderModel,
  EdgeInteractionRead,
  EdgeInteractionState,
  EdgeLabelRenderItem,
  EdgeLabelRenderModel,
  EdgeOverlayEndpointHandle,
  EdgeOverlayRenderModel,
  EdgeRenderRuntime,
  EdgeRenderStyle,
  EdgeStaticBucket,
  EdgeStaticRenderModel
} from '@whiteboard/editor/types/editor'
import type { Tool } from '@whiteboard/editor/types/tool'

const EMPTY_ENDPOINT_HANDLES: readonly EdgeOverlayEndpointHandle[] = []
const EMPTY_ROUTE_POINTS: NonNullable<EdgeOverlayRenderModel['routePoints']> = []

const isRenderStyleEqual = (
  left: EdgeRenderStyle,
  right: EdgeRenderStyle
) => (
  left.color === right.color
  && left.width === right.width
  && left.opacity === right.opacity
  && left.dash === right.dash
  && left.start === right.start
  && left.end === right.end
)

const readRenderStyle = (
  edge: NonNullable<ReturnType<GraphEdgeRead['model']>>
): EdgeRenderStyle => ({
  color: edge.style?.color,
  width: edge.style?.width ?? 2,
  opacity: edge.style?.opacity ?? 1,
  dash: edge.style?.dash,
  start: edge.style?.start,
  end: edge.style?.end
})

const toBucketId = (
  style: EdgeRenderStyle
) => [
  style.color ?? '',
  style.width,
  style.opacity,
  style.dash ?? '',
  style.start ?? '',
  style.end ?? ''
].join('|')

const isStaticBucketEqual = (
  left: EdgeStaticBucket,
  right: EdgeStaticBucket
) => (
  left.id === right.id
  && isRenderStyleEqual(left.style, right.style)
  && equal.sameOrder(
    left.paths,
    right.paths,
    (currentLeft, currentRight) => (
      currentLeft.id === currentRight.id
      && currentLeft.svgPath === currentRight.svgPath
    )
  )
)

const isStaticRenderModelEqual = (
  left: EdgeStaticRenderModel,
  right: EdgeStaticRenderModel
) => equal.sameOrder(
  left.buckets,
  right.buckets,
  isStaticBucketEqual
)

const isActiveRenderItemEqual = (
  left: EdgeActiveRenderItem,
  right: EdgeActiveRenderItem
) => (
  left.id === right.id
  && left.svgPath === right.svgPath
  && left.box?.x === right.box?.x
  && left.box?.y === right.box?.y
  && left.box?.width === right.box?.width
  && left.box?.height === right.box?.height
  && left.box?.pad === right.box?.pad
  && isRenderStyleEqual(left.style, right.style)
  && left.state.hovered === right.state.hovered
  && left.state.focused === right.state.focused
  && left.state.selected === right.state.selected
  && left.state.editing === right.state.editing
)

const isActiveRenderModelEqual = (
  left: EdgeActiveRenderModel,
  right: EdgeActiveRenderModel
) => equal.sameOrder(
  left.edges,
  right.edges,
  isActiveRenderItemEqual
)

const isLabelRenderItemEqual = (
  left: EdgeLabelRenderItem,
  right: EdgeLabelRenderItem
) => (
  left.edgeId === right.edgeId
  && left.labelId === right.labelId
  && geometryApi.equal.point(left.point, right.point)
  && left.angle === right.angle
  && left.text === right.text
  && left.displayText === right.displayText
  && left.editing === right.editing
  && left.selected === right.selected
  && left.style === right.style
  && left.maskRect.x === right.maskRect.x
  && left.maskRect.y === right.maskRect.y
  && left.maskRect.width === right.maskRect.width
  && left.maskRect.height === right.maskRect.height
  && left.maskRect.radius === right.maskRect.radius
  && left.maskRect.angle === right.maskRect.angle
  && geometryApi.equal.point(left.maskRect.center, right.maskRect.center)
  && left.caret?.kind === right.caret?.kind
  && (
    left.caret?.kind !== 'point'
    || (
      right.caret?.kind === 'point'
      && geometryApi.equal.point(left.caret.client, right.caret.client)
    )
  )
)

const isLabelRenderModelEqual = (
  left: EdgeLabelRenderModel,
  right: EdgeLabelRenderModel
) => equal.sameOrder(
  left.labels,
  right.labels,
  isLabelRenderItemEqual
)

const isOverlayHandleEqual = (
  left: EdgeOverlayEndpointHandle,
  right: EdgeOverlayEndpointHandle
) => (
  left.edgeId === right.edgeId
  && left.end === right.end
  && geometryApi.equal.point(left.point, right.point)
)

const isOverlayRenderModelEqual = (
  left: EdgeOverlayRenderModel,
  right: EdgeOverlayRenderModel
) => (
  left.previewPath?.svgPath === right.previewPath?.svgPath
  && left.previewPath?.style === right.previewPath?.style
  && (
    (left.snapPoint === undefined && right.snapPoint === undefined)
    || (
      left.snapPoint !== undefined
      && right.snapPoint !== undefined
      && geometryApi.equal.point(left.snapPoint, right.snapPoint)
    )
  )
  && equal.sameOrder(
    left.endpointHandles,
    right.endpointHandles,
    isOverlayHandleEqual
  )
  && equal.sameOrder(
    left.routePoints,
    right.routePoints,
    (currentLeft, currentRight) => (
      currentLeft.key === currentRight.key
      && currentLeft.kind === currentRight.kind
      && currentLeft.edgeId === currentRight.edgeId
      && currentLeft.active === currentRight.active
      && currentLeft.deletable === currentRight.deletable
      && geometryApi.equal.point(currentLeft.point, currentRight.point)
      && currentLeft.pick.kind === currentRight.pick.kind
      && (
        currentLeft.pick.kind !== 'anchor'
          ? (
              currentRight.pick.kind === 'segment'
              && currentLeft.pick.insertIndex === currentRight.pick.insertIndex
              && currentLeft.pick.segmentIndex === currentRight.pick.segmentIndex
              && currentLeft.pick.axis === currentRight.pick.axis
            )
          : (
              currentRight.pick.kind === 'anchor'
              && currentLeft.pick.index === currentRight.pick.index
            )
      )
    )
  )
)

const isEdgeInteractionStateEqual = (
  left: EdgeInteractionState,
  right: EdgeInteractionState
) => (
  left.hovered === right.hovered
  && left.focused === right.focused
  && left.editing === right.editing
  && equal.sameOrder(left.selected, right.selected, (currentLeft, currentRight) => currentLeft === currentRight)
)

const readHoveredEdgeId = (
  hover: ReturnType<HoverStore['get']>
) => hover.target?.kind === 'edge'
  ? hover.target.edgeId
  : undefined

const readEditingEdgeId = (
  edit: EditSession | undefined
) => edit?.kind === 'edge-label'
  ? edit.edgeId
  : undefined

const readOverlayPreviewSnap = (
  guide: EdgeGuide
) => {
  const connect = guide.connect
  if (
    !connect
    || (
      connect.resolution.mode !== 'outline'
      && connect.resolution.mode !== 'handle'
    )
  ) {
    return undefined
  }

  return connect.resolution.pointWorld
}

const readSelectedEdgeChrome = (input: {
  selection: SelectionTarget
  detail: GraphEdgeRead['detail']
  capability: GraphEdgeRead['capability']
  edit: EditSession | undefined
  tool: Tool
  interaction: EditorInteractionState
}): SelectedEdgeChrome | undefined => {
  const selectedEdgeId = readSelectedEdgeId(input.selection)
  if (!selectedEdgeId) {
    return undefined
  }

  const current = store.read(input.detail, selectedEdgeId)
  const currentEnds = current?.route.ends
  if (!current || !currentEnds) {
    return undefined
  }

  const currentCapability = input.capability(current.edge)
  const editingThisSelectedEdge =
    input.edit?.kind === 'edge-label'
    && input.edit.edgeId === selectedEdgeId

  return {
    edgeId: selectedEdgeId,
    ends: currentEnds,
    canReconnectSource: currentCapability.reconnectSource,
    canReconnectTarget: currentCapability.reconnectTarget,
    canEditRoute: currentCapability.editRoute,
    showEditHandles:
      input.tool.type === 'select'
      && input.interaction.chrome
      && !input.interaction.editingEdge
      && !editingThisSelectedEdge,
    routePoints: readSelectedEdgeRoutePoints({
      edgeId: selectedEdgeId,
      edge: current.edge,
      handles: current.route.handles,
      activeRouteIndex: current.activeRouteIndex
    })
  }
}

export const createEdgeRenderRuntime = (input: {
  edge: Pick<
    GraphEdgeRead,
    'ids'
    | 'view'
    | 'detail'
    | 'model'
    | 'capability'
  >
  selection: store.ReadStore<SelectionTarget>
  edit: store.ReadStore<EditSession>
  tool: store.ReadStore<Tool>
  interaction: store.ReadStore<EditorInteractionState>
  hover: Pick<HoverStore, 'get' | 'subscribe'>
  edgeGuide: store.ReadStore<EdgeGuide>
}): {
  render: EdgeRenderRuntime
  interaction: EdgeInteractionRead
} => {
  const hoverStore: store.ReadStore<ReturnType<HoverStore['get']>> = {
    get: () => input.hover.get(),
    subscribe: (listener) => input.hover.subscribe(listener)
  }

  const interaction = store.createDerivedStore<EdgeInteractionState>({
    get: () => {
      const selection = store.read(input.selection)
      const edit = store.read(input.edit)
      const hover = store.read(hoverStore)

      return {
        hovered: readHoveredEdgeId(hover),
        focused: undefined,
        selected: selection.edgeIds,
        editing: readEditingEdgeId(edit)
      }
    },
    isEqual: isEdgeInteractionStateEqual
  })

  const staticModel = store.createDerivedStore<EdgeStaticRenderModel>({
    get: () => {
      const buckets = new Map<string, {
        style: EdgeRenderStyle
        paths: {
          id: EdgeId
          svgPath: string
        }[]
      }>()

      input.edge.ids().forEach((edgeId) => {
        const current = store.read(input.edge.view, edgeId)
        const svgPath = current?.path.svgPath
        if (!current || !svgPath) {
          return
        }

        const style = readRenderStyle(current.edge)
        const bucketId = toBucketId(style)
        let bucket = buckets.get(bucketId)
        if (!bucket) {
          bucket = {
            style,
            paths: []
          }
          buckets.set(bucketId, bucket)
        }

        bucket.paths.push({
          id: edgeId,
          svgPath
        })
      })

      return {
        buckets: [...buckets.entries()].map(([id, bucket]) => ({
          id,
          style: bucket.style,
          paths: bucket.paths
        }))
      }
    },
    isEqual: isStaticRenderModelEqual
  })

  const activeModel = store.createDerivedStore<EdgeActiveRenderModel>({
    get: () => {
      const currentInteraction = store.read(interaction)
      const activeIds = new Set<EdgeId>([
        ...currentInteraction.selected,
        ...(currentInteraction.hovered ? [currentInteraction.hovered] : []),
        ...(currentInteraction.editing ? [currentInteraction.editing] : [])
      ])
      const edges: EdgeActiveRenderItem[] = []

      input.edge.ids().forEach((edgeId) => {
        if (!activeIds.has(edgeId)) {
          return
        }

        const current = store.read(input.edge.view, edgeId)
        const svgPath = current?.path.svgPath
        if (!current || !svgPath) {
          return
        }

        edges.push({
          id: edgeId,
          svgPath,
          box: current.box
            ? {
                x: current.box.rect.x,
                y: current.box.rect.y,
                width: current.box.rect.width,
                height: current.box.rect.height,
                pad: current.box.pad
              }
            : undefined,
          style: readRenderStyle(current.edge),
          state: {
            hovered: currentInteraction.hovered === edgeId,
            focused: false,
            selected: currentInteraction.selected.includes(edgeId),
            editing: currentInteraction.editing === edgeId
          }
        })
      })

      return {
        edges
      }
    },
    isEqual: isActiveRenderModelEqual
  })

  const labelModel = store.createDerivedStore<EdgeLabelRenderModel>({
    get: () => {
      const labels: EdgeLabelRenderItem[] = []

      input.edge.ids().forEach((edgeId) => {
        const current = store.read(input.edge.view, edgeId)
        if (!current || current.labels.length === 0) {
          return
        }

        current.labels.forEach((label) => {
          labels.push({
            edgeId,
            labelId: label.id,
            point: label.point,
            angle: label.angle,
            text: label.text,
            displayText: label.displayText,
            editing: label.editing,
            selected: current.selected,
            style: label.style,
            maskRect: label.maskRect,
            caret: label.caret
          })
        })
      })

      return {
        labels
      }
    },
    isEqual: isLabelRenderModelEqual
  })

  const overlayModel = store.createDerivedStore<EdgeOverlayRenderModel>({
    get: () => {
      const currentGuide = store.read(input.edgeGuide)
      const currentSelectedChrome = readSelectedEdgeChrome({
        selection: store.read(input.selection),
        detail: input.edge.detail,
        capability: input.edge.capability,
        edit: store.read(input.edit),
        tool: store.read(input.tool),
        interaction: store.read(input.interaction)
      })

      return {
        previewPath: currentGuide.path,
        snapPoint: readOverlayPreviewSnap(currentGuide),
        endpointHandles:
          currentSelectedChrome?.showEditHandles
          && (currentSelectedChrome.canReconnectSource || currentSelectedChrome.canReconnectTarget)
            ? [
                ...(currentSelectedChrome.canReconnectSource
                  ? [{
                      edgeId: currentSelectedChrome.edgeId,
                      end: 'source' as const,
                      point: currentSelectedChrome.ends.source.point
                    }]
                  : EMPTY_ENDPOINT_HANDLES),
                ...(currentSelectedChrome.canReconnectTarget
                  ? [{
                      edgeId: currentSelectedChrome.edgeId,
                      end: 'target' as const,
                      point: currentSelectedChrome.ends.target.point
                    }]
                  : EMPTY_ENDPOINT_HANDLES)
              ]
            : EMPTY_ENDPOINT_HANDLES,
        routePoints:
          currentSelectedChrome?.showEditHandles
          && currentSelectedChrome.canEditRoute
          && currentSelectedChrome.routePoints.length > 0
            ? currentSelectedChrome.routePoints
            : EMPTY_ROUTE_POINTS
      }
    },
    isEqual: isOverlayRenderModelEqual
  })

  return {
    render: {
      static: staticModel,
      active: activeModel,
      labels: labelModel,
      overlay: overlayModel
    },
    interaction: {
      get: () => store.read(interaction),
      subscribe: (listener) => interaction.subscribe(listener)
    }
  }
}
