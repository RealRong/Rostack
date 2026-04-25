import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { store } from '@shared/core'
import type { HistoryApi } from '@whiteboard/history'
import { createSessionState } from '@whiteboard/editor/session/state'
import {
  isMindmapChromeEqual,
  readAddChildTargets,
  type MindmapChrome
} from '@whiteboard/editor/scene/mindmap'
import {
  readEdgeScope,
  readNodeScope,
  readSelectionEdgeStats,
  readSelectionNodeStats,
  resolveSelectionOverlay,
  resolveSelectionToolbar
} from '@whiteboard/editor/session/panel'
import type { EditorSceneRuntime } from '@whiteboard/editor/scene/source'
import {
  isSelectedEdgeChromeEqual,
  readSelectedEdgeId,
  readSelectedEdgeRoutePoints
} from '@whiteboard/editor/session/edge'
import {
  createSessionRead,
  type SessionRead
} from '@whiteboard/editor/session/read'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type {
  EditorChromeSource,
  EditorChromePresentation,
  EditorPanelSource,
  EditorPanelPresentation,
  EditorSessionSource,
  EditorSessionState
} from '@whiteboard/editor/types/editor'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'

const isChromeMarqueeEqual = (
  left: ReturnType<EditorChromeSource['marquee']['get']>,
  right: ReturnType<EditorChromeSource['marquee']['get']>
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
  left: ReturnType<EditorChromeSource['draw']['get']>,
  right: ReturnType<EditorChromeSource['draw']['get']>
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
  graph,
  nodeId
}: {
  graph: Pick<EditorSceneRuntime, 'node'>
  nodeId: string
}) => Boolean(
  store.read(graph.node.graph, nodeId)?.base.node.locked
)

const readNodeRect = ({
  graph,
  nodeId
}: {
  graph: Pick<EditorSceneRuntime, 'node'>
  nodeId: string
}) => store.read(graph.node.graph, nodeId)?.geometry.rect

