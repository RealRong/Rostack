import type { CommandOutput, MindmapCommand } from '#types/command'
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
  MindmapCreateInput,
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

const apply = <TExtra extends object = {}, TOutput = void>({
  doc,
  id,
  exec,
  pick
}: {
  doc: Document
  id: MindmapId
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
      hint: undefined,
      node
    }),
    output: pick ? pick(next.data) : undefined as TOutput
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
  command: Extract<MindmapCommand, { type: 'mindmap.delete' }>,
  doc: Document
): Step => {
  const ids = command.ids
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
  command: Extract<MindmapCommand, { type: 'mindmap.insert' }>,
  ctx: WriteTranslateContext
): Step<CommandOutput<Extract<MindmapCommand, { type: 'mindmap.insert' }>>> => {
  return apply({
    doc: ctx.doc,
    id: command.id,
    exec: (tree) => insertNode(tree, command.input, withNodeId(ctx.ids.mindmapNode)),
    pick: ({ nodeId }) => ({ nodeId })
  })
}

export const moveSubtree = (
  command: Extract<MindmapCommand, { type: 'mindmap.move' }>,
  ctx: WriteTranslateContext
): Step =>
  apply({
    doc: ctx.doc,
    id: command.id,
    exec: (tree) => moveTree(tree, command.input)
  })

export const removeSubtree = (
  command: Extract<MindmapCommand, { type: 'mindmap.remove' }>,
  ctx: WriteTranslateContext
): Step =>
  apply({
    doc: ctx.doc,
    id: command.id,
    exec: (tree) => removeTree(tree, command.input)
  })

export const cloneSubtree = (
  command: Extract<MindmapCommand, { type: 'mindmap.clone' }>,
  ctx: WriteTranslateContext
): Step<CommandOutput<Extract<MindmapCommand, { type: 'mindmap.clone' }>>> =>
  apply({
    doc: ctx.doc,
    id: command.id,
    exec: (tree) => cloneTree(tree, command.input, withNodeId(ctx.ids.mindmapNode)),
    pick: ({ nodeId, map }) => ({ nodeId, map })
  })

export const updateNode = (
  command: Extract<MindmapCommand, { type: 'mindmap.patchNode' }>,
  ctx: WriteTranslateContext
): Step =>
  apply({
    doc: ctx.doc,
    id: command.id,
    exec: (tree) => updateTreeNode(tree, command.input)
  })
