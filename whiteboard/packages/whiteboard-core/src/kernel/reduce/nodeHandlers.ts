import { err } from '@whiteboard/core/result'
import type {
  KernelReduceResult,
  Operation
} from '@whiteboard/core/types'
import {
  applyNodeFieldSet,
  applyNodeFieldUnset,
  applyNodeRecordOperation,
  readRecordPathValue
} from '@whiteboard/core/kernel/reduce/apply'
import {
  cloneCanvasSlot,
  cloneNode
} from '@whiteboard/core/kernel/reduce/clone'
import {
  deleteNode,
  getNode,
  insertCanvasSlot,
  isTopLevelNode,
  readCanvasOrder,
  readCanvasSlot,
  setNode,
  writeCanvasOrder
} from '@whiteboard/core/kernel/reduce/draft'
import { markChange } from '@whiteboard/core/kernel/reduce/state'
import type { ReduceRuntime } from '@whiteboard/core/kernel/reduce/runtime'
import { cloneValue } from '@whiteboard/core/value'

type NodeOperation = Extract<
  Operation,
  {
    type:
      | 'node.create'
      | 'node.restore'
      | 'node.field.set'
      | 'node.field.unset'
      | 'node.record.set'
      | 'node.record.unset'
      | 'node.delete'
  }
>

export const handleNodeOperation = (
  runtime: ReduceRuntime,
  operation: NodeOperation
): KernelReduceResult | undefined => {
  switch (operation.type) {
    case 'node.create': {
      setNode(runtime.draft, operation.node)
      runtime.inverse.unshift({
        type: 'node.delete',
        id: operation.node.id
      })
      markChange(runtime.changes.nodes, 'add', operation.node.id)
      runtime.changes.canvasOrder ||= isTopLevelNode(runtime.draft, operation.node)
      return
    }
    case 'node.restore': {
      runtime.draft.nodes.set(operation.node.id, operation.node)
      if (isTopLevelNode(runtime.draft, operation.node)) {
        writeCanvasOrder(runtime.draft, insertCanvasSlot(readCanvasOrder(runtime.draft), {
          kind: 'node',
          id: operation.node.id
        }, operation.slot))
        runtime.changes.canvasOrder = true
      }
      runtime.inverse.unshift({
        type: 'node.delete',
        id: operation.node.id
      })
      markChange(runtime.changes.nodes, 'add', operation.node.id)
      return
    }
    case 'node.field.set': {
      const current = getNode(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Node ${operation.id} not found.`)
      }
      runtime.inverse.unshift(
        (current as Record<string, unknown>)[operation.field] === undefined && operation.field !== 'position'
          ? {
              type: 'node.field.unset',
              id: operation.id,
              field: operation.field as Extract<Operation, { type: 'node.field.unset' }>['field']
            }
          : {
              type: 'node.field.set',
              id: operation.id,
              field: operation.field,
              value: cloneValue((current as Record<string, unknown>)[operation.field])
            }
      )
      runtime.draft.nodes.set(operation.id, applyNodeFieldSet(current, operation))
      markChange(runtime.changes.nodes, 'update', operation.id)
      if (current.owner?.kind === 'mindmap') {
        runtime.queueMindmapLayout(current.owner.id)
      }
      return
    }
    case 'node.field.unset': {
      const current = getNode(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Node ${operation.id} not found.`)
      }
      runtime.inverse.unshift({
        type: 'node.field.set',
        id: operation.id,
        field: operation.field,
        value: cloneValue((current as Record<string, unknown>)[operation.field])
      })
      runtime.draft.nodes.set(operation.id, applyNodeFieldUnset(current, operation))
      markChange(runtime.changes.nodes, 'update', operation.id)
      if (current.owner?.kind === 'mindmap') {
        runtime.queueMindmapLayout(current.owner.id)
      }
      return
    }
    case 'node.record.set':
    case 'node.record.unset': {
      const current = getNode(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Node ${operation.id} not found.`)
      }
      const currentRoot = operation.scope === 'data'
        ? current.data
        : current.style
      if (operation.type === 'node.record.set') {
        const previous = readRecordPathValue(currentRoot, operation.path)
        runtime.inverse.unshift(previous === undefined
          ? {
              type: 'node.record.unset',
              id: operation.id,
              scope: operation.scope,
              path: operation.path
            }
          : {
              type: 'node.record.set',
              id: operation.id,
              scope: operation.scope,
              path: operation.path,
              value: cloneValue(previous)
            })
      } else {
        runtime.inverse.unshift({
          type: 'node.record.set',
          id: operation.id,
          scope: operation.scope,
          path: operation.path,
          value: cloneValue(readRecordPathValue(currentRoot, operation.path))
        })
      }
      const next = applyNodeRecordOperation(current, operation)
      if (!next.ok) {
        return err('invalid', next.message)
      }
      runtime.draft.nodes.set(operation.id, next.node)
      markChange(runtime.changes.nodes, 'update', operation.id)
      if (current.owner?.kind === 'mindmap') {
        runtime.queueMindmapLayout(current.owner.id)
      }
      return
    }
    case 'node.delete': {
      const current = getNode(runtime.draft, operation.id)
      if (!current) {
        return
      }
      const slot = isTopLevelNode(runtime.draft, current)
        ? readCanvasSlot(readCanvasOrder(runtime.draft), { kind: 'node', id: current.id })
        : undefined
      runtime.inverse.unshift({
        type: 'node.restore',
        node: cloneNode(current),
        slot: cloneCanvasSlot(slot)
      })
      deleteNode(runtime.draft, operation.id)
      markChange(runtime.changes.nodes, 'delete', operation.id)
      if (slot) {
        runtime.changes.canvasOrder = true
      }
      return
    }
  }
}
