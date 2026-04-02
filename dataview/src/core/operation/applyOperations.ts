import type { GroupCommitChangeSet } from '../contracts/changeSet'
import type { GroupBaseOperation } from '../contracts/operations'
import type { GroupDocument } from '../contracts/state'
import { type ChangeCollector, createChangeCollector, getOperationChangedSlices } from '../commit/changeSet'
import { enumerateRecords } from '../document'
import { reduceOperation } from './reducer'
import { buildInverseOperations } from './history/inverse'

export interface ApplyOperationsResult {
  document: GroupDocument
  changeSet: GroupCommitChangeSet
  undo: GroupBaseOperation[]
  redo: GroupBaseOperation[]
}

const cloneValue = <T>(value: T): T => structuredClone(value)

const collectOperationChanges = (
  operation: GroupBaseOperation,
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
      collector.addValueChange(operation.recordId, [operation.property])
      return
    }
    case 'document.value.patch': {
      collector.addValueChange(operation.recordId, Object.keys(operation.patch))
      return
    }
    case 'document.value.clear': {
      collector.addValueChange(operation.recordId, [operation.property])
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
    case 'document.property.put': {
      collector.addPropertyPut(operation.property.id)
      return
    }
    case 'document.property.patch': {
      collector.addPropertyUpdated(operation.propertyId)
      return
    }
    case 'document.property.remove': {
      collector.addPropertyRemoved(operation.propertyId)
      return
    }
    case 'external.version.bump':
      return
  }
}

export const applyOperations = (document: GroupDocument, operations: readonly GroupBaseOperation[], collector?: ChangeCollector): ApplyOperationsResult => {
  const changeCollector = collector ?? createChangeCollector(document)
  let nextDocument = document
  const undoBatches: GroupBaseOperation[][] = []
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
