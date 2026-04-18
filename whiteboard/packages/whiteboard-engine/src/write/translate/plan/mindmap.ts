import type { CommandOutput, MindmapCommand } from '@whiteboard/engine/types/command'
import { getNode } from '@whiteboard/core/document'
import {
  cloneSubtree as cloneTree,
  insertNode,
  moveSubtree as moveTree,
  patchMindmap,
  removeSubtree as removeTree,
  type MindmapCommandResult
} from '@whiteboard/core/mindmap'
import {
  anchorMindmapLayout,
  computeMindmapLayout,
  createMindmapCreateOp,
  getMindmapTreeFromDocument,
  instantiateMindmapTemplate,
  getSubtreeIds
} from '@whiteboard/core/mindmap'
import {
  resolveNodeBootstrapSize
} from '@whiteboard/core/node'
import { err, ok } from '@whiteboard/core/result'
import type {
  Document,
  MindmapId,
  MindmapNodeId,
  MindmapTree,
  Node,
  NodeData,
  NodeInput,
  SpatialNode
} from '@whiteboard/core/types'
import type { WriteTranslateContext } from '@whiteboard/engine/write/translate'
import type { Step } from '@whiteboard/engine/write/translate/plan/shared'

const treeOf = (
  doc: Document,
  id: MindmapId
): MindmapTree | undefined => getMindmapTreeFromDocument(doc, id)

const asSpatial = (
  node: Node | undefined
): SpatialNode | undefined => node

const createNodeOp = (
  node: Node
) => ({
  type: 'node.create' as const,
  node
})

const createNodeDeleteOps = (
  nodeIds: readonly MindmapNodeId[]
) => nodeIds.map((id) => ({
  type: 'node.delete' as const,
  id
}))

const cloneNodeStyle = (
  style: Node['style']
) => style
  ? { ...style }
  : undefined

const cloneNodeData = (
  data: Node['data']
) => data
  ? { ...data }
  : undefined

const readNodeSize = (
  node: Pick<Node, 'size' | 'style' | 'type'> | undefined,
  fallback: WriteTranslateContext['config']['mindmapNodeSize']
) => {
  const bootstrap = node
    ? resolveNodeBootstrapSize(node)
    : undefined

  return {
    width: Math.max(node?.size?.width ?? bootstrap?.width ?? fallback.width, 1),
    height: Math.max(node?.size?.height ?? bootstrap?.height ?? fallback.height, 1)
  }
}

const toNode = (
  id: MindmapNodeId,
  mindmapId: MindmapId,
  position: SpatialNode['position'],
  input: Omit<NodeInput, 'id' | 'position'>
): Node => ({
  id,
  mindmapId,
  position: {
    x: position.x,
    y: position.y
  },
  type: input.type,
  size: input.size
    ? { ...input.size }
    : resolveNodeBootstrapSize(input),
  rotation: input.rotation,
  layer: input.layer,
  zIndex: input.zIndex,
  locked: input.locked,
  data: cloneNodeData(input.data),
  style: cloneNodeStyle(input.style)
})

const createBlankTextNodeInput = (
  topic?: unknown,
  template?: Node
): Omit<NodeInput, 'id' | 'position'> => ({
  type: template?.type ?? 'text',
  data: {
    text: readMindmapInsertText(topic)
  },
  style: cloneNodeStyle(template?.style)
})

const readMindmapInsertText = (
  topic?: unknown
) => {
  if (!topic || typeof topic !== 'object') {
    return 'Topic'
  }

  const entry = topic as {
    text?: unknown
    title?: unknown
    name?: unknown
    url?: unknown
  }

  if (typeof entry.text === 'string' && entry.text.trim()) {
    return entry.text
  }
  if (typeof entry.title === 'string' && entry.title.trim()) {
    return entry.title
  }
  if (typeof entry.name === 'string' && entry.name.trim()) {
    return entry.name
  }
  if (typeof entry.url === 'string' && entry.url.trim()) {
    return entry.url
  }

  return 'Topic'
}

const findInsertTemplateNode = (input: {
  doc: Document
  tree: MindmapTree
  parentId: MindmapNodeId
  side?: 'left' | 'right'
}): Node | undefined => {
  const siblings = input.tree.children[input.parentId] ?? []
  const siblingId = input.side
    ? siblings.find((childId) => input.tree.nodes[childId]?.side === input.side)
    : siblings[0]
  return getNode(input.doc, siblingId ?? input.parentId)
}

