import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { selection as selectionApi, type SelectionSummary } from '@whiteboard/core/selection'
import { store } from '@shared/core'
import type { CommittedRead } from '@whiteboard/editor/committed/read'
import type { EditorPublishedSources } from '@whiteboard/editor/publish/sources'
import {
  isSelectedEdgeChromeEqual,
  readSelectedEdgeId,
  readSelectedEdgeRoutePoints,
  resolveEdgeCapability,
} from '@whiteboard/editor/presentation/edge'
import {
  isMindmapChromeEqual,
  isMindmapSceneEqual,
  readAddChildTargets,
  readMindmapNavigateTarget,
  toMindmapScene
} from '@whiteboard/editor/presentation/mindmap'
import {
  readEdgeScope,
  readNodeScope,
  readSelectionEdgeStats,
  readSelectionNodeStats,
  readSelectionNodeTransformBehavior,
  readSelectionRole,
  readSelectionTransformCapability,
  resolveSelectionOverlay,
  resolveSelectionToolbar
} from '@whiteboard/editor/presentation/selection'
import type { EditorQuery } from '@whiteboard/editor/query'
import { createNodeTypeRead } from '@whiteboard/editor/query/node/read'
import type { EditorStore } from '@whiteboard/editor/types/editor'
import type {
  EditorChromePresentation,
  EditorEdgeRender,
  EditorNodeRender,
  EditorPanelPresentation,
  EditorRead
} from '@whiteboard/editor/types/editor'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type { SelectionMembers } from '@whiteboard/editor/types/selectionPresentation'

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

const isSelectionMembersEqual = (
  left: SelectionMembers,
  right: SelectionMembers
) => (
  left.key === right.key
  && left.target === right.target
  && left.nodes === right.nodes
  && left.edges === right.edges
  && left.primaryNode === right.primaryNode
  && left.primaryEdge === right.primaryEdge
)

const readSelectionMembersKey = (
  target: {
    nodeIds: readonly string[]
    edgeIds: readonly string[]
  }
) => `${target.nodeIds.join('\0')}\u0001${target.edgeIds.join('\0')}`

const resolveNodeCapability = (
  node: EditorNodeRender['node'],
  registry: ReturnType<typeof createNodeTypeRead>
) => {
  const base = registry.capability(node.type)
  const mindmapOwned = node.owner?.kind === 'mindmap'

  return {
    ...base,
    connect: base.connect,
    resize: !mindmapOwned && base.resize,
    rotate: !mindmapOwned && base.rotate
  }
}

const projectWorldRect = (
  query: Pick<EditorQuery, 'viewport'>,
  worldRect: {
    x: number
    y: number
    width: number
    height: number
  }
) => {
  store.read(query.viewport)
  const topLeft = query.viewport.worldToScreen({
    x: worldRect.x,
    y: worldRect.y
  })
  const bottomRight = query.viewport.worldToScreen({
    x: worldRect.x + worldRect.width,
    y: worldRect.y + worldRect.height
  })

  return geometryApi.rect.fromPoints(topLeft, bottomRight)
}

const readNodeLocked = ({
  published,
  committed,
  nodeId
}: {
  published: Pick<EditorPublishedSources, 'node'>
  committed: Pick<CommittedRead, 'node'>
  nodeId: string
}) => (
  store.read(published.node, nodeId)?.base.node.locked
  ?? store.read(committed.node.committed, nodeId)?.node.locked
  ?? false
)

const readNodeRect = ({
  published,
  committed,
  nodeId
}: {
  published: Pick<EditorPublishedSources, 'node'>
  committed: Pick<CommittedRead, 'node'>
  nodeId: string
}) => store.read(published.node, nodeId)?.layout.rect
  ?? store.read(committed.node.committed, nodeId)?.rect

