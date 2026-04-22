import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { store } from '@shared/core'
import type { HistoryApi } from '@whiteboard/history'
import type { DocumentRead } from '@whiteboard/editor/document/read'
import {
  isMindmapChromeEqual,
  isMindmapSceneEqual,
  readAddChildTargets,
  readMindmapNavigateTarget,
  toMindmapScene
} from '@whiteboard/editor/editor/mindmap'
import {
  readEdgeScope,
  readNodeScope,
  readSelectionEdgeStats,
  readSelectionNodeStats,
  resolveSelectionOverlay,
  resolveSelectionToolbar
} from '@whiteboard/editor/editor/selection'
import type { EditorPublishedSources } from '@whiteboard/editor/publish/sources'
import type { ProjectionRead } from '@whiteboard/editor/projection/read'
import {
  isSelectedEdgeChromeEqual,
  readSelectedEdgeId,
  readSelectedEdgeRoutePoints,
  resolveEdgeCapability
} from '@whiteboard/editor/projection/edgeShared'
import type { SessionRead } from '@whiteboard/editor/session/read'
import type { EditorStore } from '@whiteboard/editor/types/editor'
import type {
  EditorChromePresentation,
  EditorEdgeRender,
  EditorNodeRender,
  EditorPanelPresentation,
  EditorRead
} from '@whiteboard/editor/types/editor'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'

const isChromeMarqueeEqual = (
  left: EditorChromePresentation['marquee'],
  right: EditorChromePresentation['marquee']
) => (
  left === right
  || (
    left?.match === right?.match
    && left?.rect.x === right?.rect.x
    && left?.rect.y === right?.rect.y
    && left?.rect.width === right?.rect.width
    && left?.rect.height === right?.rect.height
  )
)

const isChromeDrawEqual = (
  left: EditorChromePresentation['draw'],
  right: EditorChromePresentation['draw']
) => (
  left === right
  || (
    left !== null
    && right !== null
    && left.kind === right.kind
    && left.style.kind === right.style.kind
    && left.style.color === right.style.color
    && left.style.width === right.style.width
    && left.style.opacity === right.style.opacity
    && left.points.length === right.points.length
    && left.points.every((point, index) => (
      point.x === right.points[index]?.x
      && point.y === right.points[index]?.y
    ))
  )
)

const isNodeRenderEqual = (
  left: EditorNodeRender | undefined,
  right: EditorNodeRender | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.nodeId === right.nodeId
    && left.node === right.node
    && left.rect.x === right.rect.x
    && left.rect.y === right.rect.y
    && left.rect.width === right.rect.width
    && left.rect.height === right.rect.height
    && left.bounds.x === right.bounds.x
    && left.bounds.y === right.bounds.y
    && left.bounds.width === right.bounds.width
    && left.bounds.height === right.bounds.height
    && left.rotation === right.rotation
    && left.hovered === right.hovered
    && left.hidden === right.hidden
    && left.resizing === right.resizing
    && left.patched === right.patched
    && left.selected === right.selected
    && left.canConnect === right.canConnect
    && left.canResize === right.canResize
    && left.canRotate === right.canRotate
    && left.edit?.field === right.edit?.field
    && left.edit?.caret.kind === right.edit?.caret.kind
    && (
      left.edit?.caret.kind !== 'point'
      || (
        right.edit?.caret.kind === 'point'
        && left.edit.caret.client.x === right.edit.caret.client.x
        && left.edit.caret.client.y === right.edit.caret.client.y
      )
    )
  )
)

