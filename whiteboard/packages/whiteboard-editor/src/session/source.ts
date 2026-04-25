import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { store } from '@shared/core'
import type { HistoryApi } from '@whiteboard/history'
import type { DocumentRead } from '@whiteboard/editor/document/read'
import { createEditorStore } from '@whiteboard/editor/editor/store'
import {
  isMindmapChromeEqual,
  readAddChildTargets,
  readMindmapNavigateTarget
} from '@whiteboard/editor/read/mindmap'
import {
  readEdgeScope,
  readNodeScope,
  readSelectionEdgeStats,
  readSelectionNodeStats,
  resolveSelectionOverlay,
  resolveSelectionToolbar
} from '@whiteboard/editor/read/panel'
import type { GraphRead } from '@whiteboard/editor/read/graph'
import {
  isSelectedEdgeChromeEqual,
  readSelectedEdgeId,
  readSelectedEdgeRoutePoints
} from '@whiteboard/editor/read/edgeShared'
import {
  createSessionRead,
  type SessionRead
} from '@whiteboard/editor/session/read'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorStore } from '@whiteboard/editor/types/editor'
import type {
  EditorChromePresentation,
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
  graph: Pick<GraphRead, 'node'>
  nodeId: string
}) => Boolean(
  store.read(graph.node.graph, nodeId)?.base.node.locked
)

const readNodeRect = ({
  graph,
  nodeId
}: {
  graph: Pick<GraphRead, 'node'>
  nodeId: string
}) => store.read(graph.node.graph, nodeId)?.geometry.rect

export const createEditorRead = (
  {
    document,
    graph,
    session,
    store: providedStore,
    history,
    nodeType,
    defaults
  }: {
    document: Pick<DocumentRead, 'document'>
    graph: Pick<GraphRead, 'snapshot' | 'items' | 'spatial' | 'node' | 'edge' | 'selection' | 'mindmap' | 'group' | 'chrome'>
    session: Pick<EditorSession, 'state' | 'interaction' | 'viewport' | 'preview'>
    store?: EditorStore
    history: HistoryApi
    nodeType: NodeTypeSupport
    defaults: EditorDefaults['selection']
  }
): EditorRead => {
  const state = providedStore ?? createEditorStore(session)
  const sessionRead = createSessionRead(session)
  const visibleQueryCache = {
    revision: -1,
    rect: undefined as
      | {
          x: number
          y: number
          width: number
          height: number
        }
      | undefined,
    kinds: '' as string,
    result: [] as ReturnType<EditorRead['query']['rect']>
  }
  const selectionSummary = graph.selection.summary
  const selectionMembers = graph.selection.members
  const selectionAffordance = graph.selection.affordance
  const selectionNodeSelected = graph.selection.node.selected

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

  const chromeMarquee = store.createDerivedStore<EditorChromePresentation['marquee']>({
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

  const chromeDraw = store.createDerivedStore<EditorChromePresentation['draw']>({
    get: () => store.read(graph.chrome).preview.draw,
    isEqual: isChromeDrawEqual
  })

  const chromeSnap = store.createDerivedStore<EditorChromePresentation['snap']>({
    get: () => store.read(graph.chrome).preview.guides
  })

  const chrome = store.createStructStore<EditorChromePresentation>({
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

  const panel = store.createStructStore<EditorPanelPresentation>({
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

  const nodeCapability: EditorRead['node']['capability'] = store.createKeyedDerivedStore({
    get: (nodeId: string) => {
      const current = store.read(graph.node.graph, nodeId)
      return current
        ? graph.node.capability(current.base.node)
        : undefined
    },
    isEqual: (left, right) => (
      left === right
      || (
        left !== undefined
        && right !== undefined
        && left.role === right.role
        && left.connect === right.connect
        && left.enter === right.enter
        && left.resize === right.resize
        && left.rotate === right.rotate
      )
    )
  })

  const selectedEdgeChrome: EditorRead['edge']['selectedChrome'] = store.createDerivedStore({
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

  const mindmapChrome: EditorRead['mindmap']['chrome'] = store.createKeyedDerivedStore<string, ReturnType<EditorRead['mindmap']['chrome']['get']>>({
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
        })
      }
    },
    isEqual: isMindmapChromeEqual
  })

  const query: EditorRead['query'] = {
    rect: (rect, options) => graph.spatial.rect(rect, options),
    visible: (options) => {
      const rect = sessionRead.viewport.worldRect()
      const snapshot = store.read(graph.snapshot)
      const kinds = options?.kinds?.join('|') ?? '*'

      if (
        visibleQueryCache.revision === snapshot.revision
        && visibleQueryCache.kinds === kinds
        && visibleQueryCache.rect?.x === rect.x
        && visibleQueryCache.rect?.y === rect.y
        && visibleQueryCache.rect?.width === rect.width
        && visibleQueryCache.rect?.height === rect.height
      ) {
        return visibleQueryCache.result
      }

      const result = graph.spatial.rect(rect, options)
      visibleQueryCache.revision = snapshot.revision
      visibleQueryCache.rect = rect
      visibleQueryCache.kinds = kinds
      visibleQueryCache.result = result
      return result
    }
  }

  return {
    document: {
      get: document.document.get,
      background: document.document.background,
      bounds: document.document.bounds
    },
    group: {
      exact: graph.group.exact
    },
    history,
    mindmap: {
      view: graph.mindmap.view,
      chrome: mindmapChrome,
      navigate: (input) => {
        const currentStructure = graph.mindmap.structure(input.id)
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
      view: graph.node.view,
      capability: nodeCapability
    },
    edge: {
      view: graph.edge.view,
      selectedChrome: selectedEdgeChrome
    },
    items: graph.items,
    query,
    selection: {
      view: graph.selection.view,
      node: {
        selected: selectionNodeSelected,
        stats: selectionNodeStats,
        scope: selectionNodeScope
      }
    },
    tool: sessionRead.tool,
    viewport: sessionRead.viewport,
    chrome,
    panel
  }
}
