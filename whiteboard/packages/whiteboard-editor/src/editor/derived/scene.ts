import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { selection as selectionApi } from '@whiteboard/core/selection'
import type { MindmapId } from '@whiteboard/core/types'
import { equal, store } from '@shared/core'
import type { EditorScene } from '@whiteboard/editor-scene'
import type { EditorSceneDerived } from '@whiteboard/editor/editor/derived/types'
import type {
  EditorMarqueePreview,
  EditorState,
  MindmapChrome
} from '@whiteboard/editor/types/editor'
import {
  EMPTY_EDGE_GUIDE,
  isEdgeGuideEqual
} from '@whiteboard/editor/preview/edge'
import type {
  EditorSelectionAffordanceView,
  EditorSelectionSummaryView,
  EditorSelectionView
} from '@whiteboard/editor/types/selectionPresentation'

const readSelectionHandles = (
  current: ReturnType<EditorSceneDerived['selection']['affordance']['get']>
): EditorSelectionAffordanceView['handles'] => (
  current.transformPlan?.handles ?? []
)

const isChromeMarqueeEqual = (
  left: EditorMarqueePreview | undefined,
  right: EditorMarqueePreview | undefined
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
  left: ReturnType<EditorSceneDerived['selection']['edge']['chrome']['get']>,
  right: ReturnType<EditorSceneDerived['selection']['edge']['chrome']['get']>
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
  left: MindmapChrome | undefined,
  right: MindmapChrome | undefined
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
  kind: ReturnType<EditorSceneDerived['selection']['summary']['get']>['kind']
): EditorSelectionView['kind'] => (
  kind === 'node'
    ? 'nodes'
    : kind === 'edge'
      ? 'edges'
      : kind
)

export const createEditorSceneDerived = (input: {
  scene: EditorScene
  state: EditorState
}): EditorSceneDerived => {
  const scene = input.scene

  const selectionMembers = store.createDerivedStore({
    get: () => scene.selection.members(store.read(input.state.selection))
  })

  const selectionSummary = store.createDerivedStore({
    get: () => scene.selection.summary(store.read(input.state.selection)),
    isEqual: selectionApi.derive.summaryEqual
  })

  const selectionAffordance = store.createDerivedStore({
    get: () => scene.selection.affordance(store.read(input.state.selection)),
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
        handles: readSelectionHandles(current)
      }
    },
    isEqual: isSelectionAffordanceViewEqual
  })

  const selectionView = store.createStructStore<EditorSelectionView>({
    fields: {
      target: {
        get: input.state.selection.get,
        isEqual: selectionApi.target.equal
      },
      kind: {
        get: () => toSelectionViewKind(store.read(selectionSummary).kind)
      },
      summary: {
        get: selectionViewSummary.get
      },
      affordance: {
        get: selectionViewAffordance.get
      }
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

      return scene.edges.chrome({
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
    isEqual: isSelectedEdgeChromeEqual
  })

  const marquee = store.createDerivedStore({
    get: () => scene.overlay.marquee(),
    isEqual: isChromeMarqueeEqual
  })

  const draw = store.createDerivedStore({
    get: () => scene.overlay.draw()
  })

  const snap = store.createDerivedStore({
    get: () => scene.overlay.guides()
  })

  const edgeGuide = store.createDerivedStore({
    get: () => scene.overlay.edgeGuide() ?? EMPTY_EDGE_GUIDE,
    isEqual: isEdgeGuideEqual
  })

  const mindmapChrome = store.createKeyedDerivedStore<MindmapId, MindmapChrome | undefined>({
    get: (mindmapId: MindmapId) => {
      if (!scene.mindmaps.get(mindmapId)) {
        return undefined
      }

      return {
        addChildTargets: scene.mindmaps.addChildTargets({
          mindmapId,
          selection: store.read(input.state.selection),
          edit: store.read(input.state.edit)
        })
      }
    },
    isEqual: isMindmapChromeEqual
  })

  return {
    selection: {
      members: selectionMembers,
      summary: selectionSummary,
      affordance: selectionAffordance,
      view: selectionView,
      edge: {
        chrome: selectionEdgeChrome
      }
    },
    chrome: {
      marquee,
      draw,
      edgeGuide,
      snap
    },
    mindmap: {
      chrome: mindmapChrome
    }
  }
}
