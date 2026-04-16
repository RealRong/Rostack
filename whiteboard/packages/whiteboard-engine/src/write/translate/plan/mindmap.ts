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
  computeMindmapLayout,
  createMindmapCreateOp,
  getMindmapTreeFromDocument,
  getSubtreeIds
} from '@whiteboard/core/mindmap'
import {
  getMindmapTopicLabel,
  materializeMindmapCreate
} from '@whiteboard/core/mindmap/schema'
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
  const minWidth = typeof node?.style?.minWidth === 'number'
    ? node.style.minWidth
    : 0
  const paddingY = typeof node?.style?.paddingY === 'number'
    ? node.style.paddingY
    : 0
  const strokeWidth = typeof node?.style?.strokeWidth === 'number'
    ? node.style.strokeWidth
    : 0
  const fontSize = typeof node?.style?.fontSize === 'number'
    ? node.style.fontSize
    : 14
  const estimatedHeight = Math.ceil(fontSize * 1.4 + paddingY * 2 + strokeWidth * 2)

  return {
    width: Math.max(node?.size?.width ?? fallback.width, minWidth),
    height: Math.max(node?.size?.height ?? fallback.height, estimatedHeight)
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
  size: input.size ? { ...input.size } : undefined,
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
  size: template?.size ? { ...template.size } : undefined,
  data: {
    ...(template?.data ?? {}),
    text: getMindmapTopicLabel(topic as any)
  },
  style: cloneNodeStyle(template?.style)
})

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
    }
  }
}> => {
  const computed = computeMindmapLayout(
    input.tree,
    (nodeId) => readNodeSize(input.nodeById.get(nodeId), input.config.mindmapNodeSize),
    input.tree.layout
  )

  return Object.entries(computed.node).map(([nodeId, rect]) => ({
    type: 'node.update' as const,
    id: nodeId,
    update: {
      fields: {
        position: {
          x: input.root.position.x + rect.x,
          y: input.root.position.y + rect.y
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
  const materialized = materializeMindmapCreate({
    preset: payload?.preset,
    seed: payload?.seed,
    rootId: payload?.rootId,
    idGenerator: {
      nodeId: ctx.ids.mindmapNode
    }
  })
  const rootPosition = payload?.position ?? { x: 0, y: 0 }
  const rootNode = {
    id: mindmapId,
    type: 'mindmap' as const,
    position: { ...rootPosition },
    data: materialized.tree as unknown as NodeData
  } satisfies Node
  const nodeById = new Map<MindmapNodeId, Node>()
  Object.entries(materialized.nodeInputs).forEach(([nodeId, inputValue]) => {
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
