import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import {
  readMindmapTopicUpdateFromPatch
} from '@whiteboard/core/mindmap/ops'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  CanvasItemRef,
  MindmapRecord,
  NodeId,
  Operation
} from '@whiteboard/core/types'
import type {
  MutationDeltaInput,
  MutationFootprint,
} from '@shared/mutation'
import {
  clone,
  entityKey,
  same
} from './common'
import {
  canvasRefKey,
  createMindmapTreeSubtreeSnapshot,
  readCanvasOrderAnchorFromSlot,
  readMindmapLayoutChangedNodeIds,
  resolveInsertedMindmapBranchStyle,
} from '@whiteboard/core/operations/targets'
import type {
  WhiteboardCustomPlanContext
} from './types'

const createIdDelta = (
  key: string,
  id: string
): MutationDeltaInput => ({
  changes: {
    [key]: {
      ids: [id]
    }
  }
})

const createMetadata = (
  input: {
    delta?: MutationDeltaInput
    footprint?: readonly MutationFootprint[]
  }
) => input

export const planMindmapCreate = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.create' }>
  >
): void => {
  input.program.canvasOrder().insert(
    {
      kind: 'mindmap',
      id: input.op.mindmap.id
    } satisfies CanvasItemRef,
    {
      kind: 'end'
    }
  )
  input.op.nodes.forEach((node) => {
    input.program.node.create(node)
  })
  input.program.mindmap.create(input.op.mindmap)
}

export const planMindmapRestore = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.restore' }>
  >
): void => {
  input.program.canvasOrder().insert(
    {
      kind: 'mindmap',
      id: input.op.snapshot.mindmap.id
    } satisfies CanvasItemRef,
    readCanvasOrderAnchorFromSlot(input.op.snapshot.slot)
  )
  input.op.snapshot.nodes.forEach((node) => {
    input.program.node.create(node)
  })
  input.program.mindmap.create(input.op.snapshot.mindmap)
}

export const planMindmapDelete = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.delete' }>
  >
): void => {
  const current = input.reader.mindmaps.get(input.op.id)
  const tree = input.reader.mindmaps.tree(input.op.id)
  if (!current || !tree) {
    return
  }

  const nodeIds = [...new Set(input.reader.mindmaps.subtreeNodeIds(input.op.id, tree.rootNodeId))]
  const connectedEdges = input.reader.edges.connectedToNodes(new Set(nodeIds))
  const edgeIds = connectedEdges.map((edge) => edge.id)

  input.program.canvasOrder().delete(
    canvasRefKey({
      kind: 'mindmap',
      id: input.op.id
    })
  )
  connectedEdges.forEach((edge) => {
    input.program.canvasOrder().delete(
      canvasRefKey({
        kind: 'edge',
        id: edge.id
      })
    )
  })
  edgeIds.forEach((edgeId) => {
    input.program.edge.delete(edgeId)
  })
  nodeIds.forEach((nodeId) => {
    input.program.node.delete(nodeId)
  })
  input.program.mindmap.delete(input.op.id)
}

export const planMindmapMove = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.move' }>
  >
): void => {
  const current = input.reader.mindmaps.get(input.op.id)
  const root = current
    ? input.reader.nodes.get(current.root)
    : undefined
  if (!current || !root) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }
  if (same(root.position, input.op.position)) {
    return
  }

  input.program.node.patch(root.id, {
    position: clone(input.op.position)!
  }, undefined, createMetadata({
    delta: createIdDelta('mindmap.layout', input.op.id)
  }))
}

export const planMindmapLayout = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.layout' }>
  >
): void => {
  const current = input.reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const nextLayout = {
    ...current.layout,
    ...clone(input.op.patch)
  }
  if (same(nextLayout, current.layout)) {
    return
  }

  input.program.mindmap.patch(input.op.id, {
    layout: nextLayout
  })
}

