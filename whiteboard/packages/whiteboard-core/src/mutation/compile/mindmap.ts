import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import {
  createMindmapTopicNode,
  readMindmapTopicUpdateFromPatch
} from '@whiteboard/core/mindmap/ops'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/mutation/compile/helpers'
import {
  canvasRefKey,
  readMindmapLayoutChangedNodeIds,
  resolveInsertedMindmapBranchStyle,
} from '@whiteboard/core/mutation/support'
import type {
  CanvasItemRef,
  Edge,
  MindmapCreateInput,
  MindmapRecord,
  NodeId,
  Point
} from '@whiteboard/core/types'
import {
  clone,
  same
} from '@whiteboard/core/mutation/common'

const readMindmapRootId = (
  record: MindmapRecord
): NodeId | undefined => record.tree.rootId

const readMindmapNode = (
  record: MindmapRecord,
  nodeId: NodeId
) => record.tree.nodes[nodeId]

const readMindmapNodeValue = (
  record: MindmapRecord,
  nodeId: NodeId
) => readMindmapNode(record, nodeId)?.value

const readMindmapChildren = (
  record: MindmapRecord,
  nodeId: NodeId
): readonly NodeId[] => readMindmapNode(record, nodeId)?.children ?? []

const compileMindmapCreate = (
  input: MindmapCreateInput,
  ctx: WhiteboardCompileContext
) => {
  const mindmapId = input.id ?? ctx.services.ids.mindmap()
  const rootId = ctx.services.ids.node()
  const instantiated = mindmapApi.template.instantiate({
    template: input.template,
    rootId,
    createNodeId: ctx.services.ids.node
  })

  const nodes = Object.entries(instantiated.nodes).flatMap(([nodeId, templateNode]) => {
    const materialized = nodeApi.materialize.committed({
      node: {
        id: nodeId,
        type: templateNode.type ?? 'text',
        owner: {
          kind: 'mindmap' as const,
          id: mindmapId
        },
        position: nodeId === rootId
          ? (input.position ?? { x: 0, y: 0 })
          : { x: 0, y: 0 },
        size: templateNode.size,
        rotation: templateNode.rotation,
        locked: templateNode.locked,
        data: templateNode.data,
        style: templateNode.style
      },
      registries: ctx.services.registries
    })
    if (!materialized.ok) {
      return []
    }
    return [materialized.data]
  })

  if (nodes.length !== Object.keys(instantiated.nodes).length) {
    return ctx.invalid('Mindmap template nodes could not be materialized.')
  }

  ctx.writer.order.insert(
    {
      kind: 'mindmap',
      id: mindmapId
    } satisfies CanvasItemRef,
    {
      at: 'end'
    }
  )
  nodes.forEach((node) => {
    ctx.writer.node.create(node)
  })
  ctx.writer.mindmap.create({
    id: mindmapId,
    layout: instantiated.tree.layout,
    tree: {
      rootId,
      nodes: Object.fromEntries(
        Object.entries(instantiated.tree.nodes).map(([nodeId, member]) => [
          nodeId,
          {
            ...(member.parentId === undefined ? {} : { parentId: member.parentId }),
            children: [...(instantiated.tree.children[nodeId] ?? [])],
            value: {
              ...(member.side === undefined ? {} : { side: member.side }),
              ...(member.collapsed === undefined ? {} : { collapsed: member.collapsed }),
              branchStyle: member.branch
            }
          }
        ])
      )
    }
  })

  return {
    mindmapId,
    rootId
  }
}

export const emitMindmapDelete = (
  ctx: WhiteboardCompileContext,
  id: string
) => {
  const current = ctx.reader.mindmap.get(id)
  const tree = ctx.query.mindmap.tree(id)
  if (!current || !tree) {
    return
  }

  const nodeIds = [...new Set(ctx.query.mindmap.subtreeNodeIds(id, tree.rootNodeId))]
  const connectedEdges = ctx.query.edge.connectedToNodes(new Set(nodeIds))

  ctx.writer.order.delete(canvasRefKey({
    kind: 'mindmap',
    id
  }))
  connectedEdges.forEach((edge: Edge) => {
    ctx.writer.order.delete(canvasRefKey({
      kind: 'edge',
      id: edge.id
    }))
    ctx.writer.edge.delete(edge.id)
  })
  nodeIds.forEach((nodeId) => {
    ctx.writer.node.delete(nodeId)
  })
  ctx.writer.mindmap.delete(id)
}

export const emitMindmapMove = (
  ctx: WhiteboardCompileContext,
  id: string,
  position: Point
) => {
  const current = ctx.reader.mindmap.get(id)
  const rootId = current ? readMindmapRootId(current) : undefined
  const root = rootId ? ctx.reader.node.get(rootId) : undefined
  if (!current || !root) {
    return ctx.invalid(`Mindmap ${id} not found.`)
  }
  if (same(root.position, position)) {
    return
  }

  ctx.writer.node.patch(root.id, {
    position: clone(position)!
  })
}

