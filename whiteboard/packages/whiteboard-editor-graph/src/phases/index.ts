import type {
  PhaseSpec,
  RuntimeContext
} from '@shared/projection-runtime'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { Input, Snapshot } from '../contracts/editor'
import type { Token } from '../contracts/impact'
import type { WorkingState } from '../contracts/working'
import {
  buildChromeView,
  buildEdgeView,
  buildNodeView,
  buildSceneWorkingState,
  buildSelectionView,
  collectRects,
  readProjectedNodeRect
} from '../runtime/helpers'
import type { EditorPhaseName } from '../runtime/phaseNames'

type EditorContext = RuntimeContext<
  Input,
  WorkingState,
  Snapshot,
  Token
>

type EditorPhase = PhaseSpec<
  EditorPhaseName,
  EditorContext,
  undefined,
  {
    count: number
  }
>

const toMetric = (
  count: number
): { count: number } => ({
  count
})

const createInputPhase = (): EditorPhase => ({
  name: 'input',
  deps: [],
  run: (context) => {
    context.working.input = {
      revision: {
        document: context.input.document.snapshot.revision,
        input: context.previous.base.inputRevision + 1
      },
      document: context.input.document,
      session: context.input.session,
      measure: context.input.measure,
      interaction: context.input.interaction,
      viewport: context.input.viewport,
      clock: context.input.clock,
      impact: [...(context.dirty ?? [])]
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(context.working.input.impact.length)
    }
  }
})

const createGraphPhase = (): EditorPhase => ({
  name: 'graph',
  deps: ['input'],
  run: (context) => {
    const snapshot = context.working.input.document.snapshot
    const session = context.working.input.session
    const nodes = new Map()
    const edges = new Map()
    const mindmaps = new Map()
    const groups = new Map()
    const dirtyNodeIds = new Set<NodeId>(snapshot.change.entities.nodes.all)
    const dirtyEdgeIds = new Set<EdgeId>(snapshot.change.entities.edges.all)
    const dirtyMindmapIds = new Set<MindmapId>(snapshot.change.entities.owners.mindmaps.all)
    const dirtyGroupIds = new Set<GroupId>(snapshot.change.entities.owners.groups.all)

    snapshot.state.facts.entities.nodes.forEach((node, nodeId) => {
      const draft = session.draft.nodes.get(nodeId)
      const preview = session.preview.nodes.get(nodeId)
      if (draft || preview) {
        dirtyNodeIds.add(nodeId)
      }

      if (session.edit?.kind === 'node' && session.edit.nodeId === nodeId) {
        dirtyNodeIds.add(nodeId)
      }

      nodes.set(nodeId, {
        base: {
          node,
          owner: snapshot.state.facts.relations.nodeOwner.get(nodeId)
        },
        draft,
        preview
      })
    })

    snapshot.state.facts.entities.edges.forEach((edge, edgeId) => {
      const preview = session.preview.edges.get(edgeId)
      if (session.draft.edges.has(edgeId) || preview) {
        dirtyEdgeIds.add(edgeId)
      }

      if (session.edit?.kind === 'edge-label' && session.edit.edgeId === edgeId) {
        dirtyEdgeIds.add(edgeId)
      }

      edges.set(edgeId, {
        base: {
          edge,
          nodes: snapshot.state.facts.relations.edgeNodes.get(edgeId) ?? {}
        },
        preview
      })
    })

    snapshot.state.facts.entities.owners.mindmaps.forEach((mindmap, mindmapId) => {
      mindmaps.set(mindmapId, {
        base: {
          mindmap
        },
        nodeIds: snapshot.state.facts.relations.ownerNodes.mindmaps.get(mindmapId) ?? []
      })
    })

    snapshot.state.facts.entities.owners.groups.forEach((group, groupId) => {
      groups.set(groupId, {
        items: snapshot.state.facts.relations.groupItems.get(groupId) ?? []
      })
    })

    if (session.preview.mindmap?.rootMove) {
      dirtyMindmapIds.add(session.preview.mindmap.rootMove.mindmapId)
    }

    if (session.preview.mindmap?.subtreeMove) {
      dirtyMindmapIds.add(session.preview.mindmap.subtreeMove.mindmapId)
    }

    context.working.graph = {
      nodes,
      edges,
      owners: {
        mindmaps,
        groups
      },
      dirty: {
        nodeIds: dirtyNodeIds,
        edgeIds: dirtyEdgeIds,
        mindmapIds: dirtyMindmapIds,
        groupIds: dirtyGroupIds
      }
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(nodes.size + edges.size + mindmaps.size + groups.size)
    }
  }
})

