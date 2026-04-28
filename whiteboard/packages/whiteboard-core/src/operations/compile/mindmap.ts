import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import {
  createMindmapTopicNode,
  emitMindmapBranchUpdateOps,
  emitMindmapTopicUpdateOps
} from '@whiteboard/core/mindmap/ops'
import { node as nodeApi } from '@whiteboard/core/node'
import type { WhiteboardScopedIntentHandlers } from '@whiteboard/core/operations/compile/contracts'
import type { WhiteboardCompileScope } from '@whiteboard/core/operations/compile/scope'
import type {
  MindmapIntent,
} from '@whiteboard/core/operations/intent-types'
import type { NodeId } from '@whiteboard/core/types'

const compileMindmapCreate = (
  input: import('@whiteboard/core/types').MindmapCreateInput,
  ctx: WhiteboardCompileScope
) => {
  const mindmapId = input.id ?? ctx.ids.mindmap()
  const rootId = ctx.ids.node()
  const instantiated = mindmapApi.template.instantiate({
    template: input.template,
    rootId,
    createNodeId: ctx.ids.node
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
      registries: ctx.registries
    })
    if (!materialized.ok) {
      return []
    }
    return [materialized.data]
  })

  if (nodes.length !== Object.keys(instantiated.nodes).length) {
    return ctx.fail.invalid('Mindmap template nodes could not be materialized.')
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

  return {
    mindmapId,
    rootId
  }
}

type MindmapIntentHandlers = Pick<
  WhiteboardScopedIntentHandlers,
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
  'mindmap.create': (intent, ctx) => compileMindmapCreate(intent.input, ctx),
  'mindmap.delete': (intent, ctx) => {
    intent.ids.forEach((id) => {
      ctx.emit({
        type: 'mindmap.delete',
        id
      })
    })
  },
  'mindmap.layout.set': (intent, ctx) => {
    ctx.emit({
      type: 'mindmap.layout',
      id: intent.id,
      patch: intent.layout
    })
  },
  'mindmap.move': (intent, ctx) => {
    ctx.emit({
      type: 'mindmap.move',
      id: intent.id,
      position: intent.position
    })
  },
  'mindmap.topic.insert': (intent, ctx) => {
    const nodeId = ctx.ids.node()
    const materialized = nodeApi.materialize.committed({
      node: createMindmapTopicNode(nodeId, intent.id, intent.input),
      registries: ctx.registries
    })
    if (!materialized.ok) {
      return ctx.fail.invalid('Mindmap topic node could not be materialized.')
    }
    ctx.emit({
      type: 'mindmap.topic.insert',
      id: intent.id,
      input: intent.input,
      node: materialized.data
    })
    return {
      nodeId
    }
  },
  'mindmap.topic.move': (intent, ctx) => {
    ctx.emit({
      type: 'mindmap.topic.move',
      id: intent.id,
      input: intent.input
    })
  },
  'mindmap.topic.delete': (intent, ctx) => {
    ctx.emit({
      type: 'mindmap.topic.delete',
      id: intent.id,
      input: intent.input
    })
  },
  'mindmap.topic.clone': (intent, ctx) => {
    const mindmap = ctx.read.mindmap(intent.id)
    if (!mindmap) {
      return ctx.fail.invalid(`Mindmap ${intent.id} not found.`)
    }
    if (intent.input.nodeId === mindmap.root) {
      return ctx.fail.invalid('Root topic clone is not supported by subtree clone.')
    }

    const sourceMember = mindmap.members[intent.input.nodeId]
    const targetParentId = intent.input.parentId ?? sourceMember?.parentId
    if (!sourceMember || !targetParentId) {
      return ctx.fail.invalid(`Topic ${intent.input.nodeId} cannot be cloned.`)
    }

    const document = ctx.read.document()
    const map: Record<NodeId, NodeId> = {}
    const walk = (sourceId: NodeId) => {
      const nextId = ctx.ids.node()
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
    return {
      nodeId: map[intent.input.nodeId]!,
      map
    }
  },
  'mindmap.topic.update': (intent, ctx) => {
    intent.updates.forEach((entry) => {
      emitMindmapTopicUpdateOps({
        mindmapId: intent.id,
        topicId: entry.topicId,
        update: entry.input,
        emit: ctx.emit
      })
    })
  },
  'mindmap.topic.collapse.set': (intent, ctx) => {
    ctx.emit({
      type: 'mindmap.topic.collapse',
      id: intent.id,
      topicId: intent.topicId,
      collapsed: intent.collapsed
    })
  },
  'mindmap.branch.update': (intent, ctx) => {
    intent.updates.forEach((entry) => {
      emitMindmapBranchUpdateOps({
        mindmapId: intent.id,
        topicId: entry.topicId,
        update: entry.input,
        emit: ctx.emit
      })
    })
  }
}