const emitMindmapLayout = (
  ctx: WhiteboardCompileContext,
  id: string,
  patch: Partial<MindmapRecord['layout']>
) => {
  const current = ctx.reader.mindmap.get(id)
  if (!current) {
    return ctx.invalid(`Mindmap ${id} not found.`)
  }

  const nextLayout = {
    ...current.layout,
    ...clone(patch)
  }
  if (same(nextLayout, current.layout)) {
    return
  }

  ctx.writer.mindmap.patch(id, {
    layout: nextLayout
  })
}

export const emitMindmapTopicInsert = (
  ctx: WhiteboardCompileContext,
  id: string,
  input: Extract<import('@whiteboard/core/mutation').WhiteboardIntent, { type: 'mindmap.topic.insert' }>['input'],
  node: import('@whiteboard/core/types').Node
) => {
  const current = ctx.reader.mindmap.get(id)
  if (!current) {
    return ctx.invalid(`Mindmap ${id} not found.`)
  }

  ctx.writer.node.create(node)
  const tree = ctx.writer.mindmap(id).tree

  switch (input.kind) {
    case 'child': {
      if (!readMindmapNode(current, input.parentId)) {
        return ctx.invalid(`Parent node ${input.parentId} not found.`)
      }

      const side = input.parentId === readMindmapRootId(current)
        ? (input.options?.side ?? 'right')
        : undefined
      tree.insert(node.id, {
        parentId: input.parentId,
        index: input.options?.index,
        value: {
          ...(side === undefined ? {} : { side }),
          branchStyle: resolveInsertedMindmapBranchStyle(current, input.parentId, side)
        }
      })
      return
    }
    case 'sibling': {
      const target = readMindmapNode(current, input.nodeId)
      const targetValue = readMindmapNodeValue(current, input.nodeId)
      const parentId = target?.parentId
      if (!target || !parentId) {
        return ctx.invalid(`Node ${input.nodeId} cannot create a sibling.`)
      }

      const siblings = readMindmapChildren(current, parentId)
      const currentIndex = siblings.indexOf(input.nodeId)
      const side = parentId === readMindmapRootId(current)
        ? (targetValue?.side ?? 'right')
        : undefined
      tree.insert(node.id, {
        parentId,
        index: currentIndex < 0
          ? undefined
          : input.position === 'before'
            ? currentIndex
            : currentIndex + 1,
        value: {
          ...(side === undefined ? {} : { side }),
          branchStyle: resolveInsertedMindmapBranchStyle(current, parentId, targetValue?.side)
        }
      })
      return
    }
    case 'parent': {
      if (input.nodeId === readMindmapRootId(current)) {
        return ctx.invalid('Root node cannot be wrapped.')
      }

      const target = readMindmapNode(current, input.nodeId)
      const targetValue = readMindmapNodeValue(current, input.nodeId)
      const parentId = target?.parentId
      if (!target || !parentId) {
        return ctx.invalid(`Node ${input.nodeId} not found.`)
      }

      const siblingIndex = readMindmapChildren(current, parentId).indexOf(input.nodeId)
      if (siblingIndex < 0) {
        return ctx.invalid(`Node ${input.nodeId} is detached.`)
      }

      const side = parentId === readMindmapRootId(current)
        ? (targetValue?.side ?? input.options?.side ?? 'right')
        : undefined
      tree.insert(node.id, {
        parentId,
        index: siblingIndex,
        value: {
          ...(side === undefined ? {} : { side }),
          branchStyle: resolveInsertedMindmapBranchStyle(current, parentId, targetValue?.side)
        }
      })
      tree.move(input.nodeId, {
        parentId: node.id,
        index: 0
      })
      if (targetValue?.side !== undefined) {
        tree.patch(input.nodeId, {
          side: undefined
        })
      }
    }
  }
}

export const emitMindmapTopicMove = (
  ctx: WhiteboardCompileContext,
  id: string,
  input: Extract<import('@whiteboard/core/mutation').WhiteboardIntent, { type: 'mindmap.topic.move' }>['input']
) => {
  const current = ctx.reader.mindmap.get(id)
  if (!current) {
    return ctx.invalid(`Mindmap ${id} not found.`)
  }

  const member = readMindmapNode(current, input.nodeId)
  const memberValue = readMindmapNodeValue(current, input.nodeId)
  if (!member?.parentId) {
    return ctx.invalid(`Topic ${input.nodeId} cannot move.`)
  }

  const nextSide = input.parentId === readMindmapRootId(current)
    ? (input.side ?? memberValue?.side ?? 'right')
    : undefined
  const tree = ctx.writer.mindmap(id).tree
  tree.move(input.nodeId, {
    parentId: input.parentId,
    index: input.index
  })
  if (!same(memberValue?.side, nextSide)) {
    tree.patch(
      input.nodeId,
      {
        side: nextSide
      }
    )
  }
}

