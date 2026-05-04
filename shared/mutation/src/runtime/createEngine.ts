import {
  createMutationChange,
  type MutationChange
} from '../change/createChange'
import type {
  MutationCompile,
  MutationIssue,
  MutationResult
} from '../compile/types'
import {
  getCompiledMutationSchema,
  type CompiledMutationSchema
} from '../compile/schema'
import {
  applyMutationWrites
} from '../internal/apply'
import {
  createMutationQuery
} from '../query/createQuery'
import {
  createMutationReader
} from '../reader/createReader'
import type {
  MutationSchema
} from '../schema/node'
import type {
  MutationDocument
} from '../schema/value'
import {
  createMutationWriter
} from '../writer/createWriter'
import type {
  MutationWrite
} from '../writer/writes'
import {
  createMutationHistory,
  type MutationHistoryState,
  type MutationOrigin
} from './history'

export type MutationCommit<TSchema extends MutationSchema> = {
  kind: 'apply' | 'replace'
  origin: MutationOrigin
  document: MutationDocument<TSchema>
  writes: readonly MutationWrite[]
  inverse: readonly MutationWrite[]
  change: MutationChange<TSchema>
}

export type MutationCommitOptions = {
  origin?: MutationOrigin
  history?: boolean
}

export type MutationEngineHistory<TSchema extends MutationSchema> = {
  state(): MutationHistoryState
  canUndo(): boolean
  canRedo(): boolean
  undo(): MutationCommit<TSchema> | undefined
  redo(): MutationCommit<TSchema> | undefined
  clear(): void
}

type MutationCommitListener<TSchema extends MutationSchema> = (
  commit: MutationCommit<TSchema>
) => void

type MutationWatchMatcher<TSchema extends MutationSchema> = (
  change: MutationChange<TSchema>,
  commit: MutationCommit<TSchema>
) => boolean

type MutationWatchEntry<TSchema extends MutationSchema> = {
  matches: MutationWatchMatcher<TSchema>
  listener: MutationCommitListener<TSchema>
}

type MutationEngineOptions<
  TSchema extends MutationSchema,
  TIntent extends {
    type: string
  } = never,
  TServices = void
> = {
  schema: TSchema
  document: MutationDocument<TSchema>
  normalize?: (document: MutationDocument<TSchema>) => MutationDocument<TSchema>
  compile?: MutationCompile<TSchema, TIntent, TServices>
  services?: TServices
  history?: boolean | ReturnType<typeof createMutationHistory>
}

export type MutationEngine<
  TSchema extends MutationSchema,
  TIntent extends {
    type: string
  } = never
> = {
  readonly schema: TSchema
  readonly compiled: CompiledMutationSchema
  document(): MutationDocument<TSchema>
  apply(
    writes: readonly MutationWrite[],
    options?: MutationCommitOptions
  ): MutationCommit<TSchema>
  replace(
    document: MutationDocument<TSchema>,
    options?: MutationCommitOptions
  ): MutationCommit<TSchema>
  execute(
    intent: TIntent,
    options?: MutationCommitOptions
  ): MutationResult<unknown, MutationCommit<TSchema>>
  execute(
    intent: readonly TIntent[],
    options?: MutationCommitOptions
  ): MutationResult<readonly unknown[], MutationCommit<TSchema>>
  subscribe(listener: MutationCommitListener<TSchema>): () => void
  watch(
    matches: MutationWatchMatcher<TSchema>,
    listener: MutationCommitListener<TSchema>
  ): () => void
  readonly history: MutationEngineHistory<TSchema>
}

type MutationIssueCollector = {
  add(issue: MutationIssue): void
  all(): readonly MutationIssue[]
  hasErrors(): boolean
}

const createIssueCollector = (): MutationIssueCollector => {
  const issues: MutationIssue[] = []

  return {
    add(issue) {
      issues.push(issue)
    },
    all() {
      return issues
    },
    hasErrors() {
      return issues.length > 0
    }
  }
}

const hasVisibleCommit = <TSchema extends MutationSchema>(
  commit: MutationCommit<TSchema>
): boolean => commit.change.reset() || commit.writes.length > 0

const shouldCaptureHistory = (
  historyEnabled: boolean,
  writes: readonly MutationWrite[],
  origin: MutationOrigin,
  options?: MutationCommitOptions
): boolean => {
  if (!historyEnabled || writes.length === 0 || origin === 'history') {
    return false
  }

  if (options?.history !== undefined) {
    return options.history
  }

  return origin === 'user'
}

export const createMutationEngine = <
  TSchema extends MutationSchema,
  TIntent extends {
    type: string
  } = never,
  TServices = void
