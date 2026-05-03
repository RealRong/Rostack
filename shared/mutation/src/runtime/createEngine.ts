import {
  createMutationDelta,
  createMutationResetDelta,
  type MutationDelta
} from '../delta/createDelta'
import {
  applyMutationWrites
} from '../internal/apply'
import {
  applyMutationWritesWithInverse
} from '../internal/inverse'
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
import type {
  MutationCompile,
  MutationIssue,
  MutationResult
} from '../compile/types'
import {
  createMutationHistory,
  type MutationOrigin
} from './history'

export type MutationCommit<TSchema extends MutationSchema> = {
  kind: 'apply' | 'replace'
  origin: MutationOrigin
  document: MutationDocument<TSchema>
  writes: readonly MutationWrite[]
  inverse: readonly MutationWrite[]
  delta: MutationDelta<TSchema>
}

export type MutationCurrent<TSchema extends MutationSchema> = {
  rev: number
  document: MutationDocument<TSchema>
}

export type MutationEngineOptions<
  TSchema extends MutationSchema,
  TIntent extends {
    type: string
  },
  TServices
> = {
  schema: TSchema
  document: MutationDocument<TSchema>
  normalize(document: MutationDocument<TSchema>): MutationDocument<TSchema>
  compile: MutationCompile<TSchema, TIntent, TServices>
  services: TServices
  history?: boolean
}

const createIssueCollector = () => {
  const issues: MutationIssue[] = []
  return {
    add(issue: MutationIssue) {
      issues.push(issue)
    },
    all: () => [...issues],
    hasErrors: () => issues.length > 0
  }
}

export const createMutationEngine = <
  TSchema extends MutationSchema,
  TIntent extends {
    type: string
  },
  TServices = void
>(options: MutationEngineOptions<TSchema, TIntent, TServices>) => {
  let document = options.normalize(options.document)
  let rev = 0
  const history = createMutationHistory()
  const commitListeners = new Set<(commit: MutationCommit<TSchema>) => void>()
  const watchListeners = new Set<(current: MutationCurrent<TSchema>) => void>()

  const runIntent = <TCurrentIntent extends TIntent>(
    intent: TCurrentIntent,
    workingDocument: MutationDocument<TSchema>,
    issues: ReturnType<typeof createIssueCollector>,
    outputs: unknown[],
    allWrites: MutationWrite[]
  ): MutationDocument<TSchema> => {
    const handler = options.compile.handlers[intent.type]
    if (!handler) {
      issues.add({
        code: 'missing_handler',
        message: `Missing mutation compile handler for "${intent.type}".`
      })
      return workingDocument
    }

    const scopedWrites: MutationWrite[] = []
    const writer = createMutationWriter(options.schema, scopedWrites)
    const read = createMutationReader(options.schema, () => workingDocument)
    const query = createMutationQuery(options.schema, () => workingDocument)
    const change = createMutationDelta(options.schema, scopedWrites)
    const result = handler({
      intent,
      document: workingDocument,
      read,
      write: writer,
      query,
      change,
      issue: issues,
      services: options.services
    })
    outputs.push(result)
    allWrites.push(...scopedWrites)
    return applyMutationWrites(workingDocument, scopedWrites)
  }

  const current = (): MutationCurrent<TSchema> => ({
    rev,
    document
  })

  const publish = (commit: MutationCommit<TSchema>) => {
    rev += 1
    commitListeners.forEach((listener) => {
      listener(commit)
    })
    watchListeners.forEach((listener) => {
      listener(current())
    })
    return commit
  }

  const commitApply = (
    writes: readonly MutationWrite[],
    origin: MutationOrigin,
    trackHistory: boolean
  ) => {
    const applied = applyMutationWritesWithInverse(document, writes)
    document = options.normalize(applied.document)
    const delta = createMutationDelta(options.schema, writes)
    const commit = publish({
      kind: 'apply',
      origin,
      document,
      writes,
      inverse: applied.inverse,
      delta
    })

    if (trackHistory && origin !== 'history') {
      history.push({
        writes,
        inverse: applied.inverse
      })
    }

    return commit
  }

  return {
    document: () => document,
    current,
    reader: () => createMutationReader(options.schema, () => document),
    query: () => createMutationQuery(options.schema, () => document),
    apply(writes: readonly MutationWrite[], applyOptions?: {
      origin?: MutationOrigin
      history?: boolean
    }) {
      return commitApply(
        writes,
        applyOptions?.origin ?? 'user',
        applyOptions?.history ?? options.history !== false
      )
    },
    execute(intents: TIntent | readonly TIntent[], executeOptions?: {
      origin?: MutationOrigin
      history?: boolean
    }): MutationResult<readonly unknown[], MutationCommit<TSchema>> {
      const list = Array.isArray(intents)
        ? intents
        : [intents]
      const outputs: unknown[] = []
      const allWrites: MutationWrite[] = []
      const issues = createIssueCollector()
      let workingDocument = document

      list.forEach((intent) => {
        workingDocument = runIntent(
          intent,
          workingDocument,
          issues,
          outputs,
          allWrites
        )
      })

      if (issues.hasErrors()) {
        return {
          ok: false,
          issues: issues.all()
        }
      }

      return {
        ok: true,
        data: outputs,
        commit: commitApply(
          allWrites,
          executeOptions?.origin ?? 'user',
          executeOptions?.history ?? options.history !== false
        )
      }
    },
    replace(nextDocument: MutationDocument<TSchema>, replaceOptions?: {
      origin?: MutationOrigin
      history?: boolean
    }) {
      const previousDocument = document
      document = options.normalize(nextDocument)
      const commit = publish({
        kind: 'replace',
        origin: replaceOptions?.origin ?? 'system',
        document,
        writes: [],
        inverse: [],
        delta: createMutationResetDelta(options.schema)
      })
      if (replaceOptions?.history) {
        history.push({
          writes: [],
          inverse: []
        })
      }
      return {
        ...commit,
        previousDocument
      }
    },
    subscribe(listener: (commit: MutationCommit<TSchema>) => void) {
      commitListeners.add(listener)
      return () => {
        commitListeners.delete(listener)
      }
    },
    watch(listener: (current: MutationCurrent<TSchema>) => void) {
      watchListeners.add(listener)
      return () => {
        watchListeners.delete(listener)
      }
    },
    history: {
      state: () => history.state(),
      canUndo: () => history.canUndo(),
      canRedo: () => history.canRedo(),
      undo() {
        const entry = history.popUndo()
        if (!entry) {
          return undefined
        }
        const currentWrites = entry.inverse
        const nextDocument = applyMutationWrites(document, currentWrites)
        document = options.normalize(nextDocument)
        return publish({
          kind: 'apply',
          origin: 'history',
          document,
          writes: currentWrites,
          inverse: entry.writes,
          delta: createMutationDelta(options.schema, currentWrites)
        })
      },
      redo() {
        const entry = history.popRedo()
        if (!entry) {
          return undefined
        }
        const nextDocument = applyMutationWrites(document, entry.writes)
        document = options.normalize(nextDocument)
        return publish({
          kind: 'apply',
          origin: 'history',
          document,
          writes: entry.writes,
          inverse: entry.inverse,
          delta: createMutationDelta(options.schema, entry.writes)
        })
      },
      clear() {
        history.clear()
      }
    }
  }
}