export const createSessionSource = (
  {
    graph,
    session,
    state: providedState,
    history,
    nodeType,
    defaults
  }: {
    graph: Pick<EditorSceneRuntime, 'node' | 'edge' | 'selection' | 'mindmap' | 'chrome'>
    session: Pick<EditorSession, 'state' | 'interaction' | 'viewport' | 'preview'>
    state?: EditorSessionState
    history: HistoryApi
    nodeType: NodeTypeSupport
    defaults: EditorDefaults['selection']
  }
): EditorSessionSource => {
  const state = providedState ?? createSessionState(session)
  const sessionRead = createSessionRead(session)
  const selectionSummary = graph.selection.summary
  const selectionMembers = graph.selection.members
  const selectionAffordance = graph.selection.affordance
  const selectionNodeSelected = graph.selection.node.selected

  const selectionNodeStats: EditorSessionSource['selection']['node']['stats'] = store.createDerivedStore({
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

  const selectionNodeScope: EditorSessionSource['selection']['node']['scope'] = store.createDerivedStore({
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
        readMindmapStructure: (id) => graph.mindmap.structure(id),
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
        readMindmapStructure: (id) => graph.mindmap.structure(id),
        tool: store.read(state.tool),
        edit: store.read(state.edit),
        interactionChrome: interaction.chrome,
        editingEdge: interaction.editingEdge,
        defaults
      })
    }
  })

  const chromeMarquee: EditorChromeSource['marquee'] = store.createDerivedStore({
    get: () => {
      const marquee = store.read(graph.chrome).preview.marquee

      return marquee
        ? {
            rect: projectWorldRect(sessionRead.viewport, marquee.worldRect),
            match: marquee.match
          }
        : undefined
    },
    isEqual: isChromeMarqueeEqual
  })

  const chromeDraw: EditorChromeSource['draw'] = store.createDerivedStore({
    get: () => {
      const preview = store.read(graph.chrome).preview.draw
      return preview
        ? {
            kind: preview.kind,
            style: preview.style,
            points: preview.points
          }
        : null
    },
    isEqual: isChromeDrawEqual
  })

  const chromeSnap: EditorChromeSource['snap'] = store.createDerivedStore({
    get: () => store.read(graph.chrome).preview.guides
  })

  const selectedEdgeChrome: EditorSessionSource['selection']['edge']['chrome'] = store.createDerivedStore({
    get: () => {
      const selectedEdgeId = readSelectedEdgeId(store.read(state.selection))
      if (!selectedEdgeId) {
        return undefined
      }

      const current = store.read(graph.edge.graph, selectedEdgeId)
      const currentUi = store.read(graph.edge.ui, selectedEdgeId)
      const currentEnds = current?.route.ends
      if (!current || !currentEnds) {
        return undefined
      }

      const currentCapability = graph.edge.capability(current.base.edge)
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
          activeRouteIndex: currentUi?.activeRouteIndex
        })
      }
    },
    isEqual: isSelectedEdgeChromeEqual
  })

  const mindmapChrome: EditorSessionSource['mindmap']['chrome'] = store.createKeyedDerivedStore<string, ReturnType<EditorSessionSource['mindmap']['chrome']['get']>>({
    get: (mindmapId: string) => {
      const structure = graph.mindmap.structure(mindmapId)
      if (!structure) {
        return undefined
      }

      return {
        addChildTargets: readAddChildTargets({
          structure,
          selection: store.read(state.selection),
          edit: store.read(state.edit),
          readNodeLocked: (nodeId) => readNodeLocked({
            graph,
            nodeId
          }),
          readNodeRect: (nodeId) => readNodeRect({
            graph,
            nodeId
          })
        }) as MindmapChrome['addChildTargets']
      }
    },
    isEqual: isMindmapChromeEqual
  })

  const viewportZoom = store.createDerivedStore<number>({
    get: () => store.read(state.viewport).zoom,
    isEqual: (left, right) => left === right
  })

  const viewportCenter = store.createDerivedStore({
    get: () => store.read(state.viewport).center,
    isEqual: geometryApi.equal.point
  })

  const chromeView = store.createStructStore<EditorChromePresentation>({
    fields: {
      marquee: {
        get: () => store.read(chromeMarquee)
      },
      draw: {
        get: () => store.read(chromeDraw)
      },
      edgeGuide: {
        get: () => store.read(sessionRead.chrome.edgeGuide)
      },
      snap: {
        get: () => store.read(chromeSnap)
      },
      selection: {
        get: () => store.read(selectionOverlay)
      }
    }
  })

  const chrome: EditorChromeSource = Object.assign(chromeView, {
    marquee: chromeMarquee,
    draw: chromeDraw,
    edgeGuide: sessionRead.chrome.edgeGuide,
    snap: chromeSnap,
    selection: selectionOverlay
  })

  const panelView = store.createStructStore<EditorPanelPresentation>({
    fields: {
      selectionToolbar: {
        get: () => store.read(selectionToolbar)
      },
      history: {
        get: () => store.read(history)
      },
      draw: {
        get: () => store.read(state.draw)
      }
    }
  })

  const panel: EditorPanelSource = Object.assign(panelView, {
    selectionToolbar,
    history,
    draw: state.draw
  })

  const selectionSource: EditorSessionSource['selection'] = Object.assign(state.selection, {
    target: state.selection,
    view: graph.selection.view,
    node: {
      selected: selectionNodeSelected,
      stats: selectionNodeStats,
      scope: selectionNodeScope
    },
    edge: {
      chrome: selectedEdgeChrome
    }
  })

  const toolSource: EditorSessionSource['tool'] = {
    get: session.state.tool.get,
    subscribe: session.state.tool.subscribe,
    type: sessionRead.tool.type,
    value: sessionRead.tool.value,
    is: sessionRead.tool.is
  }

  return {
    selection: selectionSource,
    tool: toolSource,
    draw: state.draw,
    edit: state.edit,
    interaction: state.interaction,
    viewport: {
      ...sessionRead.viewport,
      value: state.viewport,
      zoom: viewportZoom,
      center: viewportCenter
    },
    chrome,
    panel,
    history,
    mindmap: {
      chrome: mindmapChrome
    }
  }
}
