import type { Command, CustomField, DataDoc, Row } from '@dataview/core/contracts'
import type { DeltaItem } from '@dataview/core/contracts'
import { buildSemanticDraft } from '@dataview/core/commit/semantics'
import {
  getDocumentCustomFieldById,
  getDocumentRecordById,
  getDocumentViewById
} from '@dataview/core/document'
import { reduceOperations } from '@dataview/core/operation'
import { createCommandContext } from './context'
import { createIssue, hasValidationErrors, type ValidationIssue } from './issues'
import { commandResult, isNonEmptyString, type CommandResult } from './shared'
import type { LoweredCommand } from '../action/lower'
import { validateField } from './field/validate'

export interface ResolvedWriteBatch {
  operations: CommandResult['operations']
  deltaDraft: readonly DeltaItem[]
  issues: ValidationIssue[]
  canApply: boolean
}

const validateRecordExists = (
  document: DataDoc,
  commandIndex: number,
  command: Command,
  recordId: string,
  path: string
) => getDocumentRecordById(document, recordId)
  ? []
  : [createIssue({ index: commandIndex, type: command.type }, 'error', 'record.notFound', `Unknown record: ${recordId}`, path)]

const validateViewExists = (
  document: DataDoc,
  commandIndex: number,
  command: Command,
  viewId: string,
  path: string
) => getDocumentViewById(document, viewId)
  ? []
  : [createIssue({ index: commandIndex, type: command.type }, 'error', 'view.notFound', `Unknown view: ${viewId}`, path)]

const validateFieldExists = (
  document: DataDoc,
  commandIndex: number,
  command: Command,
  fieldId: string,
  path: string
) => getDocumentCustomFieldById(document, fieldId)
  ? []
  : [createIssue({ index: commandIndex, type: command.type }, 'error', 'field.notFound', `Unknown field: ${fieldId}`, path)]