const buildLayoutOps = (input: {
  root: SpatialNode
  tree: MindmapTree
  nodeById: Map<MindmapNodeId, Node>
  config: WriteTranslateContext['config']
}): Array<{
  type: 'node.update'
  id: MindmapNodeId
  update: {
    fields: {
      position: SpatialNode['position']
      size: {
        width: number
        height: number
      }
    }
  }
}> => {
  const computed = computeMindmapLayout(
    input.tree,
    (nodeId) => readNodeSize(input.nodeById.get(nodeId), input.config.mindmapNodeSize),
    input.tree.layout
  )
  const anchored = anchorMindmapLayout({
    tree: input.tree,
    computed,
    position: input.root.position
  })

  return Object.entries(anchored.node).map(([nodeId, rect]) => ({
    type: 'node.update' as const,
    id: nodeId,
    update: {
      fields: {
        position: {
          x: rect.x,
          y: rect.y
        },
        size: {
          width: rect.width,
          height: rect.height
        }
      }
    }
  }))
}

const apply = <TExtra extends object = {}, TOutput = void>(input: {
  ctx: WriteTranslateContext
  id: MindmapId
  exec: (tree: MindmapTree) => MindmapCommandResult<TExtra>
  buildNodeChanges?: (result: { tree: MindmapTree } & TExtra, before: MindmapTree) => {
    creates?: Node[]
    deletes?: readonly MindmapNodeId[]
    patches?: readonly {
      id: MindmapNodeId
      update: {
        records?: readonly {
          scope: 'data' | 'style'
          op: 'set'
          path?: string
          value: unknown
        }[]
        fields?: Record<string, unknown>
      }
    }[]
  }
  pick?: (result: { tree: MindmapTree } & TExtra) => TOutput
}): Step<TOutput> => {
  const before = treeOf(input.ctx.doc, input.id)
  if (!before) {
    return err('invalid', `Mindmap ${input.id} not found.`)
  }

  const root = asSpatial(getNode(input.ctx.doc, input.id))
  if (!root) {
    return err('invalid', `Mindmap node ${input.id} not found.`)
  }

  const next = input.exec(before)
  if (!next.ok) {
    return err(next.error.code, next.error.message, next.error.details)
  }

  const nodeById = new Map<MindmapNodeId, Node>()
  getSubtreeIds(next.data.tree, next.data.tree.rootNodeId).forEach((nodeId) => {
    const existing = getNode(input.ctx.doc, nodeId)
    if (existing) {
      nodeById.set(nodeId, existing)
    }
  })

  const changes = input.buildNodeChanges?.(next.data, before)
  changes?.creates?.forEach((node) => {
    nodeById.set(node.id, node)
  })
  changes?.deletes?.forEach((nodeId) => {
    nodeById.delete(nodeId)
  })

  return ok({
    operations: [
      {
        type: 'node.update' as const,
        id: input.id,
        update: {
          records: [{
            scope: 'data' as const,
            op: 'set' as const,
            value: next.data.tree
          }]
        }
      },
      ...(changes?.creates ?? []).map(createNodeOp),
      ...(changes?.patches ?? []).map((entry) => ({
        type: 'node.update' as const,
        id: entry.id,
        update: entry.update
      })),
      ...buildLayoutOps({
        root,
        tree: next.data.tree,
        nodeById,
        config: input.ctx.config
      }),
      ...createNodeDeleteOps(changes?.deletes ?? [])
    ],
    output: input.pick ? input.pick(next.data) : undefined as TOutput
  })
}

export const create = (
  command: Extract<MindmapCommand, { type: 'mindmap.create' }>,
  ctx: WriteTranslateContext
): Step<CommandOutput<Extract<MindmapCommand, { type: 'mindmap.create' }>>> => {
  const payload = command.payload
  if (payload?.id && treeOf(ctx.doc, payload.id)) {
    return err('invalid', `Mindmap ${payload.id} already exists.`)
  }

  const mindmapId = payload?.id ?? ctx.ids.mindmap()
  const materialized = instantiateMindmapTemplate({
    template: payload.template,
    createNodeId: ctx.ids.mindmapNode
  })
  const rootPosition = payload?.position ?? { x: 0, y: 0 }
  const rootNode = {
    id: mindmapId,
    type: 'mindmap' as const,
    position: { ...rootPosition },
    data: materialized.tree as unknown as NodeData
  } satisfies Node
  const nodeById = new Map<MindmapNodeId, Node>()
  Object.entries(materialized.nodes).forEach(([nodeId, inputValue]) => {
    nodeById.set(nodeId, toNode(
      nodeId,
      mindmapId,
      { x: rootPosition.x, y: rootPosition.y },
      inputValue
    ))
  })

  return ok({
    operations: [
      createMindmapCreateOp({
        id: mindmapId,
        tree: materialized.tree,
        position: rootPosition
      }),
      ...Array.from(nodeById.values()).map(createNodeOp),
      ...buildLayoutOps({
        root: rootNode,
        tree: materialized.tree,
        nodeById,
        config: ctx.config
      })
    ],
    output: {
      mindmapId,
      rootId: materialized.tree.rootNodeId
    }
  })
}

