import { equal } from '@shared/core'
import {
  mindmap as mindmapApi,
  type MindmapLayout
} from '@whiteboard/core/mindmap'
import type {
  MindmapId,
  MindmapRecord,
  NodeId,
  Rect
} from '@whiteboard/core/types'
import type { GraphPhaseDelta } from '../../contracts/delta'
import type {
  Input,
  MindmapView
} from '../../contracts/editor'
import type {
  GraphMindmapEntry,
  WorkingState
} from '../../contracts/working'
import {
  readNodeEntry,
  readNodeDraftMeasure,
  readProjectedNodeRect,
  readProjectedNodeSize
} from './node'
import { reconcileEntity } from '../reconcile'

const isMindmapRenderConnectorEqual = (
  left: MindmapView['render']['connectors'][number],
  right: MindmapView['render']['connectors'][number]
): boolean => (
  left.id === right.id
  && left.parentId === right.parentId
  && left.childId === right.childId
  && left.path === right.path
  && left.style.color === right.style.color
  && left.style.line === right.style.line
  && left.style.width === right.style.width
  && left.style.stroke === right.style.stroke
)

const isMindmapViewEqual = (
  left: MindmapView,
  right: MindmapView
): boolean => (
  left.base.mindmap === right.base.mindmap
  && left.structure.rootId === right.structure.rootId
  && equal.sameOrder(left.structure.nodeIds, right.structure.nodeIds)
  && mindmapApi.project.equalLayout(left.tree.layout, right.tree.layout)
  && equal.sameOptionalRect(left.tree.bbox, right.tree.bbox)
  && equal.sameOrder(
    left.render.connectors,
    right.render.connectors,
    isMindmapRenderConnectorEqual
  )
)

const isMindmapGeometryChanged = (
  previous: MindmapView | undefined,
  next: MindmapView | undefined
): boolean => (
  previous === undefined
  || next === undefined
  || !mindmapApi.project.equalLayout(previous.tree.layout, next.tree.layout)
  || !equal.sameOptionalRect(previous.tree.bbox, next.tree.bbox)
  || !equal.sameOrder(
    previous.render.connectors,
    next.render.connectors,
    isMindmapRenderConnectorEqual
  )
)

const patchNodeIdOrder = (
  previous: readonly NodeId[] | undefined,
  next: readonly NodeId[]
): readonly NodeId[] => previous && equal.sameOrder(previous, next)
  ? previous
  : next

export const readMindmapNodeIds = (
  record: MindmapRecord | undefined
): readonly NodeId[] => record
  ? Object.keys(record.members) as readonly NodeId[]
  : []

export const readMindmapTree = (
  record: MindmapRecord | undefined
): ReturnType<typeof mindmapApi.tree.fromRecord> | undefined => record
  ? mindmapApi.tree.fromRecord(record)
  : undefined

const buildMindmapEntry = (
  input: Input,
  working: WorkingState,
  mindmapId: MindmapId
): GraphMindmapEntry | undefined => {
  const mindmap = working.document.snapshot.mindmaps[mindmapId]
  if (!mindmap) {
    return undefined
  }

  const nodeIds = working.indexes.mindmapNodes.get(mindmapId) ?? readMindmapNodeIds(mindmap)
  const tree = readMindmapTree(mindmap)
  if (!tree) {
    return undefined
  }

  const preview = input.editor.snapshot.preview.mindmap[mindmapId]
  const rootEntry = readNodeEntry(
    input,
    working,
    working.indexes.ownerByNode,
    tree.rootNodeId
  )

  if (!rootEntry) {
    return {
      base: {
        mindmap
      },
      rootId: tree.rootNodeId,
      nodeIds,
      structure: tree,
      tree: {
        layout: undefined,
        connectors: []
      }
    }
  }

  const rootDraftMeasure = readNodeDraftMeasure({
    working,
    entry: rootEntry,
    nodeId: tree.rootNodeId,
    edit: input.editor.snapshot.state.edit
  })
  const rootRect = readProjectedNodeRect({
    entry: rootEntry,
    draftMeasure: rootDraftMeasure
  })

  const layout = mindmapApi.project.layout({
    tree,
    rootRect,
    readNodeSize: (nodeId) => {
      const nodeEntry = readNodeEntry(
        input,
        working,
        working.indexes.ownerByNode,
        nodeId
      )
      return nodeEntry
        ? readProjectedNodeSize({
            entry: nodeEntry,
            draftMeasure: readNodeDraftMeasure({
              working,
              entry: nodeEntry,
              nodeId,
              edit: input.editor.snapshot.state.edit
            })
          })
        : {
            width: 1,
            height: 1
          }
    },
    preview: {
      rootDelta: preview?.rootMove
        ? preview.rootMove.delta
        : undefined,
      subtreeMove: preview?.subtreeMove
        ? {
            nodeId: preview.subtreeMove.nodeId,
            ghost: preview.subtreeMove.ghost
          }
        : undefined
    }
  })

  return {
    base: {
      mindmap
    },
    rootId: tree.rootNodeId,
    nodeIds,
    structure: tree,
    tree: {
      layout,
      connectors: mindmapApi.render.resolve({
        tree,
        computed: layout
      }).connectors
    }
  }
}

