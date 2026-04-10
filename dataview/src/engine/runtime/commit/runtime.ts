import type { HistoryState } from '@dataview/engine/history'
import type {
  CommitDelta,
  DataDoc
} from '@dataview/core/contracts'
import { createResetDelta } from '@dataview/core/commit/delta'
import { createDeltaCollector } from '@dataview/core/commit/collector'
import { applyOperations } from '@dataview/core/operation'
import type { ResolvedWriteBatch } from '@dataview/engine/command'
import type {
  CommitResult,
  CommitTrace,
  CreatedEntities,
  CommandResult,
  TraceDeltaSummary
} from '../../types'
import type { ReadRuntime } from '../read/read'
import type { HistoryReplay } from './history'
import { historyStacks } from './history'
import type { ProjectRuntime } from '../../project/source'
import {
  now
} from '../../perf/shared'

interface CommitDocumentStore {
  peekDocument: () => DataDoc
  installDocument: (document: DataDoc) => DataDoc
}

export interface CommitRuntimeOptions {
  document: CommitDocumentStore
  read: Pick<ReadRuntime, 'clear' | 'syncDocument'>
  project: Pick<ProjectRuntime, 'clear' | 'syncDocument'>
  historyCapacity: number
  perf?: {
    enabled: boolean
    recordCommit: (trace: Omit<CommitTrace, 'id'>) => void
  }
}

export interface CommitRuntime {
  history: {
    state: () => HistoryState
    canUndo: () => boolean
    canRedo: () => boolean
    clear: () => void
    undo: () => CommitResult
    redo: () => CommitResult
  }
  dispatch: (writeBatch: ResolvedWriteBatch) => CommandResult
  replace: (document: DataDoc) => void
}

const createdFromChanges = (changes?: CommitResult['changes']): CreatedEntities | undefined => {
  if (!changes) {
    return undefined
  }

  const created: CreatedEntities = {
    records: changes.entities.records?.add,
    fields: changes.entities.fields?.add,
    views: changes.entities.views?.add
  }

  return created.records?.length || created.fields?.length || created.views?.length
    ? created
    : undefined
}

const createTraceDeltaSummary = (
  delta: CommitDelta
): TraceDeltaSummary => {
  const semantics = new Map<string, number>()
  delta.semantics.forEach((item: CommitDelta['semantics'][number]) => {
    semantics.set(item.kind, (semantics.get(item.kind) ?? 0) + 1)
  })

  return {
    summary: {
      ...delta.summary
    },
    semantics: Array.from(semantics.entries()).map(([kind, count]) => ({
      kind,
      ...(count > 1 ? { count } : {})
    })),
    entities: {
      touchedRecordCount: (
        delta.entities.records?.update === 'all'
        || delta.entities.values?.records === 'all'
      )
        ? 'all'
        : new Set([
            ...(delta.entities.records?.add ?? []),
            ...(Array.isArray(delta.entities.records?.update) ? delta.entities.records.update : []),
            ...(delta.entities.records?.remove ?? []),
            ...(Array.isArray(delta.entities.values?.records) ? delta.entities.values.records : [])
          ]).size || undefined,
      touchedFieldCount: (
        delta.entities.fields?.update === 'all'
        || delta.entities.values?.fields === 'all'
      )
        ? 'all'
        : new Set([
            ...(delta.entities.fields?.add ?? []),
            ...(Array.isArray(delta.entities.fields?.update) ? delta.entities.fields.update : []),
            ...(delta.entities.fields?.remove ?? []),
            ...(Array.isArray(delta.entities.values?.fields) ? delta.entities.values.fields : [])
          ]).size || undefined,
      touchedViewCount: (
        delta.entities.views?.update === 'all'
          ? 'all'
          : new Set([
              ...(delta.entities.views?.add ?? []),
              ...(Array.isArray(delta.entities.views?.update) ? delta.entities.views.update : []),
              ...(delta.entities.views?.remove ?? [])
            ]).size || undefined
      )
    }
  }
}

