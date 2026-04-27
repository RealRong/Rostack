import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { selection as selectionApi } from '@whiteboard/core/selection'
import { equal, store } from '@shared/core'
import type { HistoryPort } from '@shared/mutation'
import {
  readEdgeScope,
  readNodeScope,
  resolveSelectionOverlay,
  resolveSelectionToolbar
} from '@whiteboard/editor/editor/source/selection'
import type { EditorSceneRuntime } from '@whiteboard/editor/scene/view'
import {
  EMPTY_EDGE_GUIDE,
  isEdgeGuideEqual
} from '@whiteboard/editor/session/preview/edge'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type {
  EditorChromeSource,
  EditorChromePresentation,
  EditorInteractionState,
  EditorPanelSource,
  EditorPanelPresentation,
  EditorSessionSource,
  ToolRead
} from '@whiteboard/editor/types/editor'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type {
  EditorSelectionAffordanceView,
  EditorSelectionSummaryView,
  SelectionNodeStats as SelectionNodeStatsView
} from '@whiteboard/editor/types/selectionPresentation'
import { isEdgeInteractionMode } from '@whiteboard/editor/input/interaction/mode'
import type { IntentResult } from '@whiteboard/engine'

const EMPTY_SELECTION_HANDLES = [] as const

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

const isSelectionSummaryViewEqual = (
  left: EditorSelectionSummaryView,
  right: EditorSelectionSummaryView
) => (
  left.count === right.count
  && left.nodeCount === right.nodeCount
  && left.edgeCount === right.edgeCount
  && left.groupIds === right.groupIds
  && equal.sameOptionalRect(left.box, right.box)
)

const isSelectionHandleEqual = (
  left: NonNullable<EditorSelectionAffordanceView['handles']>[number],
  right: NonNullable<EditorSelectionAffordanceView['handles']>[number]
) => (
  left.id === right.id
  && left.visible === right.visible
  && left.enabled === right.enabled
  && left.family === right.family
  && left.cursor === right.cursor
)

const isSelectionAffordanceViewEqual = (
  left: EditorSelectionAffordanceView,
  right: EditorSelectionAffordanceView
) => (
  left.owner === right.owner
  && left.ownerNodeId === right.ownerNodeId
  && left.moveHit === right.moveHit
  && left.canMove === right.canMove
  && left.canResize === right.canResize
  && left.canRotate === right.canRotate
  && equal.sameOptionalRect(left.displayBox, right.displayBox)
  && equal.sameOrder(left.handles, right.handles, isSelectionHandleEqual)
)

const isSelectedEdgeChromeEqual = (
  left: ReturnType<EditorSessionSource['selection']['edge']['chrome']['get']>,
  right: ReturnType<EditorSessionSource['selection']['edge']['chrome']['get']>
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.edgeId === right.edgeId
    && left.canReconnectSource === right.canReconnectSource
    && left.canReconnectTarget === right.canReconnectTarget
    && left.canEditRoute === right.canEditRoute
    && left.showEditHandles === right.showEditHandles
    && edgeApi.equal.resolvedEnd(left.ends.source, right.ends.source)
    && edgeApi.equal.resolvedEnd(left.ends.target, right.ends.target)
    && equal.sameOrder(left.routePoints, right.routePoints, (a, b) => (
      a.key === b.key
      && a.kind === b.kind
      && a.edgeId === b.edgeId
      && a.active === b.active
      && a.deletable === b.deletable
      && geometryApi.equal.point(a.point, b.point)
      && a.pick.kind === b.pick.kind
      && (
        a.pick.kind === 'anchor'
          ? b.pick.kind === 'anchor'
            && a.pick.index === b.pick.index
          : b.pick.kind === 'segment'
            && a.pick.insertIndex === b.pick.insertIndex
            && a.pick.segmentIndex === b.pick.segmentIndex
            && a.pick.axis === b.pick.axis
      )
    ))
  )
)

const isMindmapChromeEqual = (
  left: ReturnType<EditorSessionSource['mindmap']['chrome']['get']>,
  right: ReturnType<EditorSessionSource['mindmap']['chrome']['get']>
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.addChildTargets.length === right.addChildTargets.length
    && left.addChildTargets.every((entry, index) => (
      entry.targetNodeId === right.addChildTargets[index]?.targetNodeId
      && entry.x === right.addChildTargets[index]?.x
      && entry.y === right.addChildTargets[index]?.y
      && entry.placement === right.addChildTargets[index]?.placement
    ))
  )
)