const isEdgeRenderEqual = (
  left: EditorEdgeRender | undefined,
  right: EditorEdgeRender | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.edgeId === right.edgeId
    && left.edge === right.edge
    && left.patched === right.patched
    && left.activeRouteIndex === right.activeRouteIndex
    && left.selected === right.selected
    && left.box.pad === right.box.pad
    && left.box.rect.x === right.box.rect.x
    && left.box.rect.y === right.box.rect.y
    && left.box.rect.width === right.box.rect.width
    && left.box.rect.height === right.box.rect.height
    && left.path.svgPath === right.path.svgPath
    && left.path.points.length === right.path.points.length
    && left.path.points.every((point, index) => (
      point.x === right.path.points[index]?.x
      && point.y === right.path.points[index]?.y
    ))
    && left.labels.length === right.labels.length
    && left.labels.every((label, index) => {
      const next = right.labels[index]
      return next !== undefined
        && label.id === next.id
        && label.text === next.text
        && label.displayText === next.displayText
        && label.style === next.style
        && label.editable === next.editable
        && label.caret?.kind === next.caret?.kind
        && (
          label.caret?.kind !== 'point'
          || (
            next.caret?.kind === 'point'
            && label.caret.client.x === next.caret.client.x
            && label.caret.client.y === next.caret.client.y
          )
        )
        && label.point.x === next.point.x
        && label.point.y === next.point.y
        && label.angle === next.angle
        && label.size.width === next.size.width
        && label.size.height === next.size.height
        && label.maskRect.x === next.maskRect.x
        && label.maskRect.y === next.maskRect.y
        && label.maskRect.width === next.maskRect.width
        && label.maskRect.height === next.maskRect.height
        && label.maskRect.radius === next.maskRect.radius
        && label.maskRect.angle === next.maskRect.angle
        && label.maskRect.center.x === next.maskRect.center.x
        && label.maskRect.center.y === next.maskRect.center.y
    })
  )
)

const projectWorldRect = (
  viewport: SessionRead['viewport'],
  worldRect: {
    x: number
    y: number
    width: number
    height: number
  }
) => {
  const topLeft = viewport.worldToScreen({
    x: worldRect.x,
    y: worldRect.y
  })
  const bottomRight = viewport.worldToScreen({
    x: worldRect.x + worldRect.width,
    y: worldRect.y + worldRect.height
  })

  return geometryApi.rect.fromPoints(topLeft, bottomRight)
}

const readNodeLocked = ({
  projection,
  document,
  nodeId
}: {
  projection: Pick<ProjectionRead, 'node'>
  document: Pick<DocumentRead, 'node'>
  nodeId: string
}) => (
  store.read(projection.node.projected, nodeId)?.node.locked
  ?? store.read(document.node.committed, nodeId)?.node.locked
  ?? false
)

const readNodeRect = ({
  projection,
  document,
  nodeId
}: {
  projection: Pick<ProjectionRead, 'node'>
  document: Pick<DocumentRead, 'node'>
  nodeId: string
}) => store.read(projection.node.projected, nodeId)?.rect
  ?? store.read(document.node.committed, nodeId)?.rect