export const removeMany = (
  command: Extract<MindmapCommand, { type: 'mindmap.delete' }>,
  doc: Document
): Step => {
  const ids = command.ids
  if (!ids.length) {
    return err('invalid', 'No mindmap ids provided.')
  }

  const operations: Array<{ type: 'node.delete'; id: string }> = []
  ids.forEach((id) => {
    const tree = treeOf(doc, id)
    if (!tree) {
      throw new Error(`Mindmap ${id} not found.`)
    }
    operations.push(
      ...createNodeDeleteOps(getSubtreeIds(tree, tree.rootNodeId)),
      { type: 'node.delete' as const, id }
    )
  })

  return ok({
    operations,
    output: undefined
  })
}

export const insert = (
  command: Extract<MindmapCommand, { type: 'mindmap.insert' }>,
  ctx: WriteTranslateContext
): Step<CommandOutput<Extract<MindmapCommand, { type: 'mindmap.insert' }>>> => {
  return apply({
    ctx,
    id: command.id,
    exec: (tree) => insertNode(tree, command.input, {
      idGenerator: {
        nodeId: ctx.ids.mindmapNode
      }
    }),
    buildNodeChanges: ({ tree, nodeId }) => {
      const parentId = tree.nodes[nodeId]?.parentId
      const template = parentId
        ? findInsertTemplateNode({
            doc: ctx.doc,
            tree,
            parentId,
            side: tree.nodes[nodeId]?.side
          })
        : undefined
      return {
        creates: [toNode(
          nodeId,
          command.id,
          { x: 0, y: 0 },
          createBlankTextNodeInput(command.input.payload, template)
        )]
      }
    },
    pick: ({ nodeId }) => ({ nodeId })
  })
}

export const moveSubtree = (
  command: Extract<MindmapCommand, { type: 'mindmap.move' }>,
  ctx: WriteTranslateContext
): Step =>
  apply({
    ctx,
    id: command.id,
    exec: (tree) => moveTree(tree, command.input)
  })

export const removeSubtree = (
  command: Extract<MindmapCommand, { type: 'mindmap.remove' }>,
  ctx: WriteTranslateContext
): Step =>
  apply({
    ctx,
    id: command.id,
    exec: (tree) => removeTree(tree, command.input),
    buildNodeChanges: ({ removedIds }) => ({
      deletes: removedIds
    })
  })

export const cloneSubtree = (
  command: Extract<MindmapCommand, { type: 'mindmap.clone' }>,
  ctx: WriteTranslateContext
): Step<CommandOutput<Extract<MindmapCommand, { type: 'mindmap.clone' }>>> =>
  apply({
    ctx,
    id: command.id,
    exec: (tree) => cloneTree(tree, command.input, {
      idGenerator: {
        nodeId: ctx.ids.mindmapNode
      }
    }),
    buildNodeChanges: ({ map }) => ({
      creates: Object.entries(map).flatMap(([sourceId, targetId]) => {
        const source = getNode(ctx.doc, sourceId)
        return source
          ? [{
              ...source,
              id: targetId,
              mindmapId: command.id,
              position: { ...source.position },
              size: source.size ? { ...source.size } : undefined,
              data: cloneNodeData(source.data),
              style: cloneNodeStyle(source.style)
            }]
          : []
      })
    }),
    pick: ({ nodeId, map }) => ({ nodeId, map })
  })

export const patch = (
  command: Extract<MindmapCommand, { type: 'mindmap.patch' }>,
  ctx: WriteTranslateContext
): Step =>
  apply({
    ctx,
    id: command.id,
    exec: (tree) => patchMindmap(tree, command.input)
  })