const toSelectionViewKind = (
  kind: ReturnType<EditorSessionSource['selection']['summary']['get']>['kind']
): 'none' | 'nodes' | 'edges' | 'mixed' => (
  kind === 'node'
    ? 'nodes'
    : kind === 'edge'
      ? 'edges'
      : kind
)

const readToolValue = (
  tool: ReturnType<EditorSession['state']['tool']['get']>
) => (
  'mode' in tool
    ? tool.mode
    : undefined
)

const isToolMatch = (
  tool: ReturnType<EditorSession['state']['tool']['get']>,
  type: ReturnType<EditorSession['state']['tool']['get']>['type'],
  value?: string
) => {
  if (tool.type !== type) {
    return false
  }

  if (value === undefined) {
    return true
  }

  return tool.type === 'draw'
    ? tool.mode === value
    : false
}

const createToolRead = (
  source: EditorSession['state']['tool']
): ToolRead => ({
  get: () => store.read(source),
  subscribe: source.subscribe,
  type: () => store.read(source).type,
  value: () => readToolValue(store.read(source)),
  is: (type, value) => isToolMatch(store.read(source), type, value)
})

export const createEditorSessionSource = (
  {
    graph,
    session,
    history,
    nodeType,
    defaults
  }: {
    graph: Pick<EditorSceneRuntime, 'query' | 'stores'>
    session: Pick<EditorSession, 'state' | 'interaction' | 'viewport'>
    history: HistoryPort<IntentResult>
    nodeType: NodeTypeSupport
    defaults: EditorDefaults['selection']
  }
): EditorSessionSource => {
  const interactionState = store.createDerivedStore<EditorInteractionState>({
    get: () => {
      const mode = store.read(session.interaction.read.mode)
      const busy = store.read(session.interaction.read.busy)
      const chrome = store.read(session.interaction.read.chrome)

      return {
        busy,
        chrome,
        transforming: mode === 'node-transform',
        drawing: mode === 'draw',
        panning: mode === 'viewport-pan',
        selecting:
          mode === 'press'
          || mode === 'marquee'
          || mode === 'node-drag'
          || mode === 'mindmap-drag'
          || mode === 'node-transform',
        editingEdge: isEdgeInteractionMode(mode),
        space: store.read(session.interaction.read.space)
      }
    },
    isEqual: (left, right) => (
      left.busy === right.busy
      && left.chrome === right.chrome
      && left.transforming === right.transforming
      && left.drawing === right.drawing
      && left.panning === right.panning
      && left.selecting === right.selecting
      && left.editingEdge === right.editingEdge
      && left.space === right.space
    )
  })
  const state = {
    tool: session.state.tool,
    draw: session.state.draw,
    edit: session.state.edit,
    selection: session.state.selection,
    viewport: session.viewport.read,
    interaction: interactionState
  }

  const selectionMembers = store.createDerivedStore({
    get: () => graph.query.selection.members(store.read(state.selection))
  })

  const selectionSummary = store.createDerivedStore({
    get: () => graph.query.selection.summary(store.read(state.selection)),
    isEqual: selectionApi.derive.isSummaryEqual
  })

  const selectionAffordance = store.createDerivedStore({
    get: () => graph.query.selection.affordance(store.read(state.selection)),
    isEqual: selectionApi.derive.isAffordanceEqual
  })

  const selectionViewSummary = store.createDerivedStore<EditorSelectionSummaryView>({
    get: () => {
      const current = store.read(selectionSummary)

      return {
        box: current.box,
        count: current.items.count,
        nodeCount: current.items.nodeCount,
        edgeCount: current.items.edgeCount,
        groupIds: current.target.groupIds
      }
    },
    isEqual: isSelectionSummaryViewEqual
  })

  const selectionViewAffordance = store.createDerivedStore<EditorSelectionAffordanceView>({
    get: () => {
      const current = store.read(selectionAffordance)

      return {
        owner: current.owner,
        ownerNodeId: current.ownerNodeId,
        displayBox: current.displayBox,
        moveHit: current.moveHit,
        canMove: current.canMove,
        canResize: current.canResize,
        canRotate: current.canRotate,
        handles: current.transformPlan?.handles ?? EMPTY_SELECTION_HANDLES
      }
    },
    isEqual: isSelectionAffordanceViewEqual
  })

  const selectionView = store.createStructStore({
    fields: {
      target: {
        get: () => store.read(state.selection),
        isEqual: selectionApi.target.equal
      },
      kind: {
        get: () => toSelectionViewKind(store.read(selectionSummary).kind)
      },
      summary: {
        get: () => store.read(selectionViewSummary)
      },
      affordance: {
        get: () => store.read(selectionViewAffordance)
      }
    }
  })

  const selectionNodeSelected: EditorSessionSource['selection']['node']['selected'] = store.createProjectedKeyedStore({
    source: state.selection,
    select: (target) => (
      target.nodeIds.length > 0
        ? new Map(target.nodeIds.map((nodeId) => [nodeId, true] as const))
        : new Map()
    ),
    emptyValue: false
  })

  const selectionNodeStats: EditorSessionSource['selection']['node']['stats'] = store.createDerivedStore<SelectionNodeStatsView>({
    get: () => {
      const next = selectionApi.derive.nodeStats({
        summary: store.read(selectionSummary),
        resolveNodeMeta: (node) => {
          const meta = nodeType.meta(node.type)
          return {
            key: meta.key ?? node.type,
            name: meta.name,
            family: meta.family,
            icon: meta.icon
          }
        }
      })

      return {
        ...next,
        types: next.types.map((entry) => ({
          ...entry,
          family: entry.family as ReturnType<typeof nodeType.meta>['family']
        })) as SelectionNodeStatsView['types']
      } satisfies SelectionNodeStatsView
    }
  })

  const selectionEdgeStats = store.createDerivedStore({
    get: () => selectionApi.derive.edgeStats(
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
        readMindmapStructure: (id) => graph.query.mindmap.structure(id),
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
        readMindmapStructure: (id) => graph.query.mindmap.structure(id),
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
      const marquee = store.read(graph.stores.graph.state.chrome).preview.marquee

      return marquee
        ? {
            rect: graph.query.view.screenRect(marquee.worldRect),
            match: marquee.match
          }
        : undefined
    },
    isEqual: isChromeMarqueeEqual
  })

  const chromeDraw: EditorChromeSource['draw'] = store.createDerivedStore({
    get: () => {
      const preview = store.read(graph.stores.graph.state.chrome).preview.draw
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
    get: () => store.read(graph.stores.graph.state.chrome).preview.guides
  })

  const chromeEdgeGuide: EditorChromeSource['edgeGuide'] = store.createDerivedStore({
    get: () => store.read(graph.stores.graph.state.chrome).preview.edgeGuide ?? EMPTY_EDGE_GUIDE,
    isEqual: isEdgeGuideEqual
  })

  const selectedEdgeChrome: EditorSessionSource['selection']['edge']['chrome'] = store.createDerivedStore({
    get: () => {
      const selectedEdgeId = selectionApi.members.singleEdge(
        store.read(state.selection)
      )
      if (!selectedEdgeId) {
        return undefined
      }

      return graph.query.edge.chrome({
        edgeId: selectedEdgeId,
        activeRouteIndex: store.read(
          graph.stores.graph.state.edge.byId,
          selectedEdgeId
        )?.activeRouteIndex,
        tool: store.read(state.tool),
        interaction: {
          chrome: store.read(state.interaction).chrome,
          editingEdge: store.read(state.interaction).editingEdge
        },
        edit: store.read(state.edit)
      })
    },
    isEqual: isSelectedEdgeChromeEqual
  })

  const mindmapChrome: EditorSessionSource['mindmap']['chrome'] = store.createKeyedDerivedStore<string, ReturnType<EditorSessionSource['mindmap']['chrome']['get']>>({
    get: (mindmapId: string) => {
      if (!graph.query.mindmap.get(mindmapId)) {
        return undefined
      }

      return {
        addChildTargets: graph.query.mindmap.addChildTargets({
          mindmapId,
          selection: store.read(state.selection),
          edit: store.read(state.edit)
        })
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
        get: () => store.read(chromeEdgeGuide)
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
    edgeGuide: chromeEdgeGuide,
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
    members: selectionMembers,
    summary: selectionSummary,
    affordance: selectionAffordance,
    view: selectionView,
    node: {
      selected: selectionNodeSelected,
      stats: selectionNodeStats,
      scope: selectionNodeScope
    },
    edge: {
      chrome: selectedEdgeChrome
    }
  })

  const toolSource: EditorSessionSource['tool'] = createToolRead(session.state.tool)

  return {
    selection: selectionSource,
    tool: toolSource,
    draw: state.draw,
    edit: state.edit,
    interaction: state.interaction,
    viewport: {
      get: session.viewport.read.get,
      subscribe: session.viewport.read.subscribe,
      pointer: session.viewport.read.pointer,
      worldToScreen: session.viewport.read.worldToScreen,
      worldRect: session.viewport.read.worldRect,
      screenPoint: session.viewport.input.screenPoint,
      size: session.viewport.input.size,
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