const createMeasurePhase = (): EditorPhase => ({
  name: 'measure',
  deps: ['input'],
  run: (context) => {
    const text = context.working.input.measure.text
    context.working.measure = {
      nodes: text.nodes,
      edgeLabels: text.edgeLabels,
      dirty: {
        nodeIds: new Set(text.nodes.keys()),
        edgeIds: new Set(text.edgeLabels.keys())
      }
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(text.nodes.size + text.edgeLabels.size)
    }
  }
})

const createStructurePhase = (): EditorPhase => ({
  name: 'structure',
  deps: ['graph'],
  run: (context) => {
    const mindmaps = new Map()
    const groups = new Map()

    context.working.graph.owners.mindmaps.forEach((entry, mindmapId) => {
      mindmaps.set(mindmapId, {
        rootNodeId: entry.base.mindmap.root,
        nodeIds: entry.nodeIds,
        collapsedNodeIds: new Set(entry.nodeIds.filter((nodeId) => (
          entry.base.mindmap.members[nodeId]?.collapsed === true
        )))
      })
    })

    context.working.graph.owners.groups.forEach((entry, groupId) => {
      groups.set(groupId, {
        itemIds: entry.items
      })
    })

    context.working.structure = {
      mindmaps,
      groups
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(mindmaps.size + groups.size)
    }
  }
})

const createTreePhase = (): EditorPhase => ({
  name: 'tree',
  deps: ['structure', 'measure'],
  run: (context) => {
    const mindmaps = new Map()

    context.working.structure.mindmaps.forEach((entry, mindmapId) => {
      const nodeRects = new Map()

      entry.nodeIds.forEach((nodeId) => {
        const graphNode = context.working.graph.nodes.get(nodeId)
        if (!graphNode) {
          return
        }

        nodeRects.set(nodeId, readProjectedNodeRect({
          entry: graphNode,
          measuredSize: context.working.measure.nodes.get(nodeId)?.size
        }))
      })

      const bbox = collectRects(nodeRects.values())

      mindmaps.set(mindmapId, {
        nodeRects,
        bbox
      })
    })

    context.working.tree = {
      mindmaps
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(mindmaps.size)
    }
  }
})

const createElementPhase = (): EditorPhase => ({
  name: 'element',
  deps: ['graph', 'measure', 'tree'],
  run: (context) => {
    const nodes = new Map()
    const edges = new Map()

    context.working.graph.nodes.forEach((entry, nodeId) => {
      const treeRect = entry.base.owner?.kind === 'mindmap'
        ? context.working.tree.mindmaps.get(entry.base.owner.id)?.nodeRects.get(nodeId)
        : undefined

      nodes.set(nodeId, buildNodeView({
        entry,
        measuredSize: context.working.measure.nodes.get(nodeId)?.size,
        treeRect,
        edit: context.working.input.session.edit
      }))
    })

    context.working.graph.edges.forEach((entry, edgeId) => {
      edges.set(edgeId, buildEdgeView({
        edgeId,
        entry,
        labelMeasures: context.working.measure.edgeLabels.get(edgeId),
        edit: context.working.input.session.edit
      }))
    })

    context.working.element = {
      nodes,
      edges
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(nodes.size + edges.size)
    }
  }
})

const createSelectionPhase = (): EditorPhase => ({
  name: 'selection',
  deps: ['element'],
  run: (context) => {
    context.working.ui = {
      ...context.working.ui,
      selection: buildSelectionView(context.working.input.interaction.selection),
      hover: context.working.input.interaction.hover
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(
        context.working.ui.selection.target.nodeIds.length
        + context.working.ui.selection.target.edgeIds.length
      )
    }
  }
})

const createChromePhase = (): EditorPhase => ({
  name: 'chrome',
  deps: ['selection'],
  run: (context) => {
    context.working.ui = {
      ...context.working.ui,
      chrome: buildChromeView({
        session: context.working.input.session,
        selection: context.working.ui.selection.target,
        hover: context.working.ui.hover
      })
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(context.working.ui.chrome.overlays.length)
    }
  }
})

const createScenePhase = (): EditorPhase => ({
  name: 'scene',
  deps: ['element', 'chrome'],
  run: (context) => {
    context.working.scene = buildSceneWorkingState({
      snapshot: context.working.input.document.snapshot,
      structure: context.working.structure,
      element: context.working.element
    })

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(context.working.scene.items.length)
    }
  }
})

export const createEditorGraphPhases = (): readonly EditorPhase[] => [
  createInputPhase(),
  createGraphPhase(),
  createMeasurePhase(),
  createStructurePhase(),
  createTreePhase(),
  createElementPhase(),
  createSelectionPhase(),
  createChromePhase(),
  createScenePhase()
]
