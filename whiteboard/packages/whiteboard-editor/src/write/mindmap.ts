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
  anchorMindmapLayout,
  getSubtreeIds
} from '@whiteboard/core/mindmap'
import { resolveNodeBootstrapSize } from '@whiteboard/core/node'
import {
  compileNodeStyleUpdate,
  mergeNodeUpdates
} from '@whiteboard/core/schema'
import type {
  MindmapLayout,
  MindmapId,
  MindmapInsertInput,
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
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type {
  MindmapBorderPatch,
  MindmapCommands
} from '@whiteboard/editor/types/commands'
import type { NodeCommands } from '@whiteboard/editor/write/node/types'

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
  read: EditorQuery
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
  layout: Pick<EditorLayout, 'patchNodeCreatePayload'>,
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
  mindmapId: MindmapId
  nextTree: MindmapTree
  newNodeId: MindmapNodeId
  newNodeInput: NodeInput
  rootPosition: SpatialNode['position']
  anchored: MindmapLayout
}): Operation[] => {
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
          x: input.anchored.node[input.newNodeId]?.x ?? input.rootPosition.x,
          y: input.anchored.node[input.newNodeId]?.y ?? input.rootPosition.y
        },
        input: input.newNodeInput
      })
    },
    ...Object.entries(input.anchored.node)
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

const resolveAnchoredInsertLayout = (input: {
  doc: ReturnType<Engine['document']['get']>
  nextTree: MindmapTree
  newNodeId: MindmapNodeId
  newNodeInput: NodeInput
  rootPosition: SpatialNode['position']
}) => anchorMindmapLayout({
  tree: input.nextTree,
  computed: computeMindmapLayout(
    input.nextTree,
    (nodeId) => {
      if (nodeId === input.newNodeId) {
        return toNodeSize(input.newNodeInput)
      }

      return toNodeSize(getNode(input.doc, nodeId))
    },
    input.nextTree.layout
  ),
  position: input.rootPosition
})

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

const readMindmapNavigateTarget = ({
  tree,
  fromNodeId,
  direction
}: {
  tree: MindmapTree
  fromNodeId: MindmapNodeId
  direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
}) => {
  switch (direction) {
    case 'parent':
      return tree.nodes[fromNodeId]?.parentId
    case 'first-child':
      return tree.children[fromNodeId]?.[0]
    case 'prev-sibling': {
      const parentId = tree.nodes[fromNodeId]?.parentId
      if (!parentId) {
        return undefined
      }

      const siblings = tree.children[parentId] ?? []
      const index = siblings.indexOf(fromNodeId)
      return index > 0 ? siblings[index - 1] : undefined
    }
    case 'next-sibling': {
      const parentId = tree.nodes[fromNodeId]?.parentId
      if (!parentId) {
        return undefined
      }

      const siblings = tree.children[parentId] ?? []
      const index = siblings.indexOf(fromNodeId)
      return index >= 0 ? siblings[index + 1] : undefined
    }
  }
}

const cloneBranch = (
  branch: MindmapTree['nodes'][MindmapNodeId]['branch']
) => ({
  ...branch
})

const cloneTree = (
  tree: MindmapTree
): MindmapTree => ({
  ...tree,
  nodes: Object.fromEntries(
    Object.entries(tree.nodes).map(([nodeId, node]) => [
      nodeId,
      {
        ...node,
        branch: cloneBranch(node.branch)
      }
    ])
  ),
  children: Object.fromEntries(
    Object.entries(tree.children).map(([nodeId, childIds]) => [
      nodeId,
      [...childIds]
    ])
  ),
  layout: {
    ...tree.layout
  },
  meta: tree.meta ? { ...tree.meta } : undefined
})

const toTreeUpdateOperation = (
  id: MindmapId,
  tree: MindmapTree
): Operation => ({
  type: 'node.update',
  id,
  update: {
    records: [{
      scope: 'data',
      op: 'set',
      value: tree
    }]
  }
})

const buildMindmapTopicUpdate = (
  patch: MindmapBorderPatch
) => mergeNodeUpdates(
  'frameKind' in patch
    ? compileNodeStyleUpdate('frameKind', patch.frameKind)
    : undefined,
  'stroke' in patch
    ? compileNodeStyleUpdate('stroke', patch.stroke)
    : undefined,
  'strokeWidth' in patch
    ? compileNodeStyleUpdate('strokeWidth', patch.strokeWidth)
    : undefined,
  'fill' in patch
    ? compileNodeStyleUpdate('fill', patch.fill)
    : undefined
)

export const createMindmapWrite = ({
  engine,
  read,
  node,
  layout
}: {
  engine: Engine
  read: EditorQuery
  node: Pick<NodeCommands, 'update' | 'updateMany'>
  layout: Pick<EditorLayout, 'patchNodeCreatePayload'>
}): MindmapCommands => {
  const commands = createMindmapCoreCommands(engine.execute)

  const create: MindmapCommands['create'] = (payload, options) => {
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

  const insert: MindmapCommands['insert'] = (id, input, options) => {
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
    const anchored = resolveAnchoredInsertLayout({
      doc,
      nextTree,
      newNodeId: nodeId,
      newNodeInput,
      rootPosition
    })
    const result = engine.applyOperations(
      buildMindmapInsertOperations({
        mindmapId: id,
        nextTree,
        newNodeId: nodeId,
        newNodeInput,
        rootPosition,
        anchored
      })
    )
    return withData(result, {
      nodeId
    })
  }

  const navigate: MindmapCommands['navigate'] = (input) => {
    const tree = getMindmapTreeFromDocument(engine.document.get(), input.id)
    if (!tree) {
      return undefined
    }

    return readMindmapNavigateTarget({
      tree,
      fromNodeId: input.fromNodeId,
      direction: input.direction
    })
  }

  const style: MindmapCommands['style'] = {
    branch: (input) => {
      if (Object.keys(input.patch).length === 0) {
        return undefined
      }

      const tree = getMindmapTreeFromDocument(engine.document.get(), input.id)
      if (!tree) {
        return undefined
      }

      const nextTree = cloneTree(tree)
      const nextIds = (
        input.scope === 'subtree'
          ? [...new Set(input.nodeIds.flatMap((nodeId) => (
            nextTree.nodes[nodeId]
              ? getSubtreeIds(nextTree, nodeId)
              : []
          )))]
          : [...new Set(input.nodeIds.filter((nodeId) => nextTree.nodes[nodeId]))]
      )
      if (!nextIds.length) {
        return undefined
      }

      nextIds.forEach((nodeId) => {
        const current = nextTree.nodes[nodeId]
        if (!current) {
          return
        }

        current.branch = {
          ...current.branch,
          ...input.patch
        }
      })

      return engine.applyOperations([
        toTreeUpdateOperation(input.id, nextTree)
      ])
    },
    topic: (input) => {
      const update = buildMindmapTopicUpdate(input.patch)
      if (!update.fields && !update.records?.length) {
        return undefined
      }

      const updates = input.nodeIds
        .filter((nodeId) => Boolean(read.node.item.get(nodeId)?.node.mindmapId))
        .map((nodeId) => ({
          id: nodeId,
          update
        }))
      if (!updates.length) {
        return undefined
      }

      return node.updateMany(updates)
    }
  }

  return {
    ...commands,
    create,
    insert,
    navigate,
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
    cloneSubtree: commands.cloneSubtree,
    style
  }
}