export const emitMindmapTopicDelete = (
  ctx: WhiteboardCompileContext,
  id: string,
  nodeId: NodeId
) => {
  const current = ctx.reader.mindmap.get(id)
  const tree = ctx.query.mindmap.tree(id)
  if (!current || !tree) {
    return ctx.invalid(`Mindmap ${id} not found.`)
  }
  if (nodeId === readMindmapRootId(current)) {
    return ctx.invalid('Root topic cannot use mindmap.topic.delete.')
  }

  const nodeIds = [...new Set(ctx.query.mindmap.subtreeNodeIds(id, nodeId))]
  const connectedEdges = ctx.query.edge.connectedToNodes(new Set(nodeIds))

  ctx.writer.mindmap(id).tree.delete(nodeId)
  connectedEdges.forEach((edge: Edge) => {
    ctx.writer.order.delete(canvasRefKey({
      kind: 'edge',
      id: edge.id
    }))
    ctx.writer.edge.delete(edge.id)
  })
  nodeIds.forEach((memberId) => {
    ctx.writer.node.delete(memberId)
  })
}

export const emitMindmapTopicPatch = (
  ctx: WhiteboardCompileContext,
  id: string,
  topicId: NodeId,
  patch: import('@whiteboard/core/types').NodePatch
) => {
  const current = ctx.reader.node.get(topicId)
  if (!current) {
    return ctx.invalid(`Topic ${topicId} not found.`)
  }

  const update = readMindmapTopicUpdateFromPatch(patch)
  const applied = nodeApi.update.apply(current, update)
  if (!applied.ok) {
    return ctx.invalid(applied.message)
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
    before: ctx.document,
    after: {
      ...ctx.document,
      nodes: {
        ...ctx.document.nodes,
        [topicId]: applied.next
      }
    },
    id
  })

  ctx.writer.node.patch(topicId, writes)
}

export const emitMindmapBranchPatch = (
  ctx: WhiteboardCompileContext,
  id: string,
  topicId: NodeId,
  patch: Partial<NonNullable<MindmapRecord['tree']['nodes'][NodeId]['value']>['branchStyle']>
) => {
  const current = ctx.reader.mindmap.get(id)
  if (!current) {
    return ctx.invalid(`Mindmap ${id} not found.`)
  }

  const member = readMindmapNodeValue(current, topicId)
  if (!member) {
    return ctx.invalid(`Topic ${topicId} not found.`)
  }

  const nextBranchStyle: NonNullable<MindmapRecord['tree']['nodes'][NodeId]['value']>['branchStyle'] = {
    ...member.branchStyle
  }
  let changed = false
  ;(['color', 'line', 'width', 'stroke'] as const).forEach((field) => {
    if (!(field in patch)) {
      return
    }
    const value = patch[field]
    if (value === undefined || same(value, member.branchStyle[field])) {
      return
    }
    changed = true
    nextBranchStyle[field] = clone(value) as never
  })
  if (!changed) {
    return
  }

  ctx.writer.mindmap(id).tree.patch(topicId, {
    branchStyle: nextBranchStyle
  })
}

export const emitMindmapTopicCollapse = (
  ctx: WhiteboardCompileContext,
  id: string,
  topicId: NodeId,
  collapsed?: boolean
) => {
  const current = ctx.reader.mindmap.get(id)
  if (!current) {
    return ctx.invalid(`Mindmap ${id} not found.`)
  }

  const member = readMindmapNodeValue(current, topicId)
  if (!member) {
    return ctx.invalid(`Topic ${topicId} not found.`)
  }

  const nextCollapsed = collapsed ?? !member.collapsed
  if (same(nextCollapsed, member.collapsed)) {
    return
  }

  ctx.writer.mindmap(id).tree.patch(topicId, {
    collapsed: nextCollapsed
  })
}

type MindmapIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'mindmap.create'
  | 'mindmap.delete'
  | 'mindmap.layout.set'
  | 'mindmap.move'
  | 'mindmap.topic.insert'
  | 'mindmap.topic.move'
  | 'mindmap.topic.delete'
  | 'mindmap.topic.clone'
  | 'mindmap.topic.update'
  | 'mindmap.topic.collapse.set'
  | 'mindmap.branch.update'
>

