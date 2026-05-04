import {
  extendMutationChange,
  type MutationWrite,
} from '@shared/mutation'
import type {
  MindmapId,
} from '@whiteboard/core/mindmap/types'
import type {
  Edge,
  Group,
  Node,
} from '@whiteboard/core/types'
import type {
  WhiteboardQuery,
} from '@whiteboard/core/query'
import type {
  WhiteboardMutationChange,
} from './model'
import {
  whiteboardChangeModel,
} from './changeModel'

export type WhiteboardTouchedIds<TId extends string> = ReadonlySet<TId> | 'all'

type WhiteboardTouchedIdsChange<TId extends string> = {
  touchedIds(): WhiteboardTouchedIds<TId>
}

export type WhiteboardChangeExtension = {
  node: {
    create: WhiteboardTouchedIdsChange<Node['id']>
    delete: WhiteboardTouchedIdsChange<Node['id']>
    geometry: WhiteboardTouchedIdsChange<Node['id']>
    owner: WhiteboardTouchedIdsChange<Node['id']>
    content: WhiteboardTouchedIdsChange<Node['id']>
  }
  edge: {
    create: WhiteboardTouchedIdsChange<Edge['id']>
    delete: WhiteboardTouchedIdsChange<Edge['id']>
    endpoints: WhiteboardTouchedIdsChange<Edge['id']>
    points: WhiteboardTouchedIdsChange<Edge['id']>
    style: WhiteboardTouchedIdsChange<Edge['id']>
    labels: WhiteboardTouchedIdsChange<Edge['id']>
    data: WhiteboardTouchedIdsChange<Edge['id']>
  }
  mindmap: {
    create: WhiteboardTouchedIdsChange<MindmapId>
    delete: WhiteboardTouchedIdsChange<MindmapId>
    structure: WhiteboardTouchedIdsChange<MindmapId>
    layout: WhiteboardTouchedIdsChange<MindmapId>
  }
  group: {
    create: WhiteboardTouchedIdsChange<Group['id']>
    delete: WhiteboardTouchedIdsChange<Group['id']>
    value: WhiteboardTouchedIdsChange<Group['id']>
  }
}

export type WhiteboardChange = WhiteboardMutationChange & WhiteboardChangeExtension

const changeCache = new WeakMap<WhiteboardMutationChange, WhiteboardChange>()

const readWriteTargetId = (
  write: MutationWrite
): string | undefined => write.target?.id

const createTouchedIdsChange = <TId extends string>(
  reset: boolean,
  ids: ReadonlySet<TId>
): WhiteboardTouchedIdsChange<TId> => ({
  touchedIds: () => (
    reset
      ? 'all'
      : ids
  )
})

