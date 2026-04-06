import type { CommitChangeSet } from '../contracts/changeSet'
import type { BaseOperation } from '../contracts/operations'
import type { DataDoc } from '../contracts/state'
import { type ChangeCollector, createChangeCollector, getOperationChangedSlices } from '../commit/changeSet'
import { enumerateRecords } from '../document'
import { reduceOperation } from './reducer'
import { buildInverseOperations } from './history/inverse'

export interface ApplyOperationsResult {
  document: DataDoc
  changeSet: CommitChangeSet
  undo: BaseOperation[]
  redo: BaseOperation[]
}

const cloneValue = <T>(value: T): T => structuredClone(value)

const collectOperationChanges = (
  operation: BaseOperation,
  collector: ChangeCollector
) => {
  collector.addSlices(getOperationChangedSlices(operation))

  switch (operation.type) {
    case 'document.record.insert': {
      enumerateRecords(operation.records, entry => {
        collector.addRecordAdded(entry.record.id)
      })
      return
    }
    case 'document.record.patch': {
      collector.addRecordUpdated(operation.recordId)
      return
    }
    case 'document.record.remove': {
      operation.recordIds.forEach(recordId => {
        collector.addRecordRemoved(recordId)
      })
      return
    }
    case 'document.value.set': {
      collector.addValueChange(operation.recordId, [operation.field])
      return
    }
    case 'document.value.patch': {
      collector.addValueChange(operation.recordId, Object.keys(operation.patch))
      return
    }
    case 'document.value.clear': {
      collector.addValueChange(operation.recordId, [operation.field])
      return
    }
    case 'document.view.put': {
      collector.addViewPut(operation.view.id)
      return
    }
    case 'document.view.remove': {
      collector.addViewRemoved(operation.viewId)
      return
    }
    case 'document.customField.put': {
      collector.addFieldPut(operation.field.id)
      return
    }
    case 'document.customField.patch': {
      collector.addFieldUpdated(operation.fieldId)
      return
    }
    case 'document.customField.remove': {
      collector.addFieldRemoved(operation.fieldId)
      return
    }
    case 'external.version.bump':
      return
  }
}

export const applyOperations = (document: DataDoc, operations: readonly BaseOperation[], collector?: ChangeCollector): ApplyOperationsResult => {
  const changeCollector = collector ?? createChangeCollector(document)
  let nextDocument = document
  const undoBatches: BaseOperation[][] = []
  const redo = operations.map(operation => cloneValue(operation))

  for (const operation of operations) {
    undoBatches.unshift(buildInverseOperations(nextDocument, operation))
    collectOperationChanges(operation, changeCollector)
    nextDocument = reduceOperation(nextDocument, operation)
  }

  return {
    document: nextDocument,
    changeSet: changeCollector.build(),
    undo: undoBatches.flat(),
    redo
  }
}
