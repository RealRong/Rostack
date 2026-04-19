import {
  buildInsertSliceOperations,
  exportSliceFromSelection,
  getEdge,
  getMindmap,
  getNode,
  listCanvasItemRefs,
  listGroupCanvasItemRefs
} from '@whiteboard/core/document'
import {
  buildEdgeCreateOperation,
  clearRoute,
  insertRoutePoint,
  moveEdge,
  moveEdgeRoute,
  moveRoutePoint,
  removeRoutePoint
} from '@whiteboard/core/edge'
import {
  instantiateMindmapTemplate
} from '@whiteboard/core/mindmap'
import { resolveLockDecision } from '@whiteboard/core/lock'
import {
  buildNodeAlignOperations,
  buildNodeCreateOperation,
  buildNodeDistributeOperations,
  applyNodeUpdate
} from '@whiteboard/core/node'
import type {
  CoreRegistries,
  Document,
  EdgeId,
  GroupId,
  MindmapCreateInput,
  MindmapId,
  MindmapInsertPayload,
  Node,
  NodeId,
  NodeInput,
  NodePatch,
  Operation
} from '@whiteboard/core/types'
import { err, ok } from '@whiteboard/core/result'
import type { Result } from '@whiteboard/core/types/result'
import type { EngineCommand } from '@whiteboard/engine/types/command'

type IdAllocator = {
  node: () => NodeId
  edge: () => EdgeId
  group: () => GroupId
  mindmap: () => MindmapId
  mindmapNode: () => NodeId
}

type PlannerContext = {
  doc: Document
  registries: CoreRegistries
  ids: IdAllocator
  nodeSize: { width: number; height: number }
}

type PlanResult<T = unknown> = Result<{
  operations: Operation[]
  output: T
}, 'invalid' | 'cancelled'>

const failLocked = (
  reason: 'locked-node' | 'locked-edge' | 'locked-relation' | undefined,
  action: 'modified' | 'duplicated'
): PlanResult => {
  if (reason === 'locked-node') {
    return err('cancelled', `Locked nodes cannot be ${action}.`)
  }
  if (reason === 'locked-edge') {
    return err('cancelled', `Locked edges cannot be ${action}.`)
  }
  return err('cancelled', `Locked node relations cannot be ${action}.`)
}

const isNodeRef = (
  operation: Operation
): operation is Extract<Operation, { type: 'node.create' }> =>
  operation.type === 'node.create'