export const planMindmapTopicInsert = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.topic.insert' }>
  >
): void => {
  const current = input.reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  input.program.node.create(input.op.node)
  const tree = input.program.mindmapTree(input.op.id)

  switch (input.op.input.kind) {
    case 'child': {
      if (!current.members[input.op.input.parentId]) {
        return input.fail({
          code: 'invalid',
          message: `Parent node ${input.op.input.parentId} not found.`
        })
      }

      const side = input.op.input.parentId === current.root
        ? (input.op.input.options?.side ?? 'right')
        : undefined
      tree.insert(
        input.op.node.id,
        input.op.input.parentId,
        input.op.input.options?.index,
        {
          ...(side === undefined ? {} : { side }),
          branchStyle: resolveInsertedMindmapBranchStyle(current, input.op.input.parentId, side)
        }
      )
      return
    }
    case 'sibling': {
      const target = current.members[input.op.input.nodeId]
      const parentId = target?.parentId
      if (!target || !parentId) {
        return input.fail({
          code: 'invalid',
          message: `Node ${input.op.input.nodeId} cannot create a sibling.`
        })
      }

      const siblings = current.children[parentId] ?? []
      const currentIndex = siblings.indexOf(input.op.input.nodeId)
      const side = parentId === current.root
        ? (target.side ?? 'right')
        : undefined
      tree.insert(
        input.op.node.id,
        parentId,
        currentIndex < 0
          ? undefined
          : input.op.input.position === 'before'
            ? currentIndex
            : currentIndex + 1,
        {
          ...(side === undefined ? {} : { side }),
          branchStyle: resolveInsertedMindmapBranchStyle(current, parentId, target.side)
        }
      )
      return
    }
    case 'parent': {
      if (input.op.input.nodeId === current.root) {
        return input.fail({
          code: 'invalid',
          message: 'Root node cannot be wrapped.'
        })
      }

      const target = current.members[input.op.input.nodeId]
      const parentId = target?.parentId
      if (!target || !parentId) {
        return input.fail({
          code: 'invalid',
          message: `Node ${input.op.input.nodeId} not found.`
        })
      }

      const siblingIndex = (current.children[parentId] ?? []).indexOf(input.op.input.nodeId)
      if (siblingIndex < 0) {
        return input.fail({
          code: 'invalid',
          message: `Node ${input.op.input.nodeId} is detached.`
        })
      }

      const side = parentId === current.root
        ? (target.side ?? input.op.input.options?.side ?? 'right')
        : undefined
      tree.insert(
        input.op.node.id,
        parentId,
        siblingIndex,
        {
          ...(side === undefined ? {} : { side }),
          branchStyle: resolveInsertedMindmapBranchStyle(current, parentId, target.side)
        }
      )
      tree.move(
        input.op.input.nodeId,
        input.op.node.id,
        0
      )
      if (target.side !== undefined) {
        tree.patch(
          input.op.input.nodeId,
          {
            side: undefined
          }
        )
      }
    }
  }
}

export const planMindmapTopicRestore = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.topic.restore' }>
  >
): void => {
  const current = input.reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  input.op.snapshot.nodes.forEach((node) => {
    input.program.node.create(node)
  })
  input.program.mindmapTree(input.op.id).restore(
    createMindmapTreeSubtreeSnapshot(
      current,
      input.op.snapshot
    )
  )
}

export const planMindmapTopicMove = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.topic.move' }>
  >
): void => {
  const current = input.reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const member = current.members[input.op.input.nodeId]
  if (!member?.parentId) {
    return input.fail({
      code: 'invalid',
      message: `Topic ${input.op.input.nodeId} cannot move.`
    })
  }

  const nextSide = input.op.input.parentId === current.root
    ? (input.op.input.side ?? member.side ?? 'right')
    : undefined
  const tree = input.program.mindmapTree(input.op.id)
  tree.move(
    input.op.input.nodeId,
    input.op.input.parentId,
    input.op.input.index
  )
  if (!same(member.side, nextSide)) {
    tree.patch(
      input.op.input.nodeId,
      {
        side: nextSide
      }
    )
  }
}

