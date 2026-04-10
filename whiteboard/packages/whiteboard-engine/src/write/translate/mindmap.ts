import type {
  MindmapWriteOutput,
  WriteCommandMap
} from '@engine-types/command'
import type {
  MindmapCloneSubtreeInput,
  MindmapCreateOptions,
  MindmapInsertOptions,
  MindmapMoveSubtreeInput,
  MindmapRemoveSubtreeInput,
  MindmapUpdateNodeInput
} from '@engine-types/mindmap'
import type { TranslateResult } from '@engine-types/internal/translate'
import type { WriteTranslateContext } from './index'
import { invalid, success } from './result'
import { getNode } from '@whiteboard/core/document'
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
import {
  cloneSubtree as cloneMindmapSubtree,
  createMindmapCreateOp,
  createMindmapDeleteOps,
  createMindmapUpdateOps,
  createMindmap,
  insertNode as insertMindmapNode,
  moveSubtree as moveMindmapSubtree,
  removeSubtree as removeMindmapSubtree,
  updateNode as updateMindmapNode,
  type MindmapCommandResult
} from '@whiteboard/core/mindmap'
import { getMindmapTreeFromDocument } from '@whiteboard/core/mindmap'

type MindmapCommand = WriteCommandMap['mindmap']

const readSpatialNode = (
  node: Node | undefined
): SpatialNode | undefined => node

const readMindmap = (doc: Document, id: MindmapId): MindmapTree | undefined =>
  getMindmapTreeFromDocument(doc, id)

const withNodeIdGenerator = <T extends object>(
  createNodeId: () => MindmapNodeId,
  options?: T
) => ({
  ...(options ?? {}),
  idGenerator: {
    nodeId: createNodeId
  }
})

const resolveSlot = (options?: MindmapCommandOptions) => ({
  index: options?.index,
  side: options?.side
})

const toCoreInsertInput = (
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

const runMindmapPlan = <TExtra extends object = {}, TOutput = void>({
  doc,
  id,
  options,
  run,
  select
}: {
  doc: Document
  id: MindmapId
  options?: { layout?: MindmapCommandOptions['layout'] }
  run: (tree: MindmapTree) => MindmapCommandResult<TExtra>
  select?: (result: { tree: MindmapTree } & TExtra) => TOutput
}): TranslateResult<TOutput> => {
  const beforeTree = readMindmap(doc, id)
  if (!beforeTree) return invalid(`Mindmap ${id} not found.`)
  const node = readSpatialNode(getNode(doc, id))
  if (!node) return invalid(`Mindmap node ${id} not found.`)

  const next = run(beforeTree)
  if (!next.ok) return invalid(next.error.message, next.error.details)

  return success(
    createMindmapUpdateOps({
      beforeTree,
      afterTree: next.data.tree,
      hint: options?.layout,
      node
    }),
    select ? select(next.data) : undefined as TOutput
  )
}

export const translateMindmap = <C extends MindmapCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<MindmapWriteOutput<C>> => {
  const doc = ctx.doc

  const create = (
    payload?: MindmapCreateOptions
  ): TranslateResult<{ mindmapId: MindmapId; rootId: MindmapNodeId }> => {
    if (payload?.id && readMindmap(doc, payload.id)) {
      return invalid(`Mindmap ${payload.id} already exists.`)
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

    return success(
      [createMindmapCreateOp({ id: tree.id, tree })],
      {
        mindmapId: tree.id,
        rootId: tree.rootId
      }
    )
  }

  const removeMindmaps = (ids: MindmapId[]): TranslateResult => {
    if (!ids.length) return invalid('No mindmap ids provided.')
    for (const id of ids) {
      if (!readMindmap(doc, id)) return invalid(`Mindmap ${id} not found.`)
    }
    return success(createMindmapDeleteOps(ids))
  }

  const insert = (
    id: MindmapId,
    input: MindmapInsertOptions
  ): TranslateResult<{ nodeId: MindmapNodeId }> => {
    const next = toCoreInsertInput(input)
    return runMindmapPlan({
      doc,
      id,
      options: {
        layout: next.layout
      },
      run: (tree) =>
        insertMindmapNode(
          tree,
          next.input,
          withNodeIdGenerator(ctx.ids.mindmapNode)
        ),
      select: ({ nodeId }) => ({ nodeId })
    })
  }

  const moveSubtree = (
    id: MindmapId,
    input: MindmapMoveSubtreeInput
  ): TranslateResult =>
    runMindmapPlan({
      doc,
      id,
      options: {
        layout: input.layout
      },
      run: (tree) =>
        moveMindmapSubtree(tree, {
          nodeId: input.nodeId,
          parentId: input.parentId,
          index: input.index,
          side: input.side
        })
    })

  const removeSubtree = (id: MindmapId, input: MindmapRemoveSubtreeInput): TranslateResult =>
    runMindmapPlan({
      doc,
      id,
      run: (tree) => removeMindmapSubtree(tree, input)
    })

  const cloneSubtree = (
    id: MindmapId,
    input: MindmapCloneSubtreeInput
  ): TranslateResult<{ nodeId: MindmapNodeId; map: Record<MindmapNodeId, MindmapNodeId> }> =>
    runMindmapPlan({
      doc,
      id,
      run: (tree) =>
        cloneMindmapSubtree(
          tree,
          input,
          withNodeIdGenerator(ctx.ids.mindmapNode)
        ),
      select: ({ nodeId: clonedNodeId, map }) => ({ nodeId: clonedNodeId, map })
    })

  const updateNode = (
    id: MindmapId,
    input: MindmapUpdateNodeInput
  ): TranslateResult =>
    runMindmapPlan({
      doc,
      id,
      run: (tree) => updateMindmapNode(tree, input)
    })

  switch (command.type) {
    case 'create':
      return create(command.payload) as TranslateResult<MindmapWriteOutput<C>>
    case 'delete':
      return removeMindmaps(command.ids) as TranslateResult<MindmapWriteOutput<C>>
    case 'insert':
      return insert(command.id, command.input) as TranslateResult<MindmapWriteOutput<C>>
    case 'move.subtree':
      return moveSubtree(command.id, command.input) as TranslateResult<MindmapWriteOutput<C>>
    case 'remove':
      return removeSubtree(command.id, command.input) as TranslateResult<MindmapWriteOutput<C>>
    case 'clone.subtree':
      return cloneSubtree(command.id, command.input) as TranslateResult<MindmapWriteOutput<C>>
    case 'update.node':
      return updateNode(command.id, command.input) as TranslateResult<MindmapWriteOutput<C>>
    default:
      return invalid('Unsupported mindmap command type.') as TranslateResult<MindmapWriteOutput<C>>
  }
}