const createTopicData = (
  payload?: MindmapInsertPayload | { kind: string; [key: string]: unknown }
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

const createTopicNode = (
  id: NodeId,
  mindmapId: MindmapId,
  input?: import('@whiteboard/core/types').MindmapInsertInput
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

const readNodeMindmapId = (
  node: Pick<Node, 'owner'> | undefined
): MindmapId | undefined => (
  node?.owner?.kind === 'mindmap'
    ? node.owner.id
    : undefined
)

const isMindmapRoot = (
  doc: Document,
  node: Node | undefined
) => {
  const mindmapId = readNodeMindmapId(node)
  if (!mindmapId || !node) {
    return false
  }
  return doc.mindmaps[mindmapId]?.root === node.id
}

const reorderRefs = (
  current: readonly { kind: 'node' | 'edge'; id: string }[],
  refs: readonly { kind: 'node' | 'edge'; id: string }[],
  mode: 'set' | 'front' | 'back' | 'forward' | 'backward'
) => {
  const next = [...current]
  const selected = refs.filter((ref) => next.some((entry) => entry.kind === ref.kind && entry.id === ref.id))
  if (!selected.length) {
    return next
  }
  const isSelected = (entry: typeof next[number]) =>
    selected.some((ref) => ref.kind === entry.kind && ref.id === entry.id)

  if (mode === 'set') {
    return [...refs]
  }

  const rest = next.filter((entry) => !isSelected(entry))
  if (mode === 'front') {
    return [...rest, ...selected]
  }
  if (mode === 'back') {
    return [...selected, ...rest]
  }

  if (mode === 'forward') {
    const items = [...next]
    for (let index = items.length - 2; index >= 0; index -= 1) {
      if (isSelected(items[index]) && !isSelected(items[index + 1])) {
        const temp = items[index]
        items[index] = items[index + 1]
        items[index + 1] = temp
      }
    }
    return items
  }

  const items = [...next]
  for (let index = 1; index < items.length; index += 1) {
    if (isSelected(items[index]) && !isSelected(items[index - 1])) {
      const temp = items[index]
      items[index] = items[index - 1]
      items[index - 1] = temp
    }
  }
  return items
}

const planNodePatch = (
  doc: Document,
  nodeId: NodeId,
  update: import('@whiteboard/core/types').NodeUpdateInput
): Result<Operation[], 'invalid'> => {
  const node = getNode(doc, nodeId)
  if (!node) {
    return err('invalid', `Node ${nodeId} not found.`)
  }

  const ops: Operation[] = []
  const applied = applyNodeUpdate(node, update)
  if (!applied.ok) {
    return err('invalid', applied.message)
  }

  const mindmapId = readNodeMindmapId(node)
  if (!mindmapId) {
    ops.push({
      type: 'node.patch',
      id: nodeId,
      patch: applied.patch
    })
    return ok(ops)
  }

  const fields = update.fields
  const isRoot = isMindmapRoot(doc, node)

  if (fields?.position) {
    if (!isRoot) {
      return err('invalid', 'Mindmap member position is reconcile-owned.')
    }
    ops.push({
      type: 'mindmap.root.move',
      id: mindmapId,
      position: fields.position
    })
  }

  const topicPatch: NodePatch = {
    size: fields?.size,
    rotation: fields?.rotation,
    locked: fields?.locked,
    data: applied.patch.data,
    style: applied.patch.style
  }
  if (topicPatch.size || topicPatch.rotation !== undefined || topicPatch.locked !== undefined || topicPatch.data || topicPatch.style) {
    ops.push({
      type: 'mindmap.topic.patch',
      id: mindmapId,
      topicIds: [nodeId],
      patch: topicPatch
    })
  }

  return ok(ops)
}

const planMindmapCreate = (
  input: MindmapCreateInput,
  ctx: PlannerContext
): PlanResult<{ mindmapId: MindmapId; rootId: NodeId }> => {
  const mindmapId = input.id ?? ctx.ids.mindmap()
  const instantiated = instantiateMindmapTemplate({
    template: input.template,
    rootId: mindmapId,
    createNodeId: ctx.ids.mindmapNode
  })

  const nodes = Object.entries(instantiated.nodes).map(([nodeId, templateNode]) => ({
    id: nodeId,
    type: templateNode.type ?? 'text',
    owner: {
      kind: 'mindmap' as const,
      id: mindmapId
    },
    position: nodeId === mindmapId
      ? (input.position ?? { x: 0, y: 0 })
      : { x: 0, y: 0 },
    size: templateNode.size,
    rotation: templateNode.rotation,
    locked: templateNode.locked,
    data: templateNode.data,
    style: templateNode.style
  }))
  const members = Object.fromEntries(
    Object.entries(instantiated.tree.nodes).map(([nodeId, member]) => [
      nodeId,
      {
        parentId: member.parentId,
        side: member.side,
        collapsed: member.collapsed,
        branchStyle: member.branch
      }
    ])
  )

  return ok({
    operations: [{
      type: 'mindmap.create',
      mindmap: {
        id: mindmapId,
        root: instantiated.tree.rootNodeId,
        members,
        children: instantiated.tree.children,
        layout: instantiated.tree.layout,
        meta: instantiated.tree.meta
      },
      nodes
    }],
    output: {
      mindmapId,
      rootId: instantiated.tree.rootNodeId
    }
  })
}

export const planCommand = (
  command: EngineCommand,
  ctx: PlannerContext
): PlanResult => {
  const doc = ctx.doc

  switch (command.type) {
    case 'document.insert': {
      const built = buildInsertSliceOperations({
        doc,
        slice: command.slice,
        nodeSize: ctx.nodeSize,
        registries: ctx.registries,
        createNodeId: ctx.ids.node,
        createEdgeId: ctx.ids.edge,
        origin: command.options?.origin,
        roots: command.options?.roots
      })
      if (!built.ok) {
        return built
      }
      return ok({
        operations: built.data.operations,
        output: {
          nodeIds: built.data.allNodeIds,
          edgeIds: built.data.allEdgeIds,
          roots: built.data.roots
        }
      })
    }
    case 'canvas.delete': {
      const decision = resolveLockDecision({
        document: doc,
        target: {
          kind: 'refs',
          refs: command.refs,
          includeEdgeRelations: true
        }
      })
      if (!decision.allowed) {
        return failLocked(decision.reason, 'modified')
      }

      const operations: Operation[] = []
      command.refs.forEach((ref) => {
        if (ref.kind === 'edge') {
          operations.push({
            type: 'edge.delete',
            id: ref.id
          })
          return
        }
        const node = doc.nodes[ref.id]
        const mindmapId = readNodeMindmapId(node)
        if (!mindmapId) {
          operations.push({
            type: 'node.delete',
            id: ref.id
          })
          return
        }
        operations.push(
          isMindmapRoot(doc, node)
            ? {
                type: 'mindmap.delete',
                id: mindmapId
              }
            : {
                type: 'mindmap.topic.delete',
                id: mindmapId,
                input: {
                  nodeId: ref.id
                }
              }
        )
      })
      return ok({
        operations,
        output: undefined
      })
    }
    case 'canvas.duplicate': {
      const decision = resolveLockDecision({
        document: doc,
        target: {
          kind: 'refs',
          refs: command.refs,
          includeEdgeRelations: true
        }
      })
      if (!decision.allowed) {
        return failLocked(decision.reason, 'duplicated')
      }

      const nodeIds = command.refs.filter((ref) => ref.kind === 'node').map((ref) => ref.id)
      if (nodeIds.some((nodeId) => readNodeMindmapId(doc.nodes[nodeId]))) {
        return err('invalid', 'Mindmap duplication must use dedicated mindmap commands.')
      }
      const edgeIds = command.refs.filter((ref) => ref.kind === 'edge').map((ref) => ref.id)
      const exported = exportSliceFromSelection({
        doc,
        nodeIds,
        edgeIds,
        nodeSize: ctx.nodeSize
      })
      if (!exported.ok) {
        return exported
      }
      const built = buildInsertSliceOperations({
        doc,
        slice: exported.data.slice,
        nodeSize: ctx.nodeSize,
        registries: ctx.registries,
        createNodeId: ctx.ids.node,
        createEdgeId: ctx.ids.edge,
        delta: {
          x: 24,
          y: 24
        },
        roots: exported.data.roots
      })
      if (!built.ok) {
        return built
      }
      return ok({
        operations: built.data.operations,
        output: {
          nodeIds: built.data.allNodeIds,
          edgeIds: built.data.allEdgeIds,
          roots: built.data.roots
        }
      })
    }
    case 'document.background':
      return ok({
        operations: [{
          type: 'document.background',
          background: command.background
        }],
        output: undefined
      })
    case 'canvas.order':
      return ok({
        operations: [{
          type: 'canvas.order',
          refs: reorderRefs(listCanvasItemRefs(doc), command.refs, command.mode)
        }],
        output: undefined
      })
    case 'node.create': {
      const built = buildNodeCreateOperation({
        payload: command.input as NodeInput,
        doc,
        registries: ctx.registries,
        createNodeId: ctx.ids.node
      })
      if (!built.ok) {
        return built
      }
      return ok({
        operations: [built.data.operation],
        output: {
          nodeId: built.data.nodeId
        }
      })
    }
    case 'node.move': {
      const decision = resolveLockDecision({
        document: doc,
        target: {
          kind: 'nodes',
          nodeIds: command.ids
        }
      })
      if (!decision.allowed) {
        return failLocked(decision.reason, 'modified')
      }

      const operations: Operation[] = []
      for (const id of command.ids) {
        const node = doc.nodes[id]
        if (!node) {
          return err('invalid', `Node ${id} not found.`)
        }
        const mindmapId = readNodeMindmapId(node)
        if (!mindmapId) {
          operations.push({
            type: 'node.move',
            id,
            delta: command.delta
          })
          continue
        }
        if (!isMindmapRoot(doc, node)) {
          return err('invalid', 'Mindmap member move must use mindmap drag.')
        }
        operations.push({
          type: 'mindmap.root.move',
          id: mindmapId,
          position: {
            x: node.position.x + command.delta.x,
            y: node.position.y + command.delta.y
          }
        })
      }
      return ok({
        operations,
        output: undefined
      })
    }
    case 'node.patch': {
      const decision = resolveLockDecision({
        document: doc,
        target: {
          kind: 'nodes',
          nodeIds: command.updates.map((entry) => entry.id)
        }
      })
      if (!decision.allowed) {
        return failLocked(decision.reason, 'modified')
      }

      const operations: Operation[] = []
      for (const entry of command.updates) {
        const planned = planNodePatch(doc, entry.id, entry.update)
        if (!planned.ok) {
          return planned
        }
        operations.push(...planned.data)
      }
      return ok({
        operations,
        output: undefined
      })
    }
    case 'node.align': {
      const built = buildNodeAlignOperations({
        ids: command.ids,
        doc,
        nodeSize: ctx.nodeSize,
        mode: command.mode
      })
      return built.ok
        ? ok({ operations: built.data.operations, output: undefined })
        : built
    }
    case 'node.distribute': {
      const built = buildNodeDistributeOperations({
        ids: command.ids,
        doc,
        nodeSize: ctx.nodeSize,
        mode: command.mode
      })
      return built.ok
        ? ok({ operations: built.data.operations, output: undefined })
        : built
    }
    case 'node.delete':
    case 'node.deleteCascade':
      return planCommand({
        type: 'canvas.delete',
        refs: command.ids.map((id) => ({ kind: 'node' as const, id }))
      }, ctx)
    case 'node.duplicate':
      return planCommand({
        type: 'canvas.duplicate',
        refs: command.ids.map((id) => ({ kind: 'node' as const, id }))
      }, ctx)
    case 'group.merge': {
      const groupId = ctx.ids.group()
      const operations: Operation[] = [{
        type: 'group.create',
        group: {
          id: groupId
        }
      }]
      command.target.nodeIds?.forEach((nodeId) => {
        operations.push({
          type: 'node.patch',
          id: nodeId,
          patch: {
            groupId
          }
        })
      })
      command.target.edgeIds?.forEach((edgeId) => {
        operations.push({
          type: 'edge.patch',
          id: edgeId,
          patch: {
            groupId
          }
        })
      })
      return ok({
        operations,
        output: {
          groupId
        }
      })
    }
    case 'group.order': {
      const refs = command.ids.flatMap((groupId) => listGroupCanvasItemRefs(doc, groupId))
      return ok({
        operations: [{
          type: 'canvas.order',
          refs: reorderRefs(listCanvasItemRefs(doc), refs, command.mode)
        }],
        output: undefined
      })
    }
    case 'group.ungroup': {
      const refs = listGroupCanvasItemRefs(doc, command.id)
      const operations: Operation[] = [{
        type: 'group.delete',
        id: command.id
      }]
      refs.forEach((ref) => {
        if (ref.kind === 'node') {
          operations.push({
            type: 'node.patch',
            id: ref.id,
            patch: {
              groupId: undefined
            }
          })
        } else {
          operations.push({
            type: 'edge.patch',
            id: ref.id,
            patch: {
              groupId: undefined
            }
          })
        }
      })
      return ok({
        operations,
        output: {
          nodeIds: refs.filter((ref) => ref.kind === 'node').map((ref) => ref.id),
          edgeIds: refs.filter((ref) => ref.kind === 'edge').map((ref) => ref.id)
        }
      })
    }
    case 'group.ungroupMany': {
      const nodeIds: NodeId[] = []
      const edgeIds: EdgeId[] = []
      const operations: Operation[] = []
      for (const groupId of command.ids) {
        const refs = listGroupCanvasItemRefs(doc, groupId)
        operations.push({
          type: 'group.delete',
          id: groupId
        })
        refs.forEach((ref) => {
          if (ref.kind === 'node') {
            nodeIds.push(ref.id)
            operations.push({
              type: 'node.patch',
              id: ref.id,
              patch: {
                groupId: undefined
              }
            })
          } else {
            edgeIds.push(ref.id)
            operations.push({
              type: 'edge.patch',
              id: ref.id,
              patch: {
                groupId: undefined
              }
            })
          }
        })
      }
      return ok({
        operations,
        output: {
          nodeIds,
          edgeIds
        }
      })
    }
    case 'edge.create': {
      const built = buildEdgeCreateOperation({
        payload: command.input,
        doc,
        registries: ctx.registries,
        createEdgeId: ctx.ids.edge
      })
      if (!built.ok) {
        return built
      }
      return ok({
        operations: [built.data.operation],
        output: {
          edgeId: built.data.edgeId
        }
      })
    }
    case 'edge.move': {
      const decision = resolveLockDecision({
        document: doc,
        target: {
          kind: 'edge-ids',
          edgeIds: command.ids
        }
      })
      if (!decision.allowed) {
        return failLocked(decision.reason, 'modified')
      }

      const operations = command.ids.flatMap((edgeId) => {
        const edge = getEdge(doc, edgeId)
        const patch = edge ? moveEdge(edge, command.delta) ?? moveEdgeRoute(edge, command.delta) : undefined
        return patch
          ? [{
              type: 'edge.patch' as const,
              id: edgeId,
              patch
            }]
          : []
      })
      return ok({ operations, output: undefined })
    }
    case 'edge.reconnect':
      {
        const decision = resolveLockDecision({
          document: doc,
          target: {
            kind: 'edge-ids',
            edgeIds: [command.edgeId]
          }
        })
        if (!decision.allowed) {
          return failLocked(decision.reason, 'modified')
        }
      }
      return ok({
        operations: [{
          type: 'edge.patch',
          id: command.edgeId,
          patch: command.end === 'source'
            ? { source: command.target }
            : { target: command.target }
        }],
        output: undefined
      })
    case 'edge.patch':
      {
        const decision = resolveLockDecision({
          document: doc,
          target: {
            kind: 'edge-ids',
            edgeIds: command.updates.map((entry) => entry.id)
          }
        })
        if (!decision.allowed) {
          return failLocked(decision.reason, 'modified')
        }
      }
      return ok({
        operations: command.updates.map((entry) => ({
          type: 'edge.patch' as const,
          id: entry.id,
          patch: entry.patch
        })),
        output: undefined
      })
    case 'edge.delete':
      {
        const decision = resolveLockDecision({
          document: doc,
          target: {
            kind: 'edge-ids',
            edgeIds: command.ids
          }
        })
        if (!decision.allowed) {
          return failLocked(decision.reason, 'modified')
        }
      }
      return ok({
        operations: command.ids.map((id) => ({
          type: 'edge.delete' as const,
          id
        })),
        output: undefined
      })
    case 'edge.route.insert': {
      const edge = getEdge(doc, command.edgeId)
      if (!edge) {
        return err('invalid', `Edge ${command.edgeId} not found.`)
      }
      const inserted = insertRoutePoint(edge, Number.MAX_SAFE_INTEGER, command.point)
      if (!inserted.ok) {
        return inserted
      }
      return ok({
        operations: [{
          type: 'edge.patch',
          id: command.edgeId,
          patch: inserted.data.patch
        }],
        output: {
          index: inserted.data.index
        }
      })
    }
    case 'edge.route.move': {
      const edge = getEdge(doc, command.edgeId)
      const patch = edge ? moveRoutePoint(edge, command.index, command.point) : undefined
      if (!patch) {
        return err('invalid', `Edge ${command.edgeId} route point not found.`)
      }
      return ok({
        operations: [{
          type: 'edge.patch',
          id: command.edgeId,
          patch
        }],
        output: undefined
      })
    }
    case 'edge.route.remove': {
      const edge = getEdge(doc, command.edgeId)
      const patch = edge ? removeRoutePoint(edge, command.index) : undefined
      if (!patch) {
        return err('invalid', `Edge ${command.edgeId} route point not found.`)
      }
      return ok({
        operations: [{
          type: 'edge.patch',
          id: command.edgeId,
          patch
        }],
        output: undefined
      })
    }
    case 'edge.route.clear': {
      const edge = getEdge(doc, command.edgeId)
      if (!edge) {
        return err('invalid', `Edge ${command.edgeId} not found.`)
      }
      return ok({
        operations: [{
          type: 'edge.patch',
          id: command.edgeId,
          patch: clearRoute(edge)
        }],
        output: undefined
      })
    }
    case 'mindmap.create':
      return planMindmapCreate(command.input, ctx)
    case 'mindmap.delete':
      return ok({
        operations: command.ids.map((id) => ({
          type: 'mindmap.delete' as const,
          id
        })),
        output: undefined
      })
    case 'mindmap.topic.insert': {
      const mindmapId = command.id
      const nodeId = ctx.ids.mindmapNode()
      return ok({
        operations: [{
          type: 'mindmap.topic.insert',
          id: mindmapId,
          input: command.input,
          node: createTopicNode(nodeId, mindmapId, command.input)
        }],
        output: {
          nodeId
        }
      })
    }
    case 'mindmap.topic.move':
      return ok({
        operations: [{
          type: 'mindmap.topic.move',
          id: command.id,
          input: command.input
        }],
        output: undefined
      })
    case 'mindmap.topic.delete':
      return ok({
        operations: [{
          type: 'mindmap.topic.delete',
          id: command.id,
          input: command.input
        }],
        output: undefined
      })
    case 'mindmap.topic.clone': {
      const mindmap = getMindmap(doc, command.id)
      if (!mindmap) {
        return err('invalid', `Mindmap ${command.id} not found.`)
      }
      if (command.input.nodeId === mindmap.root) {
        return err('invalid', 'Root topic clone is not supported by subtree clone.')
      }
      const sourceMember = mindmap.members[command.input.nodeId]
      const targetParentId = command.input.parentId ?? sourceMember?.parentId
      if (!sourceMember || !targetParentId) {
        return err('invalid', `Topic ${command.input.nodeId} cannot be cloned.`)
      }

      const map: Record<NodeId, NodeId> = {}
      const operations: Operation[] = []
      const walk = (sourceId: NodeId) => {
        const nextId = ctx.ids.mindmapNode()
        map[sourceId] = nextId
        const sourceNode = doc.nodes[sourceId]
        const parentId = sourceId === command.input.nodeId
          ? targetParentId
          : map[mindmap.members[sourceId]?.parentId ?? '']
        if (!sourceNode || !parentId) {
          return
        }

        const source = mindmap.members[sourceId]
        operations.push({
          type: 'mindmap.topic.insert',
          id: command.id,
          input: {
            kind: 'child',
            parentId,
            options: sourceId === command.input.nodeId
              ? {
                  index: command.input.index,
                  side: command.input.side ?? source.side
                }
              : {
                  side: source.side
                }
          },
          node: {
            ...sourceNode,
            id: nextId,
            owner: {
              kind: 'mindmap',
              id: command.id
            },
            position: { x: 0, y: 0 }
          }
        })
        operations.push({
          type: 'mindmap.branch.patch',
          id: command.id,
          topicIds: [nextId],
          patch: source.branchStyle
        })
        if (source.collapsed !== undefined) {
          operations.push({
            type: 'mindmap.topic.collapse',
            id: command.id,
            topicId: nextId,
            collapsed: source.collapsed
          })
        }

        ;(mindmap.children[sourceId] ?? []).forEach(walk)
      }

      walk(command.input.nodeId)
      return ok({
        operations,
        output: {
          nodeId: map[command.input.nodeId]!,
          map
        }
      })
    }
    case 'mindmap.layout':
      return ok({
        operations: [{
          type: 'mindmap.layout',
          id: command.id,
          patch: command.patch
        }],
        output: undefined
      })
    case 'mindmap.topic.patch':
      return ok({
        operations: [{
          type: 'mindmap.topic.patch',
          id: command.id,
          topicIds: command.topicIds,
          patch: command.patch
        }],
        output: undefined
      })
    case 'mindmap.branch.patch':
      return ok({
        operations: [{
          type: 'mindmap.branch.patch',
          id: command.id,
          topicIds: command.topicIds,
          patch: command.patch
        }],
        output: undefined
      })
    case 'mindmap.topic.collapse':
      return ok({
        operations: [{
          type: 'mindmap.topic.collapse',
          id: command.id,
          topicId: command.topicId,
          collapsed: command.collapsed
        }],
        output: undefined
      })
    default:
      return err('invalid', `Unsupported command ${(command as { type: string }).type}.`)
  }
}