const runCommand = (
  document: DataDoc,
  lowered: LoweredCommand
): CommandResult => {
  const ctx = createCommandContext({
    index: lowered.index,
    doc: document
  })
  const source = {
    index: ctx.index,
    type: lowered.command.type
  } as const

  switch (lowered.command.type) {
    case 'record.insert': {
      const issues = lowered.command.records.length
        ? []
        : [createIssue(source, 'error', 'batch.emptyCollection', 'record.insert requires at least one record', 'records')]
      const recordIds = lowered.command.records.map(record => record.id)
      recordIds.forEach(recordId => {
        if (!isNonEmptyString(recordId)) {
          issues.push(createIssue(source, 'error', 'record.invalidId', 'Record id must be a non-empty string', 'records'))
        }
        if (ctx.read.records.has(recordId)) {
          issues.push(createIssue(source, 'error', 'record.duplicateId', `Record already exists: ${recordId}`, 'records'))
        }
      })
      recordIds
        .filter((recordId, recordIndex) => recordIds.indexOf(recordId) !== recordIndex)
        .forEach(recordId => {
          issues.push(createIssue(source, 'error', 'record.duplicateId', `Duplicate record id: ${recordId}`, 'records'))
        })
      if (lowered.command.target?.index !== undefined && lowered.command.target.index < 0) {
        issues.push(createIssue(source, 'error', 'record.invalidIndex', 'record.insert target index must be >= 0', 'target.index'))
      }
      if (lowered.command.records.some(record => {
        const rawRecord = record as Row & { children?: unknown; expanded?: unknown }
        return Array.isArray(rawRecord.children) || rawRecord.expanded !== undefined
      })) {
        issues.push(createIssue(source, 'error', 'record.hierarchyUnsupported', 'Hierarchy payload is not supported in canonical records', 'records'))
      }
      return commandResult(issues, [{
        type: 'document.record.insert',
        records: lowered.command.records,
        target: lowered.command.target
      }])
    }
    case 'record.patch': {
      const issues = validateRecordExists(document, ctx.index, lowered.command, lowered.command.recordId, 'recordId')
      if (!Object.keys(lowered.command.patch).length) {
        issues.push(createIssue(source, 'error', 'record.emptyPatch', 'record.patch patch cannot be empty', 'patch'))
      }
      return commandResult(issues, [{
        type: 'document.record.patch',
        recordId: lowered.command.recordId,
        patch: lowered.command.patch
      }])
    }
    case 'record.remove':
      return commandResult([], [{
        type: 'document.record.remove',
        recordIds: lowered.command.recordIds
      }])
    case 'value.set': {
      const issues = [
        ...validateRecordExists(document, ctx.index, lowered.command, lowered.command.recordId, 'recordId'),
        ...validateFieldExists(document, ctx.index, lowered.command, lowered.command.field, 'field')
      ]
      return commandResult(issues, [{
        type: 'document.value.set',
        recordId: lowered.command.recordId,
        field: lowered.command.field,
        value: lowered.command.value
      }])
    }
    case 'value.patch': {
      const issues = validateRecordExists(document, ctx.index, lowered.command, lowered.command.recordId, 'recordId')
      if (!Object.keys(lowered.command.patch).length) {
        issues.push(createIssue(source, 'error', 'value.emptyPatch', 'value.patch patch cannot be empty', 'patch'))
      }
      return commandResult(issues, [{
        type: 'document.value.patch',
        recordId: lowered.command.recordId,
        patch: lowered.command.patch
      }])
    }
    case 'value.clear': {
      const issues = [
        ...validateRecordExists(document, ctx.index, lowered.command, lowered.command.recordId, 'recordId'),
        ...validateFieldExists(document, ctx.index, lowered.command, lowered.command.field, 'field')
      ]
      return commandResult(issues, [{
        type: 'document.value.clear',
        recordId: lowered.command.recordId,
        field: lowered.command.field
      }])
    }
    case 'field.put': {
      const issues = validateField(document, source, lowered.command.field, 'field')
      return commandResult(issues, [{
        type: 'document.field.put',
        field: lowered.command.field
      }])
    }
    case 'field.patch': {
      const issues = validateFieldExists(document, ctx.index, lowered.command, lowered.command.fieldId, 'fieldId')
      const field = ctx.read.fields.get(lowered.command.fieldId)
      if (!field) {
        return commandResult(issues)
      }
      if (!Object.keys(lowered.command.patch).length) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'field.patch patch cannot be empty', 'patch'))
      } else {
        issues.push(...validateField(document, source, { ...field, ...(lowered.command.patch as Partial<CustomField>) } as CustomField, 'patch'))
      }
      return commandResult(issues, [{
        type: 'document.field.patch',
        fieldId: lowered.command.fieldId,
        patch: lowered.command.patch
      }])
    }
    case 'field.remove': {
      const issues = validateFieldExists(document, ctx.index, lowered.command, lowered.command.fieldId, 'fieldId')
      return commandResult(issues, [{
        type: 'document.field.remove',
        fieldId: lowered.command.fieldId
      }])
    }
    case 'view.put': {
      const issues = [
        ...(!isNonEmptyString(lowered.command.view.id)
          ? [createIssue(source, 'error', 'view.invalid', 'View id must be a non-empty string', 'view.id')]
          : []),
        ...(!isNonEmptyString(lowered.command.view.name)
          ? [createIssue(source, 'error', 'view.invalid', 'View name must be a non-empty string', 'view.name')]
          : []),
        ...(!isNonEmptyString(lowered.command.view.type)
          ? [createIssue(source, 'error', 'view.invalid', 'View type must be a non-empty string', 'view.type')]
          : [])
      ]
      return commandResult(issues, [{
        type: 'document.view.put',
        view: lowered.command.view
      }])
    }
    case 'view.remove': {
      const issues = validateViewExists(document, ctx.index, lowered.command, lowered.command.viewId, 'viewId')
      return commandResult(issues, [{
        type: 'document.view.remove',
        viewId: lowered.command.viewId
      }])
    }
    case 'activeView.set': {
      const issues = validateViewExists(document, ctx.index, lowered.command, lowered.command.viewId, 'viewId')
      return commandResult(issues, [{
        type: 'document.activeView.set',
        viewId: lowered.command.viewId
      }])
    }
    case 'external.bumpVersion': {
      const issues = isNonEmptyString(lowered.command.source)
        ? []
        : [createIssue(source, 'error', 'external.invalidSource', 'external.bumpVersion requires a non-empty source', 'source')]
      return commandResult(issues, [{
        type: 'external.version.bump',
        source: lowered.command.source
      }])
    }
    default: {
      const unexpectedCommand: never = lowered.command
      throw new Error(`Unsupported command: ${unexpectedCommand}`)
    }
  }
}

export const runCommands = (input: {
  document: DataDoc
  commands: readonly LoweredCommand[]
}): ResolvedWriteBatch => {
  const issues: ValidationIssue[] = []
  const operations: CommandResult['operations'] = []
  const deltaDraft: DeltaItem[] = []
  let workingDocument = input.document

  for (const lowered of input.commands) {
    const resolved = runCommand(workingDocument, lowered)
    issues.push(...resolved.issues)

    if (hasValidationErrors(resolved.issues)) {
      return {
        operations: [],
        deltaDraft: [],
        issues,
        canApply: false
      }
    }

    const nextDocument = reduceOperations(workingDocument, resolved.operations)
    deltaDraft.push(...buildSemanticDraft({
      beforeDocument: workingDocument,
      afterDocument: nextDocument,
      operations: resolved.operations
    }))
    operations.push(...resolved.operations)
    workingDocument = nextDocument
  }

  return {
    operations,
    deltaDraft,
    issues,
    canApply: true
  }
}
