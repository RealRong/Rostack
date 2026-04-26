import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import { node as nodeApi } from '@whiteboard/core/node'
import {
  createMindmapTopicNode,
  emitMindmapBranchUpdateOps,
  emitMindmapTopicUpdateOps
} from '@whiteboard/core/mindmap/ops'
import type {
  NodeId
} from '@whiteboard/core/types'
import type { WhiteboardIntentContext } from '@whiteboard/core/intent/context'
import type { MindmapIntent } from '@whiteboard/core/intent/types'

const compileMindmapCreate = (
  input: import('@whiteboard/core/types').MindmapCreateInput,
  ctx: WhiteboardIntentContext
) => {
  const mindmapId = input.id ?? ctx.tx.ids.mindmap()
  const rootId = ctx.tx.ids.node()
  const instantiated = mindmapApi.template.instantiate({
    template: input.template,
    rootId,
    createNodeId: ctx.tx.ids.node
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
    return ctx.tx.fail.invalid('Mindmap template nodes could not be materialized.')
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

  ctx.tx.emit({
    type: 'mindmap.create',
    mindmap: {
      id: mindmapId,
      root: rootId,
      members,
      children: instantiated.tree.children,
      layout: instantiated.tree.layout,
      meta: instantiated.tree.meta
    },
    nodes
  })

  return {
    mindmapId,
    rootId
  }
}

export const compileMindmapIntent = (
  intent: MindmapIntent,
  ctx: WhiteboardIntentContext
) => {
  switch (intent.type) {
    case 'mindmap.create':
      return compileMindmapCreate(intent.input, ctx)
    case 'mindmap.delete':
      intent.ids.forEach((id) => {
        ctx.tx.emit({
          type: 'mindmap.delete',
          id
        })
      })
      return
    case 'mindmap.layout.set':
      ctx.tx.emit({
        type: 'mindmap.layout',
        id: intent.id,
        patch: intent.layout
      })
      return
    case 'mindmap.move':
      ctx.tx.emit({
        type: 'mindmap.move',
        id: intent.id,
        position: intent.position
      })
      return
    case 'mindmap.topic.insert': {
      const nodeId = ctx.tx.ids.node()
      const materialized = nodeApi.materialize.committed({
        node: createMindmapTopicNode(nodeId, intent.id, intent.input),
        registries: ctx.registries
      })
      if (!materialized.ok) {
        return ctx.tx.fail.invalid('Mindmap topic node could not be materialized.')
      }
      ctx.tx.emit({
        type: 'mindmap.topic.insert',
        id: intent.id,
        input: intent.input,
        node: materialized.data
      })
      return {
        nodeId
      }
    }
    case 'mindmap.topic.move':
      ctx.tx.emit({
        type: 'mindmap.topic.move',
        id: intent.id,
        input: intent.input
      })
      return
    case 'mindmap.topic.delete':
      ctx.tx.emit({
        type: 'mindmap.topic.delete',
        id: intent.id,
        input: intent.input
      })
      return
    case 'mindmap.topic.clone': {
      const mindmap = ctx.tx.read.mindmap.get(intent.id)
      if (!mindmap) {
        return ctx.tx.fail.invalid(`Mindmap ${intent.id} not found.`)
      }
      if (intent.input.nodeId === mindmap.root) {
        return ctx.tx.fail.invalid('Root topic clone is not supported by subtree clone.')
      }

      const sourceMember = mindmap.members[intent.input.nodeId]
      const targetParentId = intent.input.parentId ?? sourceMember?.parentId
      if (!sourceMember || !targetParentId) {
        return ctx.tx.fail.invalid(`Topic ${intent.input.nodeId} cannot be cloned.`)
      }

      const document = ctx.tx.read.document.get()
      const map: Record<NodeId, NodeId> = {}
      const walk = (sourceId: NodeId) => {
        const nextId = ctx.tx.ids.node()
        map[sourceId] = nextId
        const sourceNode = document.nodes[sourceId]
        const parentId = sourceId === intent.input.nodeId
          ? targetParentId
          : map[mindmap.members[sourceId]?.parentId ?? '']
        if (!sourceNode || !parentId) {
          return
        }

        const source = mindmap.members[sourceId]
        ctx.tx.emit({
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
        ctx.tx.emit({
          type: 'mindmap.branch.field.set',
          id: intent.id,
          topicId: nextId,
          field: 'color',
          value: source.branchStyle.color
        })
        ctx.tx.emit({
          type: 'mindmap.branch.field.set',
          id: intent.id,
          topicId: nextId,
          field: 'line',
          value: source.branchStyle.line
        })
        ctx.tx.emit({
          type: 'mindmap.branch.field.set',
          id: intent.id,
          topicId: nextId,
          field: 'width',
          value: source.branchStyle.width
        })
        ctx.tx.emit({
          type: 'mindmap.branch.field.set',
          id: intent.id,
          topicId: nextId,
          field: 'stroke',
          value: source.branchStyle.stroke
        })
        if (source.collapsed !== undefined) {
          ctx.tx.emit({
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
    }
    case 'mindmap.topic.update':
      intent.updates.forEach((entry) => {
        emitMindmapTopicUpdateOps({
          mindmapId: intent.id,
          topicId: entry.topicId,
          update: entry.input,
          emit: ctx.tx.emit
        })
      })
      return
    case 'mindmap.topic.collapse.set':
      ctx.tx.emit({
        type: 'mindmap.topic.collapse',
        id: intent.id,
        topicId: intent.topicId,
        collapsed: intent.collapsed
      })
      return
    case 'mindmap.branch.update':
      intent.updates.forEach((entry) => {
        emitMindmapBranchUpdateOps({
          mindmapId: intent.id,
          topicId: entry.topicId,
          update: entry.input,
          emit: ctx.tx.emit
        })
      })
      return
  }
}
