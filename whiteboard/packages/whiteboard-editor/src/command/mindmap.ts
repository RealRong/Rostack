import { createId } from '@whiteboard/core/id'
import { getNode } from '@whiteboard/core/document'
import {
  planMindmapInsertByPlacement,
  planMindmapRootMove,
  planMindmapSubtreeMove,
  getMindmapTreeFromDocument,
  materializeMindmapCreate,
  getMindmapTopicLabel,
  insertNode,
  computeMindmapLayout,
  anchorMindmapLayout
} from '@whiteboard/core/mindmap'
import { resolveNodeBootstrapSize } from '@whiteboard/core/node'
import type {
  MindmapId,
  MindmapNodeId,
  MindmapTree,
  Node,
  NodeData,
  NodeId,
  NodeInput,
  Operation,
  SpatialNode
} from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type { EditorQueryRead } from '@whiteboard/editor/query'
import type { LayoutRuntime } from '@whiteboard/editor/layout/runtime'
import type { MindmapCommands } from '@whiteboard/editor/types/commands'
import type { NodeCommands } from '@whiteboard/editor/command/node/types'

const invalid = <T = void>(
  message: string
): CommandResult<T, 'invalid'> => ({
  ok: false,
  error: {
    code: 'invalid',
    message
  }
})

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

const createIdFactory = (
  doc: ReturnType<Engine['document']['get']>,
  prefix: 'mindmap' | 'mnode'
) => {
  const reserved = new Set(Object.keys(doc.nodes))

  return () => {
    let id = createId(prefix)
    while (reserved.has(id)) {
      id = createId(prefix)
    }
    reserved.add(id)
    return id
  }
}

const readNodePosition = ({
  read,
  nodeId
}: {
  read: EditorQueryRead
  nodeId: NodeId
}) => read.node.item.get(nodeId)?.node.position

const toTextNodeInput = (
  topic?: unknown,
  template?: Node
): Omit<NodeInput, 'id' | 'position'> => ({
  type: template?.type ?? 'text',
  data: {
    text: getMindmapTopicLabel(topic as never)
  },
  style: cloneNodeStyle(template?.style)
})

