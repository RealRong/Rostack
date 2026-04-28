import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import {
  createMindmapTopicNode,
  emitMindmapBranchUpdateOps,
  emitMindmapTopicUpdateOps
} from '@whiteboard/core/mindmap/ops'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/operations/compile/helpers'
import {
  failInvalid,
  readCompileRegistries,
  readCompileServices
} from '@whiteboard/core/operations/compile/helpers'
import type { NodeId } from '@whiteboard/core/types'

const compileMindmapCreate = (
  input: import('@whiteboard/core/types').MindmapCreateInput,
  ctx: WhiteboardCompileContext
) => {
  const mindmapId = input.id ?? readCompileServices(ctx).ids.mindmap()
  const rootId = readCompileServices(ctx).ids.node()
  const instantiated = mindmapApi.template.instantiate({
    template: input.template,
    rootId,
    createNodeId: readCompileServices(ctx).ids.node
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
      registries: readCompileRegistries(ctx)
    })
    if (!materialized.ok) {
      return []
    }
    return [materialized.data]
  })

  if (nodes.length !== Object.keys(instantiated.nodes).length) {
    return failInvalid(ctx, 'Mindmap template nodes could not be materialized.')
  }

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

  ctx.emit({
    type: 'mindmap.create',
    mindmap: {
      id: mindmapId,
      root: rootId,
      members,
      children: instantiated.tree.children,
      layout: instantiated.tree.layout
    },
    nodes
  })

  ctx.output({
    mindmapId,
    rootId
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

export const mindmapIntentHandlers: MindmapIntentHandlers = {
  'mindmap.create': (ctx) => compileMindmapCreate(ctx.intent.input, ctx),
  'mindmap.delete': (ctx) => {
    ctx.intent.ids.forEach((id) => {
      ctx.emit({
        type: 'mindmap.delete',
        id
      })
    })
  },
  'mindmap.layout.set': (ctx) => {
    ctx.emit({
      type: 'mindmap.layout',
      id: ctx.intent.id,
      patch: ctx.intent.layout
    })
  },
  'mindmap.move': (ctx) => {
    ctx.emit({
      type: 'mindmap.move',
      id: ctx.intent.id,
      position: ctx.intent.position
    })
  },
  'mindmap.topic.insert': (ctx) => {
    const nodeId = readCompileServices(ctx).ids.node()
    const materialized = nodeApi.materialize.committed({
      node: createMindmapTopicNode(nodeId, ctx.intent.id, ctx.intent.input),
      registries: readCompileRegistries(ctx)
    })
    if (!materialized.ok) {
      return failInvalid(ctx, 'Mindmap topic node could not be materialized.')
    }
    ctx.emit({
      type: 'mindmap.topic.insert',
      id: ctx.intent.id,
      input: ctx.intent.input,
      node: materialized.data
    })
    ctx.output({
      nodeId
    })
  },
  'mindmap.topic.move': (ctx) => {
    ctx.emit({
      type: 'mindmap.topic.move',
      id: ctx.intent.id,
      input: ctx.intent.input
    })
  },
  'mindmap.topic.delete': (ctx) => {
    ctx.emit({
      type: 'mindmap.topic.delete',
      id: ctx.intent.id,
      input: ctx.intent.input
    })
  },
  'mindmap.topic.clone': (ctx) => {
    const {
      intent
    } = ctx
    const mindmap = ctx.document.mindmaps[intent.id]
    if (!mindmap) {
      return failInvalid(ctx, `Mindmap ${intent.id} not found.`)
    }
    if (intent.input.nodeId === mindmap.root) {
      return failInvalid(ctx, 'Root topic clone is not supported by subtree clone.')
    }

    const sourceMember = mindmap.members[intent.input.nodeId]
    const targetParentId = intent.input.parentId ?? sourceMember?.parentId
    if (!sourceMember || !targetParentId) {
      return failInvalid(ctx, `Topic ${intent.input.nodeId} cannot be cloned.`)
    }

    const document = ctx.document
    const map: Record<NodeId, NodeId> = {}
    const walk = (sourceId: NodeId) => {
      const nextId = readCompileServices(ctx).ids.node()
      map[sourceId] = nextId
      const sourceNode = document.nodes[sourceId]
      const parentId = sourceId === intent.input.nodeId
        ? targetParentId
        : map[mindmap.members[sourceId]?.parentId ?? '']
      if (!sourceNode || !parentId) {
        return
      }

      const source = mindmap.members[sourceId]
      ctx.emit({
        type: 'mindmap.topic.insert',
        id: intent.id,
        input: {
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
        },
        node: {
          ...sourceNode,
          id: nextId,
          owner: {
            kind: 'mindmap',
            id: intent.id
          },
          position: { x: 0, y: 0 }
        }
      })
      ctx.emit({
        type: 'mindmap.branch.patch',
        id: intent.id,
        topicId: nextId,
        patch: {
          color: source.branchStyle.color,
          line: source.branchStyle.line,
          width: source.branchStyle.width,
          stroke: source.branchStyle.stroke
        }
      })
      if (source.collapsed !== undefined) {
        ctx.emit({
          type: 'mindmap.topic.collapse',
          id: intent.id,
          topicId: nextId,
          collapsed: source.collapsed
        })
      }

      ;(mindmap.children[sourceId] ?? []).forEach(walk)
    }

    walk(intent.input.nodeId)
    ctx.output({
      nodeId: map[intent.input.nodeId]!,
      map
    })
  },
  'mindmap.topic.update': (ctx) => {
    ctx.intent.updates.forEach((entry) => {
      emitMindmapTopicUpdateOps({
        mindmapId: ctx.intent.id,
        topicId: entry.topicId,
        update: entry.input,
        emit: ctx.emit
      })
    })
  },
  'mindmap.topic.collapse.set': (ctx) => {
    ctx.emit({
      type: 'mindmap.topic.collapse',
      id: ctx.intent.id,
      topicId: ctx.intent.topicId,
      collapsed: ctx.intent.collapsed
    })
  },
  'mindmap.branch.update': (ctx) => {
    ctx.intent.updates.forEach((entry) => {
      emitMindmapBranchUpdateOps({
        mindmapId: ctx.intent.id,
        topicId: entry.topicId,
        update: entry.input,
        emit: ctx.emit
      })
    })
  }
}
