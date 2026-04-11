import type {
  MindmapCloneSubtreeInput,
  MindmapCreateOptions,
  MindmapInsertOptions,
  MindmapMoveSubtreeInput,
  MindmapRemoveSubtreeInput,
  MindmapUpdateNodeInput
} from '@engine-types/mindmap'
import { getNode } from '@whiteboard/core/document'
import {
  cloneSubtree as cloneTree,
  createMindmap,
  createMindmapCreateOp,
  createMindmapDeleteOps,
  createMindmapUpdateOps,
  insertNode,
  moveSubtree as moveTree,
  removeSubtree as removeTree,
  updateNode as updateTreeNode,
  type MindmapCommandResult
} from '@whiteboard/core/mindmap'
import { getMindmapTreeFromDocument } from '@whiteboard/core/mindmap'
import { err, ok } from '@whiteboard/core/result'
import type {
  Document,
  MindmapCommandOptions,
  MindmapId,
  MindmapInsertInput,
  MindmapNodeId,
  MindmapTree,
  Node,
  SpatialNode
} from '@whiteboard/core/types'
import type { WriteTranslateContext } from '../index'
import type { Step } from './shared'

const asSpatial = (
  node: Node | undefined
): SpatialNode | undefined => node

const treeOf = (doc: Document, id: MindmapId): MindmapTree | undefined =>
  getMindmapTreeFromDocument(doc, id)

const withNodeId = <T extends object>(
  nextId: () => MindmapNodeId,
  options?: T
) => ({
  ...(options ?? {}),
  idGenerator: {
    nodeId: nextId
  }
})

const insertInput = (
  input: MindmapInsertOptions
): {
  input: MindmapInsertInput
  layout?: MindmapCommandOptions['layout']
} => {
  switch (input.kind) {
    case 'child':
      return {
        input: {
          kind: 'child',
          parentId: input.parentId,
          payload: input.payload,
          options: {
            index: input.options?.index,
            side: input.options?.side
          }
        },
        layout: input.options?.layout
      }
    case 'sibling':
      return {
        input: {
          kind: 'sibling',
          nodeId: input.nodeId,
          position: input.position,
          payload: input.payload
        },
        layout: input.options?.layout
      }
    case 'parent':
      return {
        input: {
          kind: 'parent',
          nodeId: input.nodeId,
          payload: input.payload,
          options: {
            side: input.options?.side
          }
        },
        layout: input.options?.layout
      }
  }
}

const apply = <TExtra extends object = {}, TOutput = void>({
  doc,
  id,
  layout,
  exec,
  pick
}: {
  doc: Document
  id: MindmapId
  layout?: MindmapCommandOptions['layout']
  exec: (tree: MindmapTree) => MindmapCommandResult<TExtra>
  pick?: (result: { tree: MindmapTree } & TExtra) => TOutput
}): Step<TOutput> => {
  const before = treeOf(doc, id)
  if (!before) {
    return err('invalid', `Mindmap ${id} not found.`)
  }

  const node = asSpatial(getNode(doc, id))
  if (!node) {
    return err('invalid', `Mindmap node ${id} not found.`)
  }

  const next = exec(before)
  if (!next.ok) {
    return err(next.error.code, next.error.message, next.error.details)
  }

  return ok({
    operations: createMindmapUpdateOps({
      beforeTree: before,
      afterTree: next.data.tree,
      hint: layout,
      node
    }),
    output: pick ? pick(next.data) : undefined as TOutput
  })
}

export const create = (
  payload: MindmapCreateOptions | undefined,
  ctx: WriteTranslateContext
): Step<{ mindmapId: MindmapId; rootId: MindmapNodeId }> => {
  if (payload?.id && treeOf(ctx.doc, payload.id)) {
    return err('invalid', `Mindmap ${payload.id} already exists.`)
  }

  const tree = createMindmap({
    id: payload?.id ?? ctx.ids.mindmap(),
    rootId: payload?.rootId,
    rootData: payload?.rootData,
    idGenerator: {
      treeId: ctx.ids.mindmap,
      nodeId: ctx.ids.mindmapNode
    }
  })

  return ok({
    operations: [createMindmapCreateOp({ id: tree.id, tree })],
    output: {
      mindmapId: tree.id,
      rootId: tree.rootId
    }
  })
}

export const removeMany = (
  ids: readonly MindmapId[],
  doc: Document
): Step => {
  if (!ids.length) {
    return err('invalid', 'No mindmap ids provided.')
  }

  for (const id of ids) {
    if (!treeOf(doc, id)) {
      return err('invalid', `Mindmap ${id} not found.`)
    }
  }

  return ok({
    operations: createMindmapDeleteOps(ids),
    output: undefined
  })
}

export const insert = (
  id: MindmapId,
  input: MindmapInsertOptions,
  ctx: WriteTranslateContext
): Step<{ nodeId: MindmapNodeId }> => {
  const next = insertInput(input)

  return apply({
    doc: ctx.doc,
    id,
    layout: next.layout,
    exec: (tree) => insertNode(tree, next.input, withNodeId(ctx.ids.mindmapNode)),
    pick: ({ nodeId }) => ({ nodeId })
  })
}

export const moveSubtree = (
  id: MindmapId,
  input: MindmapMoveSubtreeInput,
  ctx: WriteTranslateContext
): Step =>
  apply({
    doc: ctx.doc,
    id,
    layout: input.layout,
    exec: (tree) =>
      moveTree(tree, {
        nodeId: input.nodeId,
        parentId: input.parentId,
        index: input.index,
        side: input.side
      })
  })

export const removeSubtree = (
  id: MindmapId,
  input: MindmapRemoveSubtreeInput,
  ctx: WriteTranslateContext
): Step =>
  apply({
    doc: ctx.doc,
    id,
    exec: (tree) => removeTree(tree, input)
  })

export const cloneSubtree = (
  id: MindmapId,
  input: MindmapCloneSubtreeInput,
  ctx: WriteTranslateContext
): Step<{ nodeId: MindmapNodeId; map: Record<MindmapNodeId, MindmapNodeId> }> =>
  apply({
    doc: ctx.doc,
    id,
    exec: (tree) => cloneTree(tree, input, withNodeId(ctx.ids.mindmapNode)),
    pick: ({ nodeId, map }) => ({ nodeId, map })
  })

export const updateNode = (
  id: MindmapId,
  input: MindmapUpdateNodeInput,
  ctx: WriteTranslateContext
): Step =>
  apply({
    doc: ctx.doc,
    id,
    exec: (tree) => updateTreeNode(tree, input)
  })
