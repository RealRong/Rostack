import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { selection as selectionApi } from '@whiteboard/core/selection'
import type { NodeId } from '@whiteboard/core/types'
import { equal, store } from '@shared/core'
import type { EditorScene } from '@whiteboard/editor-scene'
import { createSelectionNodeStats } from '@whiteboard/editor/editor/ui/selection-node-stats'
import { readEdgeScope } from '@whiteboard/editor/editor/ui/selection-policy-edge'
import { readNodeScope } from '@whiteboard/editor/editor/ui/selection-policy-node'
import type { EditorState, EditorSceneUiSelection } from '@whiteboard/editor/types/editor'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type {
  EditorSelectionAffordanceView,
  EditorSelectionSummaryView,
  EditorSelectionView
} from '@whiteboard/editor/types/selectionPresentation'

export const createEditorSelectionUi = (input: {
  scene: EditorScene
  state: EditorState
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['selection']
}): EditorSceneUiSelection => {
  const selectionMembers = store.createDerivedStore({
    get: () => input.scene.selection.members(store.read(input.state.selection))
  })

  const selectionSummary = store.createDerivedStore({
    get: () => input.scene.selection.summary(store.read(input.state.selection)),
    isEqual: selectionApi.derive.summaryEqual
  })

  const selectionAffordance = store.createDerivedStore({
    get: () => input.scene.selection.affordance(store.read(input.state.selection)),
    isEqual: selectionApi.derive.affordanceEqual
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
    isEqual: (left, right) => (
      left.count === right.count
      && left.nodeCount === right.nodeCount
      && left.edgeCount === right.edgeCount
      && left.groupIds === right.groupIds
      && equal.sameOptionalRect(left.box, right.box)
    )
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
        handles: current.transformPlan?.handles ?? []
      }
    },
    isEqual: (left, right) => (
      left.owner === right.owner
      && left.ownerNodeId === right.ownerNodeId
      && left.moveHit === right.moveHit
      && left.canMove === right.canMove
      && left.canResize === right.canResize
      && left.canRotate === right.canRotate
      && equal.sameOptionalRect(left.displayBox, right.displayBox)
      && equal.sameOrder(left.handles, right.handles, (leftHandle, rightHandle) => (
        leftHandle.id === rightHandle.id
        && leftHandle.visible === rightHandle.visible
        && leftHandle.enabled === rightHandle.enabled
        && leftHandle.family === rightHandle.family
        && leftHandle.cursor === rightHandle.cursor
      ))
    )
  })

  const selectionView = store.createStructStore<EditorSelectionView>({
    fields: {
      target: {
        get: input.state.selection.get,
        isEqual: selectionApi.target.equal
      },
      kind: {
        get: () => {
          const kind = store.read(selectionSummary).kind
          return kind === 'node'
            ? 'nodes'
            : kind === 'edge'
              ? 'edges'
              : kind
        }
      },
      summary: {
        get: selectionViewSummary.get
      },
      affordance: {
        get: selectionViewAffordance.get
      }
    }
  })

  const nodeSelected = store.createProjectedKeyedStore({
    source: input.state.selection,
    select: (target) => {
      const byId = new Map<NodeId, boolean>()
      target.nodeIds.forEach((nodeId) => {
        byId.set(nodeId, true)
      })
      return byId
    },
    emptyValue: false
  })

  const nodeStats = store.createDerivedStore({
    get: () => createSelectionNodeStats({
      summary: store.read(selectionSummary),
      nodeType: input.nodeType
    })
  })

  const edgeStats = store.createDerivedStore({
    get: () => selectionApi.derive.edgeStats(
      store.read(selectionSummary)
    )
  })

  const nodeScope = store.createDerivedStore({
    get: () => {
      const currentNodeStats = store.read(nodeStats)
      if (currentNodeStats.count === 0) {
        return undefined
      }

      const members = store.read(selectionMembers)
      return readNodeScope({
        nodes: members.nodes,
        nodeIds: currentNodeStats.ids,
        primaryNode: members.primaryNode,
        nodeType: input.nodeType,
        nodeStats: currentNodeStats,
        readMindmapStructure: input.scene.mindmaps.structure,
        defaults: input.defaults
      })
    }
  })

  const edgeScope = store.createDerivedStore({
    get: () => {
      const currentEdgeStats = store.read(edgeStats)
      if (currentEdgeStats.count === 0) {
        return undefined
      }

      const members = store.read(selectionMembers)
      return readEdgeScope({
        edges: members.edges,
        edgeIds: currentEdgeStats.ids,
        primaryEdge: members.primaryEdge,
        defaults: input.defaults
      })
    }
  })

  const selectionEdgeChrome = store.createDerivedStore({
    get: () => {
      const selection = store.read(input.state.selection)
      const selectedEdgeId = selectionApi.members.singleEdge(selection)
      if (!selectedEdgeId) {
        return undefined
      }

      const interaction = store.read(input.state.interaction)

      return input.scene.edges.chrome({
        edgeId: selectedEdgeId,
        activeRouteIndex: store.read(
          input.scene.stores.graph.state.edge.byId,
          selectedEdgeId
        )?.activeRouteIndex,
        tool: store.read(input.state.tool),
        interaction: {
          chrome: interaction.chrome,
          editingEdge: interaction.editingEdge
        },
        edit: store.read(input.state.edit)
      })
    },
    isEqual: (left, right) => (
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
  })

  return {
    members: selectionMembers,
    summary: selectionSummary,
    affordance: selectionAffordance,
    view: selectionView,
    node: {
      selected: nodeSelected,
      stats: nodeStats,
      scope: nodeScope
    },
    edge: {
      stats: edgeStats,
      scope: edgeScope,
      chrome: selectionEdgeChrome
    }
  }
}