const findInsertTemplateNode = (input: {
  doc: ReturnType<Engine['document']['get']>
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

const toNodeSize = (
  node: Pick<NodeInput, 'type' | 'size' | 'data'> | undefined
) => resolveNodeBootstrapSize(node ?? {
  type: 'text'
}) ?? {
  width: 1,
  height: 1
}

const measureCreatePayload = (
  layout: Pick<LayoutRuntime, 'patchNodeCreatePayload'>,
  payload: NodeInput
) => layout.patchNodeCreatePayload(payload)

const toNode = ({
  id,
  mindmapId,
  position,
  input
}: {
  id: MindmapNodeId
  mindmapId: MindmapId
  position: SpatialNode['position']
  input: NodeInput
}): Node => ({
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

const createMindmapNode = ({
  id,
  tree,
  position
}: {
  id: MindmapId
  tree: MindmapTree
  position: SpatialNode['position']
}): Node => ({
  id,
  type: 'mindmap',
  position: {
    x: position.x,
    y: position.y
  },
  data: tree as unknown as NodeData
})

const buildMindmapCreateOperations = (input: {
  mindmapId: MindmapId
  tree: MindmapTree
  measuredNodeInputs: Record<MindmapNodeId, NodeInput>
  position: SpatialNode['position']
}): Operation[] => {
  const computed = computeMindmapLayout(
    input.tree,
    (nodeId) => toNodeSize(input.measuredNodeInputs[nodeId]),
    input.tree.layout
  )
  const anchored = anchorMindmapLayout({
    tree: input.tree,
    computed,
    position: input.position
  })

  return [
    {
      type: 'node.create',
      node: createMindmapNode({
        id: input.mindmapId,
        tree: input.tree,
        position: input.position
      })
    },
    ...Object.entries(input.measuredNodeInputs).map(([nodeId, nodeInput]) => ({
      type: 'node.create' as const,
      node: toNode({
        id: nodeId,
        mindmapId: input.mindmapId,
        position: {
          x: anchored.node[nodeId]?.x ?? input.position.x,
          y: anchored.node[nodeId]?.y ?? input.position.y
        },
        input: nodeInput
      })
    }))
  ]
}

const buildMindmapInsertOperations = (input: {
  doc: ReturnType<Engine['document']['get']>
  mindmapId: MindmapId
  nextTree: MindmapTree
  newNodeId: MindmapNodeId
  newNodeInput: NodeInput
  rootPosition: SpatialNode['position']
}): Operation[] => {
  const computed = computeMindmapLayout(
    input.nextTree,
    (nodeId) => {
      if (nodeId === input.newNodeId) {
        return toNodeSize(input.newNodeInput)
      }

      return toNodeSize(getNode(input.doc, nodeId))
    },
    input.nextTree.layout
  )
  const anchored = anchorMindmapLayout({
    tree: input.nextTree,
    computed,
    position: input.rootPosition
  })

  return [
    {
      type: 'node.update',
      id: input.mindmapId,
      update: {
        records: [{
          scope: 'data',
          op: 'set',
          value: input.nextTree
        }]
      }
    },
    {
      type: 'node.create',
      node: toNode({
        id: input.newNodeId,
        mindmapId: input.mindmapId,
        position: {
          x: anchored.node[input.newNodeId]?.x ?? input.rootPosition.x,
          y: anchored.node[input.newNodeId]?.y ?? input.rootPosition.y
        },
        input: input.newNodeInput
      })
    },
    ...Object.entries(anchored.node)
      .filter(([nodeId]) => nodeId !== input.newNodeId)
      .map(([nodeId, rect]) => ({
        type: 'node.update' as const,
        id: nodeId,
        update: {
          fields: {
            position: {
              x: rect.x,
              y: rect.y
            }
          }
        }
      }))
  ]
}

const withData = <T>(
  result: ReturnType<Engine['applyOperations']>,
  data: T
): CommandResult<T> => result.ok
  ? {
      ...result,
      data
    }
  : result

const createMindmapCoreCommands = (
  execute: Engine['execute']
): Pick<
  MindmapCommands,
  'delete' | 'patch' | 'moveSubtree' | 'removeSubtree' | 'cloneSubtree'
> => ({
  delete: (ids) => execute({
    type: 'mindmap.delete',
    ids
  }),
  patch: (id, input) => execute({
    type: 'mindmap.patch',
    id,
    input
  }),
  moveSubtree: (id, input) => execute({
    type: 'mindmap.move',
    id,
    input
  }),
  removeSubtree: (id, input) => execute({
    type: 'mindmap.remove',
    id,
    input
  }),
  cloneSubtree: (id, input) => execute({
    type: 'mindmap.clone',
    id,
    input
  })
})

export const createMindmapCommands = ({
  engine,
  read,
  node,
  layout
}: {
  engine: Engine
  read: EditorQueryRead
  node: Pick<NodeCommands, 'update'>
  layout: Pick<LayoutRuntime, 'patchNodeCreatePayload'>
}): MindmapCommands => {
  const commands = createMindmapCoreCommands(engine.execute)

  const create: MindmapCommands['create'] = (payload) => {
    const doc = engine.document.get()
    const mindmapId = payload?.id ?? createIdFactory(doc, 'mindmap')()
    if (doc.nodes[mindmapId]) {
      return invalid(`Mindmap ${mindmapId} already exists.`)
    }

    const createMindmapNodeId = createIdFactory(doc, 'mnode')
    const materialized = materializeMindmapCreate({
      preset: payload?.preset,
      seed: payload?.seed,
      rootId: payload?.rootId,
      idGenerator: {
        nodeId: createMindmapNodeId
      }
    })
    const position = payload?.position ?? {
      x: 0,
      y: 0
    }
    const measuredNodeInputs = Object.fromEntries(
      Object.entries(materialized.nodeInputs).map(([nodeId, input]) => {
        const measured = measureCreatePayload(layout, {
          id: nodeId,
          mindmapId,
          position,
          ...input
        })
        return [nodeId, measured]
      })
    ) as Record<MindmapNodeId, NodeInput>
    const result = engine.applyOperations(
      buildMindmapCreateOperations({
        mindmapId,
        tree: materialized.tree,
        measuredNodeInputs,
        position
      })
    )

    return withData(result, {
      mindmapId,
      rootId: materialized.tree.rootNodeId
    })
  }

  const insert: MindmapCommands['insert'] = (id, input) => {
    const doc = engine.document.get()
    const tree = getMindmapTreeFromDocument(doc, id)
    if (!tree) {
      return invalid(`Mindmap ${id} not found.`)
    }

    const inserted = insertNode(tree, input, {
      idGenerator: {
        nodeId: createIdFactory(doc, 'mnode')
      }
    })
    if (!inserted.ok) {
      return {
        ok: false,
        error: inserted.error
      }
    }

    const nextTree = inserted.data.tree
    const nodeId = inserted.data.nodeId
    const parentId = nextTree.nodes[nodeId]?.parentId
    const template = parentId
      ? findInsertTemplateNode({
          doc,
          tree: nextTree,
          parentId,
          side: nextTree.nodes[nodeId]?.side
        })
      : undefined
    const rootPosition = read.node.item.get(id)?.node.position ?? {
      x: 0,
      y: 0
    }
    const newNodeInput = measureCreatePayload(layout, {
      id: nodeId,
      mindmapId: id,
      position: rootPosition,
      ...toTextNodeInput(input.payload, template)
    })
    const result = engine.applyOperations(
      buildMindmapInsertOperations({
        doc,
        mindmapId: id,
        nextTree,
        newNodeId: nodeId,
        newNodeInput,
        rootPosition
      })
    )

    return withData(result, {
      nodeId
    })
  }

  return {
    ...commands,
    create,
    insert,
    insertByPlacement: (input) => insert(
      input.id,
      planMindmapInsertByPlacement(input)
    ),
    moveByDrop: (input) => {
      const command = planMindmapSubtreeMove(input)

      return command
        ? commands.moveSubtree(input.id, command)
        : undefined
    },
    moveRoot: (input) => {
      const update = planMindmapRootMove({
        position: input.position,
        origin: input.origin ?? readNodePosition({
          read,
          nodeId: input.nodeId
        }),
        threshold: input.threshold
      })

      return update
        ? node.update(input.nodeId, update)
        : undefined
    },
    cloneSubtree: commands.cloneSubtree
  }
}
