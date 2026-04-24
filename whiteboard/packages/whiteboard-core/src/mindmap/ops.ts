import { json } from '@shared/core'
import { path as mutationPath } from '@shared/mutation'
import type {
  MindmapBranchField,
  MindmapId,
  MindmapInsertInput,
  MindmapRecord,
  MindmapTopicField,
  MindmapTopicUpdateInput,
  MindmapTree,
  Node,
  NodeId,
  Operation,
  Point
} from '@whiteboard/core/types'
import type { MindmapBranchUpdateInput } from '@whiteboard/core/types'

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(target, key)

export const getNodeMindmapId = (
  node: Pick<Node, 'owner'> | undefined
): MindmapId | undefined => (
  node?.owner?.kind === 'mindmap'
    ? node.owner.id
    : undefined
)

export const isMindmapRoot = (
  document: Pick<import('@whiteboard/core/types').Document, 'mindmaps'>,
  node: Node | undefined
): boolean => {
  const mindmapId = getNodeMindmapId(node)
  if (!mindmapId || !node) {
    return false
  }
  return document.mindmaps[mindmapId]?.root === node.id
}

const createTopicData = (
  payload?: import('@whiteboard/core/types').MindmapInsertPayload | { kind: string; [key: string]: unknown }
) => {
  if (!payload) {
    return {
      text: 'Topic'
    }
  }

  switch (payload.kind) {
    case 'text':
      return {
        text: typeof payload.text === 'string' ? payload.text : 'Topic'
      }
    case 'file':
      return {
        fileId: payload.fileId,
        name: payload.name
      }
    case 'link':
      return {
        url: payload.url,
        title: payload.title
      }
    case 'ref':
      return {
        ref: payload.ref,
        title: payload.title
      }
    default:
      return {
        ...payload
      }
  }
}

export const createMindmapTopicNode = (
  id: NodeId,
  mindmapId: MindmapId,
  input?: MindmapInsertInput
): Node => ({
  id,
  type: input?.node?.type ?? 'text',
  owner: {
    kind: 'mindmap',
    id: mindmapId
  },
  position: { x: 0, y: 0 },
  size: input?.node?.size,
  rotation: input?.node?.rotation,
  locked: input?.node?.locked,
  data: {
    ...(input?.node?.data ?? {}),
    ...createTopicData(input?.payload)
  },
  style: input?.node?.style
})

export const emitMindmapTopicUpdateOps = (input: {
  mindmapId: MindmapId
  topicId: NodeId
  update: MindmapTopicUpdateInput
  emit: (op: Operation) => void
}) => {
  const fields = input.update.fields
  const fieldMap: Record<'size' | 'rotation' | 'locked', MindmapTopicField> = {
    size: 'size',
    rotation: 'rotation',
    locked: 'locked'
  }

  ;(['size', 'rotation', 'locked'] as const).forEach((key) => {
    if (!fields || !hasOwn(fields, key)) {
      return
    }

    const value = fields[key]
    if (value === undefined && key !== 'size') {
      input.emit({
        type: 'mindmap.topic.field.unset',
        id: input.mindmapId,
        topicId: input.topicId,
        field: fieldMap[key] as Extract<Operation, { type: 'mindmap.topic.field.unset' }>['field']
      })
      return
    }

    input.emit({
      type: 'mindmap.topic.field.set',
      id: input.mindmapId,
      topicId: input.topicId,
      field: fieldMap[key],
      value
    })
  })

  for (const record of input.update.records ?? []) {
    if (record.op === 'unset') {
      input.emit({
        type: 'mindmap.topic.record.unset',
        id: input.mindmapId,
        topicId: input.topicId,
        scope: record.scope,
        path: record.path
      })
      continue
    }

    input.emit({
      type: 'mindmap.topic.record.set',
      id: input.mindmapId,
      topicId: input.topicId,
      scope: record.scope,
      path: record.path ?? mutationPath.root(),
      value: record.value
    })
  }
}

export const emitMindmapBranchUpdateOps = (input: {
  mindmapId: MindmapId
  topicId: NodeId
  update: MindmapBranchUpdateInput
  emit: (op: Operation) => void
}) => {
  const fields = input.update.fields
  if (!fields) {
    return
  }

  ;(['color', 'line', 'width', 'stroke'] as const).forEach((field) => {
    if (!hasOwn(fields, field)) {
      return
    }

    const value = fields[field]
    if (value === undefined) {
      input.emit({
        type: 'mindmap.branch.field.unset',
        id: input.mindmapId,
        topicId: input.topicId,
        field: field as MindmapBranchField
      })
      return
    }

    input.emit({
      type: 'mindmap.branch.field.set',
      id: input.mindmapId,
      topicId: input.topicId,
      field: field as MindmapBranchField,
      value
    })
  })
}

export const createMindmapOp = ({
  id,
  tree,
  position = {
    x: 0,
    y: 0
  }
}: {
  id: MindmapId
  tree: MindmapTree
  position?: Point
}): Extract<Operation, { type: 'mindmap.create' }> => ({
  type: 'mindmap.create',
  mindmap: {
    id,
    root: tree.rootNodeId,
    members: Object.fromEntries(
      Object.entries(tree.nodes).map(([nodeId, node]) => [
        nodeId,
        {
          parentId: node.parentId,
          side: node.side,
          collapsed: node.collapsed,
          branchStyle: json.clone(node.branch)
        }
      ])
    ) as MindmapRecord['members'],
    children: json.clone(tree.children),
    layout: json.clone(tree.layout),
    meta: json.clone(tree.meta)
  },
  nodes: [
    {
      id: tree.rootNodeId,
      type: 'text',
      owner: {
        kind: 'mindmap',
        id
      },
      position: json.clone(position)
    }
  ]
})
