import type {
  MutationProgramWriter,
  MutationStructuralCanonicalOperation,
} from '@shared/mutation'
import type {
  MutationCustomFailure,
} from '@shared/mutation/engine'
import {
  planCanvasOrderMove,
} from '@whiteboard/core/operations/custom/canvas'
import {
  planMindmapBranchPatch,
  planMindmapCreate,
  planMindmapDelete,
  planMindmapLayout,
  planMindmapMove,
  planMindmapRestore,
  planMindmapTopicCollapse,
  planMindmapTopicDelete,
  planMindmapTopicInsert,
  planMindmapTopicMove,
  planMindmapTopicPatch,
  planMindmapTopicRestore,
} from '@whiteboard/core/operations/custom/mindmap'
import {
  createWhiteboardProgramWriter,
} from '@whiteboard/core/operations/programWriter'
import type {
  WhiteboardCompileContext,
  WhiteboardCompileCode,
} from './helpers'
import type {
  WhiteboardCustomOperation,
  WhiteboardCustomPlanContext,
} from '../custom/types'
import type {
  WhiteboardInternalOperation,
} from '../internal'

class WhiteboardCompileLoweringError extends Error {
  readonly issue: MutationCustomFailure<WhiteboardCompileCode>

  constructor(issue: MutationCustomFailure<WhiteboardCompileCode>) {
    super(issue.message)
    this.issue = issue
  }
}

const appendStructuralOperation = (
  program: MutationProgramWriter<string>,
  operation: MutationStructuralCanonicalOperation
): void => {
  switch (operation.type) {
    case 'structural.ordered.insert':
      program.ordered.insert(
        operation.structure,
        operation.itemId,
        operation.value,
        operation.to
      )
      return
    case 'structural.ordered.move':
      program.ordered.move(
        operation.structure,
        operation.itemId,
        operation.to
      )
      return
    case 'structural.ordered.splice':
      program.ordered.splice(
        operation.structure,
        operation.itemIds,
        operation.to
      )
      return
    case 'structural.ordered.delete':
      program.ordered.delete(
        operation.structure,
        operation.itemId
      )
      return
    case 'structural.ordered.patch':
      program.ordered.patch(
        operation.structure,
        operation.itemId,
        operation.patch
      )
      return
    case 'structural.tree.insert':
      program.tree.insert(
        operation.structure,
        operation.nodeId,
        operation.parentId,
        operation.index,
        operation.value
      )
      return
    case 'structural.tree.move':
      program.tree.move(
        operation.structure,
        operation.nodeId,
        operation.parentId,
        operation.index
      )
      return
    case 'structural.tree.delete':
      program.tree.delete(
        operation.structure,
        operation.nodeId
      )
      return
    case 'structural.tree.restore':
      program.tree.restore(
        operation.structure,
        operation.snapshot
      )
      return
    case 'structural.tree.node.patch':
      program.tree.patch(
        operation.structure,
        operation.nodeId,
        operation.patch
      )
      return
  }
}

const appendCustomOperation = (
  ctx: WhiteboardCompileContext,
  operation: WhiteboardInternalOperation
): void => {
  const createCustomInput = <TOp extends WhiteboardCustomOperation>(
    op: TOp
  ): WhiteboardCustomPlanContext<TOp> => ({
    op,
    document: ctx.document,
    reader: ctx.reader,
    services: ctx.services,
    program: ctx.program,
    fail: (issue: MutationCustomFailure<WhiteboardCompileCode>) => {
      throw new WhiteboardCompileLoweringError(issue)
    }
  })

  switch (operation.type) {
    case 'canvas.order.move':
      planCanvasOrderMove(createCustomInput(operation))
      return
    case 'mindmap.create':
      planMindmapCreate(createCustomInput(operation))
      return
    case 'mindmap.restore':
      planMindmapRestore(createCustomInput(operation))
      return
    case 'mindmap.delete':
      planMindmapDelete(createCustomInput(operation))
      return
    case 'mindmap.move':
      planMindmapMove(createCustomInput(operation))
      return
    case 'mindmap.layout':
      planMindmapLayout(createCustomInput(operation))
      return
    case 'mindmap.topic.insert':
      planMindmapTopicInsert(createCustomInput(operation))
      return
    case 'mindmap.topic.restore':
      planMindmapTopicRestore(createCustomInput(operation))
      return
    case 'mindmap.topic.move':
      planMindmapTopicMove(createCustomInput(operation))
      return
    case 'mindmap.topic.delete':
      planMindmapTopicDelete(createCustomInput(operation))
      return
    case 'mindmap.topic.patch':
      planMindmapTopicPatch(createCustomInput(operation))
      return
    case 'mindmap.branch.patch':
      planMindmapBranchPatch(createCustomInput(operation))
      return
    case 'mindmap.topic.collapse':
      planMindmapTopicCollapse(createCustomInput(operation))
      return
  }

  throw new Error(`Unsupported whiteboard custom operation: ${operation.type}`)
}

export const appendWhiteboardOperation = (
  ctx: WhiteboardCompileContext,
  operation: WhiteboardInternalOperation
): void => {
  const writer = createWhiteboardProgramWriter(ctx.program)

  try {
    switch (operation.type) {
      case 'document.create':
        writer.document.create(operation.value)
        return
      case 'document.patch':
        writer.document.patch(operation.patch)
        return
      case 'node.create':
        writer.node.create(operation.value)
        return
      case 'node.patch':
        writer.node.patch(operation.id, operation.patch)
        return
      case 'node.delete':
        writer.node.delete(operation.id)
        return
      case 'edge.create':
        writer.edge.create(operation.value)
        return
      case 'edge.patch':
        writer.edge.patch(operation.id, operation.patch)
        return
      case 'edge.delete':
        writer.edge.delete(operation.id)
        return
      case 'group.create':
        writer.group.create(operation.value)
        return
      case 'group.patch':
        writer.group.patch(operation.id, operation.patch)
        return
      case 'group.delete':
        writer.group.delete(operation.id)
        return
      case 'structural.ordered.insert':
      case 'structural.ordered.move':
      case 'structural.ordered.splice':
      case 'structural.ordered.delete':
      case 'structural.ordered.patch':
      case 'structural.tree.insert':
      case 'structural.tree.move':
      case 'structural.tree.delete':
      case 'structural.tree.restore':
      case 'structural.tree.node.patch':
        appendStructuralOperation(
          ctx.program,
          operation as MutationStructuralCanonicalOperation
        )
        return
      default:
        appendCustomOperation(ctx, operation)
    }
  } catch (error) {
    if (error instanceof WhiteboardCompileLoweringError) {
      ctx.fail({
        code: error.issue.code,
        message: error.issue.message,
        ...(error.issue.path === undefined
          ? {}
          : {
              path: error.issue.path
            }),
        ...(error.issue.details === undefined
          ? {}
          : {
              details: error.issue.details
            })
      })
      return
    }

    throw error
  }
}

export const appendWhiteboardOperations = (
  ctx: WhiteboardCompileContext,
  ...operations: readonly WhiteboardInternalOperation[]
): void => {
  operations.forEach((operation) => {
    appendWhiteboardOperation(ctx, operation)
  })
}