const buildMindmapView = (input: {
  previous?: MindmapView
  mindmap: MindmapView['base']['mindmap']
  rootId: MindmapView['structure']['rootId']
  nodeIds: readonly NodeId[]
  tree: MindmapView['structure']['tree']
  layout?: MindmapView['tree']['layout']
  connectors: readonly MindmapView['render']['connectors'][number][]
}): MindmapView => ({
  base: {
    mindmap: input.mindmap
  },
  structure: {
    rootId: input.rootId,
    nodeIds: patchNodeIdOrder(input.previous?.structure.nodeIds, input.nodeIds),
    tree: input.tree
  },
  tree: {
    layout: input.layout,
    bbox: input.layout?.bbox
  },
  render: {
    connectors: input.connectors
  }
})

const diffMindmapMemberNodes = (input: {
  previous: MindmapView | undefined
  next: MindmapView | undefined
}): ReadonlySet<NodeId> => {
  const changed = new Set<NodeId>()
  const previousNodeIds = input.previous?.structure.nodeIds ?? []
  const nextNodeIds = input.next?.structure.nodeIds ?? []

  if (!input.previous || !input.next) {
    previousNodeIds.forEach((nodeId) => {
      changed.add(nodeId)
    })
    nextNodeIds.forEach((nodeId) => {
      changed.add(nodeId)
    })
    return changed
  }

  const previousSet = new Set(previousNodeIds)
  const nextSet = new Set(nextNodeIds)

  previousNodeIds.forEach((nodeId) => {
    if (!nextSet.has(nodeId)) {
      changed.add(nodeId)
    }
  })
  nextNodeIds.forEach((nodeId) => {
    if (!previousSet.has(nodeId)) {
      changed.add(nodeId)
    }
  })

  const nodeIds = new Set<NodeId>([
    ...previousNodeIds,
    ...nextNodeIds
  ])
  nodeIds.forEach((nodeId) => {
    const previousRect = input.previous?.tree.layout?.node[nodeId]
    const nextRect = input.next?.tree.layout?.node[nodeId]
    if (!equal.sameOptionalRect(previousRect, nextRect)) {
      changed.add(nodeId)
    }
  })

  return changed
}

export const patchMindmap = (input: {
  input: Input
  working: WorkingState
  delta: GraphPhaseDelta
  mindmapId: MindmapId
}): {
  changed: boolean
  geometryChanged: boolean
  changedNodeIds: ReadonlySet<NodeId>
} => {
  const previous = input.working.graph.owners.mindmaps.get(input.mindmapId)
  const entry = buildMindmapEntry(input.input, input.working, input.mindmapId)
  const next = entry
    ? buildMindmapView({
        previous,
        mindmap: entry.base.mindmap,
        rootId: entry.rootId,
        nodeIds: entry.nodeIds,
        tree: entry.structure,
        layout: entry.tree.layout,
        connectors: entry.tree.connectors
      })
    : undefined

  const changedNodeIds = diffMindmapMemberNodes({
    previous,
    next
  })

  const result = reconcileEntity({
    id: input.mindmapId,
    previous,
    next,
    equal: isMindmapViewEqual,
    geometryChanged: isMindmapGeometryChanged,
    write: (value) => {
      if (value === undefined) {
        input.working.graph.owners.mindmaps.delete(input.mindmapId)
        return
      }

      input.working.graph.owners.mindmaps.set(input.mindmapId, value)
    },
    entityDelta: input.delta.entities.mindmaps,
    geometryDelta: input.delta.geometry.mindmaps
  })

  return {
    ...result,
    changedNodeIds
  }
}