export const createEditorRead = (
  {
    document,
    projection,
    sessionRead,
    published,
    store: state,
    history,
    nodeType,
    defaults
  }: {
    document: Pick<DocumentRead, 'document' | 'group' | 'mindmap' | 'node'>
    projection: Pick<ProjectionRead, 'scene' | 'node' | 'edge' | 'selection' | 'mindmap'>
    sessionRead: SessionRead
    published: Pick<EditorPublishedSources, 'chrome' | 'node' | 'edge'>
    store: EditorStore
    history: HistoryApi
    nodeType: NodeTypeSupport
    defaults: EditorDefaults['selection']
  }
): EditorRead => {
  const selectionSummary = projection.selection.summary
  const selectionMembers = projection.selection.members
  const selectionAffordance = projection.selection.affordance
  const selectionNodeSelected = projection.selection.node.selected

  const selectionNodeStats: EditorRead['selection']['node']['stats'] = store.createDerivedStore({
    get: () => readSelectionNodeStats({
      summary: store.read(selectionSummary),
      nodeType
    })
  })

  const selectionEdgeStats = store.createDerivedStore({
    get: () => readSelectionEdgeStats(
      store.read(selectionSummary)
    )
  })

  const selectionNodeScope: EditorRead['selection']['node']['scope'] = store.createDerivedStore({
    get: () => {
      const currentMembers = store.read(selectionMembers)
      const currentNodeStats = store.read(selectionNodeStats)
      if (currentNodeStats.count === 0) {
        return undefined
      }

      return readNodeScope({
        nodes: currentMembers.nodes,
        nodeIds: currentNodeStats.ids,
        primaryNode: currentMembers.primaryNode,
        nodeType,
        nodeStats: currentNodeStats,
        readMindmapStructure: (id) => store.read(document.mindmap.structure, id),
        defaults
      })
    }
  })

  const selectionEdgeScope = store.createDerivedStore({
    get: () => {
      const currentMembers = store.read(selectionMembers)
      const currentEdgeStats = store.read(selectionEdgeStats)
      if (currentEdgeStats.count === 0) {
        return undefined
      }

      return readEdgeScope({
        edges: currentMembers.edges,
        edgeIds: currentEdgeStats.ids,
        primaryEdge: currentMembers.primaryEdge,
        defaults
      })
    }
  })

  const selectionOverlay = store.createDerivedStore({
    get: () => {
      const interaction = store.read(state.interaction)
      return resolveSelectionOverlay({
        summary: store.read(selectionSummary),
        affordance: store.read(selectionAffordance),
        tool: store.read(state.tool),
        edit: store.read(state.edit),
        interactionChrome: interaction.chrome,
        transforming: interaction.transforming
      })
    }
  })

  const selectionToolbar = store.createDerivedStore({
    get: () => {
      const interaction = store.read(state.interaction)
      return resolveSelectionToolbar({
        members: store.read(selectionMembers),
        summary: store.read(selectionSummary),
        affordance: store.read(selectionAffordance),
        nodeStats: store.read(selectionNodeStats),
        edgeStats: store.read(selectionEdgeStats),
        nodeScope: store.read(selectionNodeScope),
        edgeScope: store.read(selectionEdgeScope),
        nodeType,
        readMindmapStructure: (id) => store.read(document.mindmap.structure, id),
        tool: store.read(state.tool),
        edit: store.read(state.edit),
        interactionChrome: interaction.chrome,
        editingEdge: interaction.editingEdge,
        defaults
      })
    }
  })

  const chrome = store.createDerivedStore<EditorChromePresentation>({
    get: () => {
      const current = store.read(published.chrome)
      const marquee = current.preview.marquee

      return {
        marquee: marquee
          ? {
              rect: projectWorldRect(sessionRead.viewport, marquee.worldRect),
              match: marquee.match
            }
          : undefined,
        draw: current.preview.draw,
        edgeGuide: store.read(sessionRead.chrome.edgeGuide),
        snap: current.preview.guides,
        selection: store.read(selectionOverlay)
      }
    },
    isEqual: (left, right) => (
      isChromeMarqueeEqual(left.marquee, right.marquee)
      && isChromeDrawEqual(left.draw, right.draw)
      && left.edgeGuide === right.edgeGuide
      && left.snap === right.snap
      && left.selection === right.selection
    )
  })

  const panel = store.createDerivedStore<EditorPanelPresentation>({
    get: () => ({
      selectionToolbar: store.read(selectionToolbar),
      history: store.read(history),
      draw: store.read(state.draw)
    }),
    isEqual: (left, right) => (
      left.selectionToolbar === right.selectionToolbar
      && left.history === right.history
      && left.draw === right.draw
    )
  })

  const nodeRender: EditorRead['node']['render'] = store.createKeyedDerivedStore({
    get: (nodeId: string) => {
      const current = store.read(published.node, nodeId)
      if (!current) {
        return undefined
      }

      const capability = projection.node.capability(current.base.node)

      return {
        nodeId: current.base.node.id,
        node: current.base.node,
        rect: current.layout.rect,
        bounds: current.layout.bounds,
        rotation: current.layout.rotation,
        hovered: current.render.hovered,
        hidden: current.render.hidden,
        resizing: current.render.resizing,
        patched: current.render.patched,
        selected: current.render.selected,
        edit: current.render.edit,
        canConnect: capability.connect,
        canResize: capability.resize,
        canRotate: capability.rotate
      }
    },
    isEqual: isNodeRenderEqual
  })

  const edgeRender: EditorRead['edge']['render'] = store.createKeyedDerivedStore({
    get: (edgeId: string) => {
      const current = store.read(published.edge, edgeId)
      const box = current?.render.box
      const svgPath = current?.route.svgPath
      if (!current || !box || !svgPath) {
        return undefined
      }

      return {
        edgeId: current.base.edge.id,
        edge: current.base.edge,
        patched: current.render.patched,
        activeRouteIndex: current.render.activeRouteIndex,
        selected: current.render.selected,
        box,
        path: {
          svgPath,
          points: current.route.points
        },
        labels: current.route.labels.map((label) => ({
          id: label.labelId,
          text: label.text,
          displayText: label.displayText,
          style: label.style,
          editable: label.editable,
          caret: label.caret,
          point: label.point,
          angle: label.angle,
          size: label.size,
          maskRect: label.maskRect
        })) as EditorEdgeRender['labels']
      }
    },
    isEqual: isEdgeRenderEqual
  })

  const selectedEdgeChrome: EditorRead['edge']['selectedChrome'] = store.createDerivedStore({
    get: () => {
      const selectedEdgeId = readSelectedEdgeId(store.read(state.selection))
      if (!selectedEdgeId) {
        return undefined
      }

      const current = store.read(published.edge, selectedEdgeId)
      const currentEnds = current?.route.ends
      if (!current || !currentEnds) {
        return undefined
      }

      const currentCapability = resolveEdgeCapability({
        edge: current.base.edge,
        readNodeLocked: (nodeId) => readNodeLocked({
          projection,
          document,
          nodeId
        })
      })
      const currentEdit = store.read(state.edit)
      const interaction = store.read(state.interaction)
      const editingThisSelectedEdge =
        currentEdit?.kind === 'edge-label'
        && currentEdit.edgeId === selectedEdgeId

      return {
        edgeId: selectedEdgeId,
        ends: currentEnds,
        canReconnectSource: currentCapability.reconnectSource,
        canReconnectTarget: currentCapability.reconnectTarget,
        canEditRoute: currentCapability.editRoute,
        showEditHandles:
          store.read(state.tool).type === 'select'
          && interaction.chrome
          && !interaction.editingEdge
          && !editingThisSelectedEdge,
        routePoints: readSelectedEdgeRoutePoints({
          edgeId: selectedEdgeId,
          edge: current.base.edge,
          handles: current.route.handles,
          activeRouteIndex: current.render.activeRouteIndex
        })
      }
    },
    isEqual: isSelectedEdgeChromeEqual
  })

  const mindmapScene: EditorRead['mindmap']['scene'] = store.createKeyedDerivedStore({
    get: (mindmapId: string) => {
      const structure = store.read(document.mindmap.structure, mindmapId)
      const current = store.read(projection.mindmap.layout, mindmapId)
      if (!structure || !current) {
        return undefined
      }

      return toMindmapScene(
        structure,
        current.computed.bbox,
        current.connectors
      )
    },
    isEqual: isMindmapSceneEqual
  })

  const mindmapChrome: EditorRead['mindmap']['chrome'] = store.createKeyedDerivedStore<string, ReturnType<EditorRead['mindmap']['chrome']['get']>>({
    get: (mindmapId: string) => {
      const structure = store.read(document.mindmap.structure, mindmapId)
      if (!structure) {
        return undefined
      }

      return {
        addChildTargets: readAddChildTargets({
          structure,
          selection: store.read(state.selection),
          edit: store.read(state.edit),
          readNodeLocked: (nodeId) => readNodeLocked({
            projection,
            document,
            nodeId
          }),
          readNodeRect: (nodeId) => readNodeRect({
            projection,
            document,
            nodeId
          })
        })
      }
    },
    isEqual: isMindmapChromeEqual
  })

  return {
    document: {
      get: document.document.get,
      background: document.document.background,
      bounds: document.document.bounds
    },
    group: {
      exactIds: document.group.exactIds
    },
    history,
    mindmap: {
      scene: mindmapScene,
      chrome: mindmapChrome,
      navigate: (input) => {
        const currentStructure = store.read(document.mindmap.structure, input.id)
        if (!currentStructure) {
          return undefined
        }

        return readMindmapNavigateTarget({
          structure: currentStructure,
          fromNodeId: input.fromNodeId,
          direction: input.direction
        })
      }
    },
    node: {
      render: nodeRender
    },
    edge: {
      render: edgeRender,
      selectedChrome: selectedEdgeChrome
    },
    scene: {
      list: projection.scene.list
    },
    selection: {
      node: {
        selected: selectionNodeSelected,
        stats: selectionNodeStats,
        scope: selectionNodeScope
      },
      summary: selectionSummary
    },
    tool: sessionRead.tool,
    viewport: sessionRead.viewport,
    chrome,
    panel
  }
}