export const planMindmapTopicDelete = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.topic.delete' }>
  >
): void => {
  const current = input.reader.mindmaps.get(input.op.id)
  const tree = input.reader.mindmaps.tree(input.op.id)
  if (!current || !tree) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }
  if (input.op.input.nodeId === current.root) {
    return input.fail({
      code: 'invalid',
      message: 'Root topic cannot use mindmap.topic.delete.'
    })
  }

  const nodeIds = [...new Set(input.reader.mindmaps.subtreeNodeIds(input.op.id, input.op.input.nodeId))]
  const connectedEdges = input.reader.edges.connectedToNodes(new Set(nodeIds))
  const edgeIds = connectedEdges.map((edge) => edge.id)

  input.program.mindmapTree(input.op.id).delete(input.op.input.nodeId)
  connectedEdges.forEach((edge) => {
    input.program.canvasOrder().delete(
      canvasRefKey({
        kind: 'edge',
        id: edge.id
      })
    )
  })
  edgeIds.forEach((edgeId) => {
    input.program.edge.delete(edgeId)
  })
  nodeIds.forEach((nodeId) => {
    input.program.node.delete(nodeId)
  })
}

export const planMindmapTopicPatch = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.topic.patch' }>
  >
): void => {
  const current = input.reader.nodes.get(input.op.topicId)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Topic ${input.op.topicId} not found.`
    })
  }

  const update = readMindmapTopicUpdateFromPatch(input.op.patch)
  const applied = nodeApi.update.apply(current, update)
  if (!applied.ok) {
    return input.fail({
      code: 'invalid',
      message: applied.message
    })
  }

  const writes: Record<string, unknown> = {}
  Object.entries(update.fields ?? {}).forEach(([field, value]) => {
    writes[field] = clone(value)
  })
  Object.entries(update.record ?? {}).forEach(([path, value]) => {
    writes[path] = clone(value)
  })
  if (Object.keys(writes).length === 0) {
    return
  }

  const relayoutNodeIds = readMindmapLayoutChangedNodeIds({
    before: input.document,
    after: {
      ...input.document,
      nodes: {
        ...input.document.nodes,
        [input.op.topicId]: applied.next
      }
    },
    id: input.op.id
  })

  input.program.node.patch(input.op.topicId, writes, undefined, createMetadata({
    footprint: [
      entityKey('mindmap', input.op.id)
    ],
    ...(relayoutNodeIds.length > 0
      ? {
          delta: createIdDelta('mindmap.layout', input.op.id)
        }
      : {})
  }))
}

export const planMindmapBranchPatch = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.branch.patch' }>
  >
): void => {
  const current = input.reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const member = current.members[input.op.topicId]
  if (!member) {
    return input.fail({
      code: 'invalid',
      message: `Topic ${input.op.topicId} not found.`
    })
  }

  const nextBranchStyle: MindmapRecord['members'][NodeId]['branchStyle'] = {
    ...member.branchStyle
  }
  let changed = false
  ;(['color', 'line', 'width', 'stroke'] as const).forEach((field) => {
    if (!(field in input.op.patch)) {
      return
    }
    const value = input.op.patch[field]
    if (value === undefined || same(value, member.branchStyle[field])) {
      return
    }
    changed = true
    nextBranchStyle[field] = clone(value) as never
  })
  if (!changed) {
    return
  }

  input.program.mindmapTree(input.op.id).patch(
    input.op.topicId,
    {
      branchStyle: nextBranchStyle
    }
  )
}

export const planMindmapTopicCollapse = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'mindmap.topic.collapse' }>
  >
): void => {
  const current = input.reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const member = current.members[input.op.topicId]
  if (!member) {
    return input.fail({
      code: 'invalid',
      message: `Topic ${input.op.topicId} not found.`
    })
  }

  const nextCollapsed = input.op.collapsed ?? !member.collapsed
  if (same(nextCollapsed, member.collapsed)) {
    return
  }

  input.program.mindmapTree(input.op.id).patch(
    input.op.topicId,
    {
      collapsed: nextCollapsed
    }
  )
}
