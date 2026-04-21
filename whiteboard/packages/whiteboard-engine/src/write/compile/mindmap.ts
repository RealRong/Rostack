import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  MindmapBranchField,
  MindmapId,
  MindmapTopicField,
  Node,
  NodeId,
  Operation
} from '@whiteboard/core/types'
import type { MindmapCommand } from '@whiteboard/engine/types/command'
import type { CommandCompileContext } from '@whiteboard/engine/write/types'

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

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

const emitMindmapTopicUpdateOps = (
  mindmapId: MindmapId,
  topicId: NodeId,
  input: import('@whiteboard/core/types').MindmapTopicUpdateInput,
  ctx: CommandCompileContext
) => {
  const fields = input.fields
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
      ctx.tx.emit({
        type: 'mindmap.topic.field.unset',
        id: mindmapId,
        topicId,
        field: fieldMap[key] as Extract<Operation, { type: 'mindmap.topic.field.unset' }>['field']
      })
      return
    }

    ctx.tx.emit({
      type: 'mindmap.topic.field.set',
      id: mindmapId,
      topicId,
      field: fieldMap[key],
      value
    })
  })

  for (const record of input.records ?? []) {
    if (record.op === 'unset') {
      ctx.tx.emit({
        type: 'mindmap.topic.record.unset',
        id: mindmapId,
        topicId,
        scope: record.scope,
        path: record.path
      })
      continue
    }

    ctx.tx.emit({
      type: 'mindmap.topic.record.set',
      id: mindmapId,
      topicId,
      scope: record.scope,
      path: record.path ?? '',
      value: record.value
    })
  }
}

const emitMindmapBranchUpdateOps = (
  mindmapId: MindmapId,
  topicId: NodeId,
  input: import('@whiteboard/core/types').MindmapBranchUpdateInput,
  ctx: CommandCompileContext
) => {
  const fields = input.fields
  if (!fields) {
    return
  }

  ;(['color', 'line', 'width', 'stroke'] as const).forEach((field) => {
    if (!hasOwn(fields, field)) {
      return
    }

    const value = fields[field]
    if (value === undefined) {
      ctx.tx.emit({
        type: 'mindmap.branch.field.unset',
        id: mindmapId,
        topicId,
        field: field as MindmapBranchField
      })
      return
    }

    ctx.tx.emit({
      type: 'mindmap.branch.field.set',
      id: mindmapId,
      topicId,
      field: field as MindmapBranchField,
      value
    })
  })
}

const compileMindmapCreate = (
  input: import('@whiteboard/core/types').MindmapCreateInput,
  ctx: CommandCompileContext
) => {
  const mindmapId = input.id ?? ctx.tx.ids.mindmap()
  const rootId = ctx.tx.ids.node()
  const instantiated = mindmapApi.template.instantiate({
    template: input.template,
    rootId,
    createNodeId: ctx.tx.ids.node
  })

  const nodes = Object.entries(instantiated.nodes).map(([nodeId, templateNode]) => ({
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

export const compileMindmapCommand = (
  command: MindmapCommand,
  ctx: CommandCompileContext
) => {
  switch (command.type) {
    case 'mindmap.create':
      return compileMindmapCreate(command.input, ctx)
    case 'mindmap.delete':
      command.ids.forEach((id) => {
        ctx.tx.emit({
          type: 'mindmap.delete',
          id
        })
      })
      return
    case 'mindmap.layout.set':
      ctx.tx.emit({
        type: 'mindmap.layout',
        id: command.id,
        patch: command.layout
      })
      return
    case 'mindmap.move':
      ctx.tx.emit({
        type: 'mindmap.move',
        id: command.id,
        position: command.position
      })
      return
    case 'mindmap.topic.insert': {
      const nodeId = ctx.tx.ids.node()
      ctx.tx.emit({
        type: 'mindmap.topic.insert',
        id: command.id,
        input: command.input,
        node: createTopicNode(nodeId, command.id, command.input)
      })
      return {
        nodeId
      }
    }
    case 'mindmap.topic.move':
      ctx.tx.emit({
        type: 'mindmap.topic.move',
        id: command.id,
        input: command.input
      })
      return
    case 'mindmap.topic.delete':
      ctx.tx.emit({
        type: 'mindmap.topic.delete',
        id: command.id,
        input: command.input
      })
      return
    case 'mindmap.topic.clone': {
      const mindmap = ctx.tx.read.mindmap.get(command.id)
      if (!mindmap) {
        return ctx.tx.fail.invalid(`Mindmap ${command.id} not found.`)
      }
      if (command.input.nodeId === mindmap.root) {
        return ctx.tx.fail.invalid('Root topic clone is not supported by subtree clone.')
      }

      const sourceMember = mindmap.members[command.input.nodeId]
      const targetParentId = command.input.parentId ?? sourceMember?.parentId
      if (!sourceMember || !targetParentId) {
        return ctx.tx.fail.invalid(`Topic ${command.input.nodeId} cannot be cloned.`)
      }

      const document = ctx.tx.read.document.get()
      const map: Record<NodeId, NodeId> = {}
      const walk = (sourceId: NodeId) => {
        const nextId = ctx.tx.ids.node()
        map[sourceId] = nextId
        const sourceNode = document.nodes[sourceId]
        const parentId = sourceId === command.input.nodeId
          ? targetParentId
          : map[mindmap.members[sourceId]?.parentId ?? '']
        if (!sourceNode || !parentId) {
          return
        }

        const source = mindmap.members[sourceId]
        ctx.tx.emit({
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
        ctx.tx.emit({
          type: 'mindmap.branch.field.set',
          id: command.id,
          topicId: nextId,
          field: 'color',
          value: source.branchStyle.color
        })
        ctx.tx.emit({
          type: 'mindmap.branch.field.set',
          id: command.id,
          topicId: nextId,
          field: 'line',
          value: source.branchStyle.line
        })
        ctx.tx.emit({
          type: 'mindmap.branch.field.set',
          id: command.id,
          topicId: nextId,
          field: 'width',
          value: source.branchStyle.width
        })
        ctx.tx.emit({
          type: 'mindmap.branch.field.set',
          id: command.id,
          topicId: nextId,
          field: 'stroke',
          value: source.branchStyle.stroke
        })
        if (source.collapsed !== undefined) {
          ctx.tx.emit({
            type: 'mindmap.topic.collapse',
            id: command.id,
            topicId: nextId,
            collapsed: source.collapsed
          })
        }

        ;(mindmap.children[sourceId] ?? []).forEach(walk)
      }

      walk(command.input.nodeId)
      return {
        nodeId: map[command.input.nodeId]!,
        map
      }
    }
    case 'mindmap.topic.update':
      command.updates.forEach((entry) => {
        emitMindmapTopicUpdateOps(command.id, entry.topicId, entry.input, ctx)
      })
      return
    case 'mindmap.topic.collapse.set':
      ctx.tx.emit({
        type: 'mindmap.topic.collapse',
        id: command.id,
        topicId: command.topicId,
        collapsed: command.collapsed
      })
      return
    case 'mindmap.branch.update':
      command.updates.forEach((entry) => {
        emitMindmapBranchUpdateOps(command.id, entry.topicId, entry.input, ctx)
      })
      return
  }
}