>(
  options: MutationEngineOptions<TSchema, TIntent, TServices>
): MutationEngine<TSchema, TIntent> => {
  const compiled = getCompiledMutationSchema(options.schema)
  const historyController = typeof options.history === 'object'
    ? options.history
    : createMutationHistory()
  const historyEnabled = options.history !== false
  const listeners = new Set<MutationCommitListener<TSchema>>()
  const watches = new Set<MutationWatchEntry<TSchema>>()
  let currentDocument = options.normalize
    ? options.normalize(options.document)
    : options.document

  const notify = (commit: MutationCommit<TSchema>): void => {
    if (!hasVisibleCommit(commit)) {
      return
    }

    listeners.forEach((listener) => {
      listener(commit)
    })

    watches.forEach((entry) => {
      if (entry.matches(commit.change, commit)) {
        entry.listener(commit)
      }
    })
  }

  const applyCommit = (
    writes: readonly MutationWrite[],
    commitOptions?: MutationCommitOptions
  ): MutationCommit<TSchema> => {
    const origin = commitOptions?.origin ?? 'user'
    const result = writes.length === 0
      ? {
          document: currentDocument,
          inverse: [] as readonly MutationWrite[]
        }
      : applyMutationWrites(options.schema, currentDocument, writes)

    currentDocument = result.document

    if (shouldCaptureHistory(historyEnabled, writes, origin, commitOptions)) {
      historyController.push({
        writes,
        inverse: result.inverse
      })
    }

    const commit: MutationCommit<TSchema> = {
      kind: 'apply',
      origin,
      document: currentDocument,
      writes,
      inverse: result.inverse,
      change: createMutationChange(options.schema, writes)
    }

    notify(commit)
    return commit
  }

  const replaceCommit = (
    document: MutationDocument<TSchema>,
    commitOptions?: MutationCommitOptions
  ): MutationCommit<TSchema> => {
    currentDocument = options.normalize
      ? options.normalize(document)
      : document
    historyController.clear()

    const commit: MutationCommit<TSchema> = {
      kind: 'replace',
      origin: commitOptions?.origin ?? 'system',
      document: currentDocument,
      writes: [],
      inverse: [],
      change: createMutationChange(options.schema, [], {
        reset: true
      })
    }

    notify(commit)
    return commit
  }

  const replayHistory = (
    writes: readonly MutationWrite[],
    inverse: readonly MutationWrite[]
  ): MutationCommit<TSchema> => {
    const result = writes.length === 0
      ? {
          document: currentDocument,
          inverse
        }
      : applyMutationWrites(options.schema, currentDocument, writes)

    currentDocument = result.document

    const commit: MutationCommit<TSchema> = {
      kind: 'apply',
      origin: 'history',
      document: currentDocument,
      writes,
      inverse,
      change: createMutationChange(options.schema, writes)
    }

    notify(commit)
    return commit
  }

  const history: MutationEngineHistory<TSchema> = {
    state() {
      return historyController.state()
    },
    canUndo() {
      return historyController.canUndo()
    },
    canRedo() {
      return historyController.canRedo()
    },
    undo() {
      const entry = historyController.popUndo()
      if (!entry) {
        return undefined
      }

      return replayHistory(entry.inverse, entry.writes)
    },
    redo() {
      const entry = historyController.popRedo()
      if (!entry) {
        return undefined
      }

      return replayHistory(entry.writes, entry.inverse)
    },
    clear() {
      historyController.clear()
    }
  }

  function execute(
    intent: TIntent,
    options?: MutationCommitOptions
  ): MutationResult<unknown, MutationCommit<TSchema>>
  function execute(
    intent: readonly TIntent[],
    options?: MutationCommitOptions
  ): MutationResult<readonly unknown[], MutationCommit<TSchema>>
  function execute(
    intent: TIntent | readonly TIntent[],
    commitOptions?: MutationCommitOptions
  ): MutationResult<unknown | readonly unknown[], MutationCommit<TSchema>> {
    if (!options.compile) {
      return {
        ok: false,
        issues: [{
          code: 'mutation.compile.missing',
          message: 'Mutation engine compile handlers are not configured.'
        }]
      }
    }

    const intents = Array.isArray(intent)
      ? intent
      : [intent]
    let compileDocument = currentDocument
    const writes: MutationWrite[] = []
    const issue = createIssueCollector()
    const data: unknown[] = []

    for (const nextIntent of intents) {
      const handler = options.compile.handlers[nextIntent.type]
      if (!handler) {
        return {
          ok: false,
          issues: [{
            code: 'mutation.compile.handler_missing',
            message: `No mutation compile handler for intent type "${nextIntent.type}".`
          }]
        }
      }

      const read = createMutationReader(options.schema, compileDocument)
      const write = createMutationWriter(options.schema, writes)
      const query = createMutationQuery(options.schema, compileDocument)
      const previousWriteCount = writes.length
      const previousIssueCount = issue.all().length

      data.push(handler({
        intent: nextIntent,
        document: compileDocument,
        read,
        write,
        query,
        get change() {
          return createMutationChange(options.schema, writes)
        },
        issue,
        services: options.services as TServices
      }))

      if (issue.all().length > previousIssueCount) {
        writes.length = previousWriteCount
        break
      }

      const nextWrites = writes.slice(previousWriteCount)
      if (nextWrites.length === 0) {
        continue
      }

      compileDocument = applyMutationWrites(
        options.schema,
        compileDocument,
        nextWrites
      ).document
    }

    if (issue.hasErrors()) {
      return {
        ok: false,
        issues: issue.all()
      }
    }

    const commit = applyCommit(writes, commitOptions)
    return {
      ok: true,
      data: Array.isArray(intent)
        ? data
        : data[0],
      commit
    }
  }

  return {
    schema: options.schema,
    compiled,
    document() {
      return currentDocument
    },
    apply(writes, commitOptions) {
      return applyCommit(writes, commitOptions)
    },
    replace(document, commitOptions) {
      return replaceCommit(document, commitOptions)
    },
    execute,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    watch(matches, listener) {
      const entry: MutationWatchEntry<TSchema> = {
        matches,
        listener
      }
      watches.add(entry)
      return () => {
        watches.delete(entry)
      }
    },
    history
  }
}