export const createEditorRead = (
  {
    committed,
    query,
    published,
    store: state,
    registry,
    defaults
  }: {
    committed: Pick<CommittedRead, 'document' | 'group' | 'mindmap' | 'node'>
    query: Pick<EditorQuery, 'history' | 'viewport' | 'chrome' | 'tool'>
    published: Pick<EditorPublishedSources, 'scene' | 'selection' | 'mindmap' | 'chrome' | 'node' | 'edge'>
    store: EditorStore
    registry: NodeRegistry
    defaults: EditorDefaults['selection']
  }
): EditorRead => {
  const nodeType = createNodeTypeRead(registry)
  const selectionMembers = store.createDerivedStore<SelectionMembers>({
    get: () => {
      const target = store.read(state.selection)
      const nodes = target.nodeIds.flatMap((nodeId) => {
        const node = store.read(published.node, nodeId)?.base.node
        return node ? [node] : []
      })
      const edges = target.edgeIds.flatMap((edgeId) => {
        const edge = store.read(published.edge, edgeId)?.base.edge
        return edge ? [edge] : []
      })

      return {
        key: readSelectionMembersKey(target),
        target,
        nodes,
        edges,
        primaryNode: nodes[0],
        primaryEdge: edges[0]
      }
    },
    isEqual: isSelectionMembersEqual
  })

  const selectionSummary = store.createDerivedStore<SelectionSummary>({
    get: () => {
      const current = store.read(selectionMembers)

      return selectionApi.derive.summary({
        target: current.target,
        nodes: current.nodes,
        edges: current.edges,
        readNodeRect: (node) => store.read(published.node, node.id)?.layout.bounds,
        readEdgeBounds: (edge) => store.read(published.edge, edge.id)?.route.bounds,
        resolveNodeTransformBehavior: (node) => readSelectionNodeTransformBehavior(node, nodeType)
      })
    },
    isEqual: selectionApi.derive.isSummaryEqual
  })

  const selectionAffordance = store.createDerivedStore({
    get: () => selectionApi.derive.affordance({
      selection: store.read(selectionSummary),
      resolveNodeRole: readSelectionRole,
      resolveNodeTransformCapability: (node) => readSelectionTransformCapability(node, nodeType)
    }),
    isEqual: selectionApi.derive.isAffordanceEqual
  })

  const selectionNodeSelected: EditorRead['selection']['node']['selected'] = store.createKeyedDerivedStore({
    get: (nodeId: string) => store.read(state.selection).nodeIds.includes(nodeId),
    isEqual: (left, right) => left === right
  })

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
        readMindmapStructure: (id) => store.read(committed.mindmap.structure, id),
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
        readMindmapStructure: (id) => store.read(committed.mindmap.structure, id),
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
              rect: projectWorldRect(query, marquee.worldRect),
              match: marquee.match
            }
          : undefined,
        draw: current.preview.draw,
        edgeGuide: store.read(query.chrome.edgeGuide),
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
      history: store.read(query.history),
      draw: store.read(state.draw)
    }),
    isEqual: (left, right) => (
      left.selectionToolbar === right.selectionToolbar
      && left.history === right.history
      && left.draw === right.draw
    )
  })

  const sceneList: EditorRead['scene']['list'] = store.createDerivedStore({
    get: () => store.read(published.scene).items,
    isEqual: (left, right) => left === right
  })

  const nodeRender: EditorRead['node']['render'] = store.createKeyedDerivedStore({
    get: (nodeId: string) => {
      const current = store.read(published.node, nodeId)
      if (!current) {
        return undefined
      }

      const capability = resolveNodeCapability(current.base.node, nodeType)

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
          published,
          committed,
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
      const current = store.read(published.mindmap, mindmapId)
      const structure = store.read(committed.mindmap.structure, mindmapId)
      const bbox = current?.tree.bbox
      if (!current || !structure || !bbox) {
        return undefined
      }

      return toMindmapScene(
        structure,
        bbox,
        current.render.connectors
      )
    },
    isEqual: isMindmapSceneEqual
  })

  const mindmapChrome: EditorRead['mindmap']['chrome'] = store.createKeyedDerivedStore<string, EditorRead['mindmap']['chrome'] extends store.KeyedReadStore<string, infer TValue> ? TValue : never>({
    get: (mindmapId: string) => {
      const structure = store.read(committed.mindmap.structure, mindmapId)
      if (!structure) {
        return undefined
      }

      return {
        addChildTargets: readAddChildTargets({
          structure,
          selection: store.read(state.selection),
          edit: store.read(state.edit),
          readNodeLocked: (nodeId) => readNodeLocked({
            published,
            committed,
            nodeId
          }),
          readNodeRect: (nodeId) => readNodeRect({
            published,
            committed,
            nodeId
          })
        })
      }
    },
    isEqual: isMindmapChromeEqual
  })

  return {
    document: {
      get: committed.document.get,
      background: committed.document.background,
      bounds: committed.document.bounds
    },
    group: {
      exactIds: committed.group.exactIds
    },
    history: query.history,
    mindmap: {
      scene: mindmapScene,
      chrome: mindmapChrome,
      navigate: (input) => {
        const currentStructure = store.read(committed.mindmap.structure, input.id)
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
      list: sceneList
    },
    selection: {
      node: {
        selected: selectionNodeSelected,
        stats: selectionNodeStats,
        scope: selectionNodeScope
      },
      summary: selectionSummary
    },
    tool: query.tool,
    viewport: query.viewport,
    chrome,
    panel
  }
}
