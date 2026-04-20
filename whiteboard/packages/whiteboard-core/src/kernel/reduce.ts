import { validateLockOperations } from '@whiteboard/core/lock'
import { err, ok } from '@whiteboard/core/result'
import { materializeDraftDocument } from '@whiteboard/core/kernel/reduce/draft'
import { handleDocumentOperation } from '@whiteboard/core/kernel/reduce/documentHandlers'
import { handleNodeOperation } from '@whiteboard/core/kernel/reduce/nodeHandlers'
import { handleEdgeOperation } from '@whiteboard/core/kernel/reduce/edgeHandlers'
import { handleGroupOperation } from '@whiteboard/core/kernel/reduce/groupHandlers'
import { handleMindmapOperation } from '@whiteboard/core/kernel/reduce/mindmapHandlers'
import { createReduceRuntime } from '@whiteboard/core/kernel/reduce/runtime'
import { drainReduceReconcile } from '@whiteboard/core/kernel/reduce/reconcile'
import {
  deriveImpact,
  deriveInvalidation,
  readLockViolationMessage
} from '@whiteboard/core/kernel/reduce/state'
import type {
  Document,
  KernelContext,
  KernelReduceResult,
  Operation
} from '@whiteboard/core/types'

const reduceFamilyOperation = (
  runtime: ReturnType<typeof createReduceRuntime>,
  operation: Operation
): KernelReduceResult | undefined => {
  switch (operation.type) {
    case 'document.replace':
    case 'document.background':
    case 'canvas.order.move':
      return handleDocumentOperation(runtime, operation)
    case 'node.create':
    case 'node.restore':
    case 'node.field.set':
    case 'node.field.unset':
    case 'node.record.set':
    case 'node.record.unset':
    case 'node.delete':
      return handleNodeOperation(runtime, operation)
    case 'edge.create':
    case 'edge.restore':
    case 'edge.field.set':
    case 'edge.field.unset':
    case 'edge.record.set':
    case 'edge.record.unset':
    case 'edge.label.insert':
    case 'edge.label.delete':
    case 'edge.label.move':
    case 'edge.label.field.set':
    case 'edge.label.field.unset':
    case 'edge.label.record.set':
    case 'edge.label.record.unset':
    case 'edge.route.point.insert':
    case 'edge.route.point.delete':
    case 'edge.route.point.move':
    case 'edge.route.point.field.set':
    case 'edge.delete':
      return handleEdgeOperation(runtime, operation)
    case 'group.create':
    case 'group.restore':
    case 'group.field.set':
    case 'group.field.unset':
    case 'group.delete':
      return handleGroupOperation(runtime, operation)
    case 'mindmap.create':
    case 'mindmap.restore':
    case 'mindmap.delete':
    case 'mindmap.root.move':
    case 'mindmap.layout':
    case 'mindmap.topic.insert':
    case 'mindmap.topic.restore':
    case 'mindmap.topic.move':
    case 'mindmap.topic.delete':
    case 'mindmap.topic.field.set':
    case 'mindmap.topic.field.unset':
    case 'mindmap.topic.record.set':
    case 'mindmap.topic.record.unset':
    case 'mindmap.branch.field.set':
    case 'mindmap.branch.field.unset':
    case 'mindmap.topic.collapse':
      return handleMindmapOperation(runtime, operation)
  }
}

export const reduceOperations = (
  document: Document,
  operations: readonly Operation[],
  _ctx: KernelContext = {}
): KernelReduceResult => {
  const origin = _ctx.origin ?? 'user'
  const violation = validateLockOperations({
    document,
    operations,
    origin
  })
  if (violation) {
    return err(
      'cancelled',
      readLockViolationMessage(violation.reason, violation.operation)
    )
  }

  const runtime = createReduceRuntime(document)

  for (const operation of operations) {
    const result = reduceFamilyOperation(runtime, operation)
    if (result) {
      return result
    }
  }

  const drained = drainReduceReconcile(runtime)
  if (!drained.ok) {
    return drained
  }

  const invalidation = deriveInvalidation(runtime.changes)

  return ok({
    doc: materializeDraftDocument(runtime.draft),
    changes: runtime.changes,
    invalidation,
    inverse: runtime.inverse,
    impact: deriveImpact(invalidation)
  })
}