export const mindmapIntentHandlers = {
  'mindmap.create': (ctx) => compileMindmapCreate(
    ctx.services.layout.commit({
      kind: 'mindmap.create',
      input: ctx.intent.input,
      position: ctx.intent.input.position
    }).input,
    ctx
  ),
  'mindmap.delete': (ctx) => {
    ctx.intent.ids.forEach((id) => {
      emitMindmapDelete(ctx, id)
    })
  },
  'mindmap.layout.set': (ctx) => {
    emitMindmapLayout(ctx, ctx.intent.id, ctx.intent.layout)
  },
  'mindmap.move': (ctx) => {
    emitMindmapMove(ctx, ctx.intent.id, ctx.intent.position)
  },
  'mindmap.topic.insert': (ctx) => {
    const input = ctx.services.layout.commit({
      kind: 'mindmap.topic.insert',
      mindmapId: ctx.intent.id,
      input: ctx.intent.input
    }).input
    const nodeId = ctx.services.ids.node()
    const materialized = nodeApi.materialize.committed({
      node: createMindmapTopicNode(nodeId, ctx.intent.id, input),
      registries: ctx.services.registries
    })
    if (!materialized.ok) {
      return ctx.invalid('Mindmap topic node could not be materialized.')
    }
    emitMindmapTopicInsert(ctx, ctx.intent.id, input, materialized.data)
    return {
      nodeId
    }
  },
  'mindmap.topic.move': (ctx) => {
    emitMindmapTopicMove(ctx, ctx.intent.id, ctx.intent.input)
  },
  'mindmap.topic.delete': (ctx) => {
    emitMindmapTopicDelete(ctx, ctx.intent.id, ctx.intent.input.nodeId)
  },
  'mindmap.topic.clone': (ctx) => {
    const {
      intent
    } = ctx
    const mindmap = ctx.reader.mindmap.get(intent.id)
    if (!mindmap) {
      return ctx.invalid(`Mindmap ${intent.id} not found.`)
    }
    if (intent.input.nodeId === readMindmapRootId(mindmap)) {
      return ctx.invalid('Root topic clone is not supported by subtree clone.')
    }

    const sourceNode = readMindmapNode(mindmap, intent.input.nodeId)
    const sourceMember = readMindmapNodeValue(mindmap, intent.input.nodeId)
    const targetParentId = intent.input.parentId ?? sourceNode?.parentId
    if (!sourceMember || !targetParentId) {
      return ctx.invalid(`Topic ${intent.input.nodeId} cannot be cloned.`)
    }

    const map: Record<NodeId, NodeId> = {}
    const walk = (sourceId: NodeId) => {
      const nextId = ctx.services.ids.node()
      map[sourceId] = nextId
      const sourceNode = ctx.reader.node.get(sourceId)
      const parentId = sourceId === intent.input.nodeId
        ? targetParentId
        : map[readMindmapNode(mindmap, sourceId)?.parentId ?? '']
      if (!sourceNode || !parentId) {
        return
      }

      const source = readMindmapNodeValue(mindmap, sourceId)
      if (!source) {
        return
      }
      emitMindmapTopicInsert(ctx, intent.id, {
        kind: 'child',
        parentId,
        options: sourceId === intent.input.nodeId
          ? {
              index: intent.input.index,
              side: intent.input.side ?? source.side
            }
          : {
              side: source.side
            }
      }, {
        ...sourceNode,
        id: nextId,
        owner: {
          kind: 'mindmap',
          id: intent.id
        },
        position: { x: 0, y: 0 }
      })
      emitMindmapBranchPatch(ctx, intent.id, nextId, {
        color: source.branchStyle.color,
        line: source.branchStyle.line,
        width: source.branchStyle.width,
        stroke: source.branchStyle.stroke
      })
      if (source.collapsed !== undefined) {
        emitMindmapTopicCollapse(ctx, intent.id, nextId, source.collapsed)
      }

      readMindmapChildren(mindmap, sourceId).forEach(walk)
    }

    walk(intent.input.nodeId)
    return {
      nodeId: map[intent.input.nodeId]!,
      map
    }
  },
  'mindmap.topic.update': (ctx) => {
    ctx.intent.updates.forEach((entry) => {
      emitMindmapTopicPatch(
        ctx,
        ctx.intent.id,
        entry.topicId,
        nodeApi.update.toPatch(entry.input)
      )
    })
  },
  'mindmap.topic.collapse.set': (ctx) => {
    emitMindmapTopicCollapse(
      ctx,
      ctx.intent.id,
      ctx.intent.topicId,
      ctx.intent.collapsed
    )
  },
  'mindmap.branch.update': (ctx) => {
    ctx.intent.updates.forEach((entry) => {
      emitMindmapBranchPatch(
        ctx,
        ctx.intent.id,
        entry.topicId,
        entry.input.fields ?? {}
      )
    })
  }
} satisfies MindmapIntentHandlers