export const commitRuntime = (options: CommitRuntimeOptions): CommitRuntime => {
  const store = options.document
  const history = historyStacks({
    capacity: options.historyCapacity
  })
  const finalize = <TResult extends CommitResult>(input: {
    result: TResult
    shouldSyncDocument: boolean
    kind?: Omit<CommitTrace, 'id' | 'timings' | 'delta' | 'index' | 'project' | 'publish'>['kind']
    delta?: CommitDelta
    startedAt?: number
    commitMs?: number
  }): TResult => {
    const { result, shouldSyncDocument } = input
    if (shouldSyncDocument) {
      options.read.syncDocument(store.peekDocument(), result.changes)
      const projectResult = options.project.syncDocument(store.peekDocument(), result.changes)
      if (
        options.perf?.enabled
        && input.kind
        && input.delta
        && input.startedAt !== undefined
        && projectResult.trace
      ) {
        options.perf.recordCommit({
          kind: input.kind,
          timings: {
            totalMs: now() - input.startedAt,
            commitMs: input.commitMs,
            indexMs: projectResult.trace.timings.indexMs,
            projectMs: projectResult.trace.timings.projectMs,
            publishMs: projectResult.trace.timings.publishMs
          },
          delta: createTraceDeltaSummary(input.delta),
          index: projectResult.trace.index,
          project: projectResult.trace.project,
          publish: projectResult.trace.publish
        })
      }
    }
    return result
  }

  const dispatch = (writeBatch: ResolvedWriteBatch): CommandResult => {
    if (!writeBatch.canApply) {
      return finalize(
        {
          result: {
            issues: writeBatch.issues,
            applied: false
          },
          shouldSyncDocument: false
        }
      )
    }

    if (!writeBatch.operations.length) {
      return finalize(
        {
          result: {
            issues: writeBatch.issues,
            applied: false
          },
          shouldSyncDocument: false
        }
      )
    }

    const startedAt = now()
    const beforeDocument = store.peekDocument()
    const commitStart = now()
    const applied = applyOperations(
      beforeDocument,
      writeBatch.operations,
      createDeltaCollector(beforeDocument, writeBatch.deltaDraft)
    )
    const { undo, redo, document: afterDocument, delta } = applied
    store.installDocument(afterDocument)

    history.clearRedo()
    if (options.historyCapacity > 0) {
      history.pushUndo({ undo, redo })
    }

    return finalize(
      {
        result: {
          issues: writeBatch.issues,
          applied: true,
          changes: delta,
          created: createdFromChanges(delta)
        },
        shouldSyncDocument: true,
        kind: 'dispatch',
        delta,
        startedAt,
        commitMs: now() - commitStart
      }
    )
  }

  const replay = (
    replay?: HistoryReplay,
    kind: 'undo' | 'redo' = 'undo'
  ): CommitResult => {
    const entry = replay
    const beforeDocument = store.peekDocument()

    if (!entry) {
      return finalize(
        {
          result: {
            issues: [],
            applied: false
          },
          shouldSyncDocument: false
        }
      )
    }

    const startedAt = now()
    const commitStart = now()
    const { document: afterDocument, delta } = applyOperations(beforeDocument, entry.operations)
    store.installDocument(afterDocument)

    return finalize(
      {
        result: {
          issues: [],
          applied: true,
          changes: delta
        },
        shouldSyncDocument: true,
        kind,
        delta,
        startedAt,
        commitMs: now() - commitStart
      }
    )
  }

  const historyApi = {
    state: () => history.getState(),
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    clear: () => {
      history.clear()
    },
    undo: () => replay(history.undo(), 'undo'),
    redo: () => replay(history.redo(), 'redo')
  }

  return {
    history: historyApi,
    dispatch,
    replace: document => {
      const startedAt = now()
      const beforeDocument = store.peekDocument()
      const nextDocument = document
      const delta = createResetDelta(beforeDocument, nextDocument)

      history.clear()
      options.read.clear()
      options.project.clear()
      store.installDocument(nextDocument)
      options.read.syncDocument(nextDocument, delta)
      const projectResult = options.project.syncDocument(nextDocument, delta)
      if (options.perf?.enabled && projectResult.trace) {
        options.perf.recordCommit({
          kind: 'replace',
          timings: {
            totalMs: now() - startedAt,
            commitMs: 0,
            indexMs: projectResult.trace.timings.indexMs,
            projectMs: projectResult.trace.timings.projectMs,
            publishMs: projectResult.trace.timings.publishMs
          },
          delta: createTraceDeltaSummary(delta),
          index: projectResult.trace.index,
          project: projectResult.trace.project,
          publish: projectResult.trace.publish
        })
      }
    }
  }
}