export const createWhiteboardChange = (
  _query: WhiteboardQuery,
  base: WhiteboardMutationChange
): WhiteboardChange => {
  const cached = changeCache.get(base)
  if (cached) {
    return cached
  }

  const reset = base.reset()
  const writes = base.writes()

  const nodeCreate = new Set<Node['id']>()
  const nodeDelete = new Set<Node['id']>()
  const nodeGeometry = new Set<Node['id']>()
  const nodeOwner = new Set<Node['id']>()
  const nodeContent = new Set<Node['id']>()

  const edgeCreate = new Set<Edge['id']>()
  const edgeDelete = new Set<Edge['id']>()
  const edgeEndpoints = new Set<Edge['id']>()
  const edgePoints = new Set<Edge['id']>()
  const edgeStyle = new Set<Edge['id']>()
  const edgeLabels = new Set<Edge['id']>()
  const edgeData = new Set<Edge['id']>()

  const mindmapCreate = new Set<MindmapId>()
  const mindmapDelete = new Set<MindmapId>()
  const mindmapStructure = new Set<MindmapId>()
  const mindmapLayout = new Set<MindmapId>()

  const groupCreate = new Set<Group['id']>()
  const groupDelete = new Set<Group['id']>()
  const groupValue = new Set<Group['id']>()

  for (const write of writes) {
    const id = readWriteTargetId(write)

    if (id && write.nodeId === whiteboardChangeModel.node.entity) {
      if (write.kind === 'entity.create') {
        nodeCreate.add(id)
      } else if (write.kind === 'entity.remove') {
        nodeDelete.add(id)
      }
      continue
    }

    if (id && whiteboardChangeModel.node.geometry.has(write.nodeId)) {
      nodeGeometry.add(id)
      continue
    }

    if (id && whiteboardChangeModel.node.owner.has(write.nodeId)) {
      nodeOwner.add(id)
      continue
    }

    if (id && whiteboardChangeModel.node.content.has(write.nodeId)) {
      nodeContent.add(id)
      continue
    }

    if (id && write.nodeId === whiteboardChangeModel.edge.entity) {
      if (write.kind === 'entity.create') {
        edgeCreate.add(id)
      } else if (write.kind === 'entity.remove') {
        edgeDelete.add(id)
      }
      continue
    }

    if (id && whiteboardChangeModel.edge.endpoints.has(write.nodeId)) {
      edgeEndpoints.add(id)
      continue
    }

    if (id && write.nodeId === whiteboardChangeModel.edge.points) {
      edgePoints.add(id)
      continue
    }

    if (id && whiteboardChangeModel.edge.style.has(write.nodeId)) {
      edgeStyle.add(id)
      continue
    }

    if (id && write.nodeId === whiteboardChangeModel.edge.labels) {
      edgeLabels.add(id)
      continue
    }

    if (id && write.nodeId === whiteboardChangeModel.edge.data) {
      edgeData.add(id)
      continue
    }

    if (id && write.nodeId === whiteboardChangeModel.mindmap.entity) {
      if (write.kind === 'entity.create') {
        mindmapCreate.add(id)
      } else if (write.kind === 'entity.remove') {
        mindmapDelete.add(id)
      }
      continue
    }

    if (id && write.nodeId === whiteboardChangeModel.mindmap.structure) {
      mindmapStructure.add(id)
      continue
    }

    if (id && write.nodeId === whiteboardChangeModel.mindmap.layout) {
      mindmapLayout.add(id)
      continue
    }

    if (id && write.nodeId === whiteboardChangeModel.group.entity) {
      if (write.kind === 'entity.create') {
        groupCreate.add(id)
      } else if (write.kind === 'entity.remove') {
        groupDelete.add(id)
      }
      continue
    }

    if (id && whiteboardChangeModel.group.value.has(write.nodeId)) {
      groupValue.add(id)
    }
  }

  const change = extendMutationChange<WhiteboardMutationChange, WhiteboardChangeExtension>(
    base,
    {
      node: {
        create: createTouchedIdsChange(reset, nodeCreate),
        delete: createTouchedIdsChange(reset, nodeDelete),
        geometry: createTouchedIdsChange(reset, nodeGeometry),
        owner: createTouchedIdsChange(reset, nodeOwner),
        content: createTouchedIdsChange(reset, nodeContent),
      },
      edge: {
        create: createTouchedIdsChange(reset, edgeCreate),
        delete: createTouchedIdsChange(reset, edgeDelete),
        endpoints: createTouchedIdsChange(reset, edgeEndpoints),
        points: createTouchedIdsChange(reset, edgePoints),
        style: createTouchedIdsChange(reset, edgeStyle),
        labels: createTouchedIdsChange(reset, edgeLabels),
        data: createTouchedIdsChange(reset, edgeData),
      },
      mindmap: {
        create: createTouchedIdsChange(reset, mindmapCreate),
        delete: createTouchedIdsChange(reset, mindmapDelete),
        structure: createTouchedIdsChange(reset, mindmapStructure),
        layout: createTouchedIdsChange(reset, mindmapLayout),
      },
      group: {
        create: createTouchedIdsChange(reset, groupCreate),
        delete: createTouchedIdsChange(reset, groupDelete),
        value: createTouchedIdsChange(reset, groupValue),
      },
    }
  )

  changeCache.set(base, change)
  return change
}
