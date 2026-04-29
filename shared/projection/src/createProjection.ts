import { scheduler } from '../../core/src/index'
import {
  createFamilyStore
} from '../../core/src/store/familyStore'
import {
  createKeyedReadStore
} from '../../core/src/store/keyed'
import {
  createValueStore
} from '../../core/src/store/value'
import type {
  KeyedReadStore,
  ReadStore
} from '../../core/src/store/types'
import type {
  MutationChange,
  MutationDelta
} from '@shared/mutation'
import type {
  Action,
  Revision
} from './core'
import {
  createPhaseGraph
} from './phaseGraph'
import type {
  Phase as ProjectionTracePhase,
  Run as ProjectionTrace
} from './trace'

export interface ProjectionPhaseStatus {
  changed: boolean
  startedAt: number
  endedAt: number
}

export interface ProjectionDirty {
  reset: boolean
  delta: MutationDelta
  [key: string]: unknown
}

export interface ProjectionContext<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string = string
> {
  input: TInput
  state: TState
  revision: Revision
  dirty: ProjectionDirty
  phase: Record<TPhaseName, ProjectionPhaseStatus>
}

export interface ProjectionValueFieldSyncContext<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string = string
> {
  input: TInput
  state: TState
  revision: Revision
  dirty: ProjectionDirty
  phase: Record<TPhaseName, ProjectionPhaseStatus>
}

export interface ProjectionFamilySnapshot<TKey extends string | number, TValue> {
  ids: readonly TKey[]
  byId: ReadonlyMap<TKey, TValue>
}

export interface ProjectionFamilyPatch<TKey extends string | number> {
  order?: true
  set?: readonly TKey[]
  remove?: readonly TKey[]
}

export interface ProjectionChangedKeys {
  keys: readonly string[]
}

export interface ProjectionFamilyPatchKeys {
  create?: readonly string[]
  update?: readonly string[]
  remove?: readonly string[]
  order?: readonly string[]
}

export interface ProjectionValueField<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string,
  TValue
> {
  kind: 'value'
  read(state: TState): TValue
  isEqual?: (left: TValue, right: TValue) => boolean
  changed?:
    | ProjectionChangedKeys
    | ((context: ProjectionValueFieldSyncContext<TInput, TState, TPhaseName>) => boolean)
}

export interface ProjectionFamilyField<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string,
  TKey extends string | number,
  TValue
> {
  kind: 'family'
  read(state: TState): ProjectionFamilySnapshot<TKey, TValue>
  isEqual?: (left: TValue, right: TValue) => boolean
  idsEqual?: (left: readonly TKey[], right: readonly TKey[]) => boolean
  changed?:
    | ProjectionChangedKeys
    | ((context: ProjectionValueFieldSyncContext<TInput, TState, TPhaseName>) => boolean)
  patch?:
    | ProjectionFamilyPatchKeys
    | ((context: ProjectionValueFieldSyncContext<TInput, TState, TPhaseName> & {
        previous: ProjectionFamilySnapshot<TKey, TValue>
        next: ProjectionFamilySnapshot<TKey, TValue>
      }) => ProjectionFamilyPatch<TKey> | 'replace' | 'skip')
}

export type ProjectionSurfaceField<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string
> =
  | ProjectionValueField<TInput, TState, TPhaseName, any>
  | ProjectionFamilyField<TInput, TState, TPhaseName, any, any>

export type ProjectionSurfaceTree<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string
> = {
  [key: string]:
    | ProjectionSurfaceField<TInput, TState, TPhaseName>
    | ProjectionSurfaceTree<TInput, TState, TPhaseName>
}

export type ProjectionStoreRead<TField> =
  TField extends ProjectionValueField<any, any, any, infer TValue>
    ? ReadStore<TValue>
    : TField extends ProjectionFamilyField<any, any, any, infer TKey, infer TValue>
      ? {
          ids: ReadStore<readonly TKey[]>
          byId: KeyedReadStore<TKey, TValue | undefined>
        }
      : TField extends ProjectionSurfaceTree<any, any, any>
        ? {
            [TKey in keyof TField]: ProjectionStoreRead<TField[TKey]>
          }
        : never

export type ProjectionPhase<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string
> = (
  context: ProjectionContext<TInput, TState, TPhaseName>
) => void

export type ProjectionPhaseSpec<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string
> =
  | ProjectionPhase<TInput, TState, TPhaseName>
  | {
      after?: readonly TPhaseName[]
      run: ProjectionPhase<TInput, TState, TPhaseName>
    }

export type ProjectionPhaseTable<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string
> = Record<TPhaseName, ProjectionPhaseSpec<TInput, TState, TPhaseName>>

export interface ProjectionCreateOptions<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TRead,
  TOutput,
  TSurface extends ProjectionSurfaceTree<TInput, TState, TPhaseName>,
  TPhaseName extends string
> {
  createState(): TState
  createRead(runtime: {
    state: () => TState
    revision: () => Revision
    current: () => TOutput
  }): TRead
  output(input: {
    state: TState
    read: TRead
    revision: Revision
  }): TOutput
  surface: TSurface
  phases: ProjectionPhaseTable<TInput, TState, TPhaseName>
}

export interface ProjectionRuntime<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TRead,
  TOutput,
  TSurfaceRead,
  TPhaseName extends string
> {
  revision(): Revision
  state(): TState
  current(): TOutput
  read: TRead
  stores: TSurfaceRead
  update(input: TInput): {
    revision: Revision
    output: TOutput
    trace: ProjectionTrace<TPhaseName>
  }
  subscribe(
    listener: (result: {
      revision: Revision
      output: TOutput
      trace: ProjectionTrace<TPhaseName>
    }) => void
  ): () => void
}

type CompiledChangedMatcher<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string
> = (
  context: ProjectionValueFieldSyncContext<TInput, TState, TPhaseName>
) => boolean

type CompiledFamilyPatchBuilder<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string,
  TKey extends string | number,
  TValue
> = (
  context: ProjectionValueFieldSyncContext<TInput, TState, TPhaseName> & {
    previous: ProjectionFamilySnapshot<TKey, TValue>
    next: ProjectionFamilySnapshot<TKey, TValue>
  }
) => ProjectionFamilyPatch<TKey> | 'replace' | 'skip'

type SurfaceSync = () => void

const sameValue = <T,>(
  left: T,
  right: T
) => Object.is(left, right)

const isField = <
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string
>(
  value:
    | ProjectionSurfaceField<TInput, TState, TPhaseName>
    | ProjectionSurfaceTree<TInput, TState, TPhaseName>
): value is ProjectionSurfaceField<TInput, TState, TPhaseName> => (
  typeof value === 'object'
  && value !== null
  && 'kind' in value
  && (
    value.kind === 'value'
    || value.kind === 'family'
  )
)

const hasDeltaKey = (
  delta: MutationDelta,
  key: string
): boolean => delta.reset === true
  || delta.changes.has(key)

const collectChangeIds = (
  change: MutationChange | undefined
): readonly string[] | 'all' | undefined => {
  if (!change) {
    return undefined
  }

  if (change.ids !== undefined) {
    return change.ids
  }

  if (change.paths === 'all') {
    return 'all'
  }

  if (change.paths) {
    return Object.keys(change.paths)
  }

  return undefined
}

const compileChangedMatcher = <
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string
>(
  changed:
    | ProjectionChangedKeys
    | ((context: ProjectionValueFieldSyncContext<TInput, TState, TPhaseName>) => boolean)
    | undefined
): CompiledChangedMatcher<TInput, TState, TPhaseName> | undefined => {
  if (!changed) {
    return undefined
  }

  if (typeof changed === 'function') {
    return changed
  }

  const keys = [...changed.keys]
  return (context) => keys.some((key) => hasDeltaKey(context.dirty.delta, key))
}

const collectPatchIds = (
  delta: MutationDelta,
  keys: readonly string[] | undefined
): {
  hit: boolean
  ids: Set<string> | 'all'
} => {
  let hit = false
  const ids = new Set<string>()
  for (const key of keys ?? []) {
    const change = delta.changes.get(key)
    if (change === undefined) {
      continue
    }

    hit = true
    const touched = collectChangeIds(change)
    if (touched === 'all') {
      return {
        hit: true,
        ids: 'all'
      }
    }

    touched?.forEach((id) => {
      ids.add(id)
    })
  }

  return {
    hit,
    ids
  }
}

const compilePatchBuilder = <
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string,
  TKey extends string | number,
  TValue
>(
  patch:
    | ProjectionFamilyPatchKeys
    | ((context: ProjectionValueFieldSyncContext<TInput, TState, TPhaseName> & {
        previous: ProjectionFamilySnapshot<TKey, TValue>
        next: ProjectionFamilySnapshot<TKey, TValue>
      }) => ProjectionFamilyPatch<TKey> | 'replace' | 'skip')
    | undefined
): CompiledFamilyPatchBuilder<TInput, TState, TPhaseName, TKey, TValue> | undefined => {
  if (!patch) {
    return undefined
  }

  if (typeof patch === 'function') {
    return patch
  }

  const createKeys = [...(patch.create ?? [])]
  const updateKeys = [...(patch.update ?? [])]
  const removeKeys = [...(patch.remove ?? [])]
  const orderKeys = [...(patch.order ?? [])]

  return (context) => {
    const delta = context.dirty.delta
    if (delta.reset === true) {
      return 'replace'
    }

    const created = collectPatchIds(delta, createKeys)
    if (created.ids === 'all') {
      return 'replace'
    }
    const updated = collectPatchIds(delta, updateKeys)
    if (updated.ids === 'all') {
      return 'replace'
    }
    const removed = collectPatchIds(delta, removeKeys)
    if (removed.ids === 'all') {
      return 'replace'
    }
    const order = orderKeys.some((key) => delta.changes.has(key))

    if (!created.hit && !updated.hit && !removed.hit && !order) {
      return 'skip'
    }

    const set = new Set<TKey>()
    created.ids.forEach((id) => {
      set.add(id as TKey)
    })
    updated.ids.forEach((id) => {
      set.add(id as TKey)
    })

    const remove = new Set<TKey>()
    removed.ids.forEach((id) => {
      const key = id as TKey
      remove.add(key)
      set.delete(key)
    })

    return {
      ...(order
        ? {
            order: true as const
          }
        : {}),
      ...(set.size > 0
        ? {
            set: [...set]
          }
        : {}),
      ...(remove.size > 0
        ? {
            remove: [...remove]
          }
        : {})
    }
  }
}

const normalizeFamilySnapshot = <TKey extends string | number, TValue>(
  snapshot: ProjectionFamilySnapshot<TKey, TValue>,
  previous: ProjectionFamilySnapshot<TKey, TValue> | undefined,
  idsEqual: (left: readonly TKey[], right: readonly TKey[]) => boolean
): ProjectionFamilySnapshot<TKey, TValue> => {
  if (previous && idsEqual(previous.ids, snapshot.ids)) {
    return {
      ids: previous.ids,
      byId: snapshot.byId
    }
  }

  return snapshot
}

const toFamilyPatch = <TKey extends string | number, TValue>(input: {
  previous: ProjectionFamilySnapshot<TKey, TValue>
  next: ProjectionFamilySnapshot<TKey, TValue>
  patch: ProjectionFamilyPatch<TKey>
}): {
  ids?: readonly TKey[]
  set?: readonly (readonly [TKey, TValue])[]
  remove?: readonly TKey[]
} => {
  const result: {
    ids?: readonly TKey[]
    set?: readonly (readonly [TKey, TValue])[]
    remove?: readonly TKey[]
  } = {}

  if (input.patch.order && input.previous.ids !== input.next.ids) {
    result.ids = input.next.ids
  }

  if (input.patch.set?.length) {
    result.set = input.patch.set.map((key) => {
      const value = input.next.byId.get(key)
      if (value === undefined) {
        throw new Error(
          `Projection family patch set key ${key} is missing from next snapshot.`
        )
      }
      return [key, value] as const
    })
  }

  if (input.patch.remove?.length) {
    result.remove = input.patch.remove
  }

  return result
}

const compileFieldChanged = <
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string
>(input: {
  field: ProjectionSurfaceField<TInput, TState, TPhaseName>
  patch?: ProjectionFamilyPatchKeys | CompiledFamilyPatchBuilder<TInput, TState, TPhaseName, any, any>
}) => {
  const explicit = compileChangedMatcher(
    input.field.changed as
      | ProjectionChangedKeys
      | ((context: ProjectionValueFieldSyncContext<TInput, TState, TPhaseName>) => boolean)
      | undefined
  )
  if (explicit) {
    return explicit
  }

  if (!input.patch || typeof input.patch === 'function') {
    return undefined
  }

  const keys = [
    ...(input.patch.create ?? []),
    ...(input.patch.update ?? []),
    ...(input.patch.remove ?? []),
    ...(input.patch.order ?? [])
  ]
  return compileChangedMatcher({
    keys
  })
}

const createSurfaceStore = <
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string,
  TSurface extends ProjectionSurfaceTree<TInput, TState, TPhaseName>
>(
  surface: TSurface,
  state: TState,
  readContext: () => ProjectionValueFieldSyncContext<TInput, TState, TPhaseName>
): {
  read: ProjectionStoreRead<TSurface>
  sync: () => void
} => {
  const syncers: SurfaceSync[] = []

  const build = (
    currentSurface: ProjectionSurfaceTree<TInput, TState, TPhaseName>,
    currentState: TState
  ): unknown => {
    const next: Record<string, unknown> = {}

    Object.entries(currentSurface).forEach(([key, field]) => {
      if (isField(field)) {
        if (field.kind === 'value') {
          const initial = field.read(currentState)
          const source = createValueStore(initial)
          const isEqual = field.isEqual ?? sameValue
          const changed = compileFieldChanged({
            field
          })
          let previous = initial

          syncers.push(() => {
            const context = readContext()
            if (changed?.(context) === false) {
              return
            }

            const current = field.read(state)
            if (isEqual(previous, current)) {
              return
            }

            previous = current
            source.set(current)
          })

          next[key] = source
          return
        }

        const idsEqual = field.idsEqual ?? sameValue
        const initial = normalizeFamilySnapshot(
          field.read(currentState),
          undefined,
          idsEqual
        )
        const source = createFamilyStore({
          initial,
          isEqual: field.isEqual as ((left: unknown, right: unknown) => boolean) | undefined
        })
        const patch = typeof field.patch === 'function'
          ? field.patch as CompiledFamilyPatchBuilder<TInput, TState, TPhaseName, string, unknown>
          : compilePatchBuilder(
              field.patch as ProjectionFamilyPatchKeys | undefined
            ) as CompiledFamilyPatchBuilder<TInput, TState, TPhaseName, string, unknown> | undefined
        const changed = compileFieldChanged({
          field,
          patch: typeof field.patch === 'function'
            ? patch
            : field.patch
        })
        let previous = initial

        syncers.push(() => {
          const context = readContext()
          if (changed?.(context) === false) {
            return
          }

          const currentPrevious = previous
          const current = normalizeFamilySnapshot(
            field.read(state),
            currentPrevious,
            idsEqual as (left: readonly string[], right: readonly string[]) => boolean
          ) as ProjectionFamilySnapshot<string, unknown>
          const nextPatch = patch?.({
            ...context,
            previous: currentPrevious as ProjectionFamilySnapshot<string, unknown>,
            next: current
          }) ?? 'replace'

          if (nextPatch === 'skip') {
            previous = current
            return
          }

          if (nextPatch === 'replace') {
            previous = current
            source.write.replace(current)
            return
          }

          source.write.apply(toFamilyPatch({
            previous: currentPrevious,
            next: current,
            patch: nextPatch
          }))
          previous = current
        })

        next[key] = {
          ids: source.ids,
          byId: createKeyedReadStore({
            get: source.byId.read.get,
            subscribe: source.byId.subscribe.key,
            ...(field.isEqual
              ? {
                  isEqual: field.isEqual as (left: unknown, right: unknown) => boolean
                }
              : {})
          })
        }
        return
      }

      next[key] = build(
        field as ProjectionSurfaceTree<TInput, TState, TPhaseName>,
        currentState
      )
    })

    return next
  }

  return {
    read: build(surface, state) as ProjectionStoreRead<TSurface>,
    sync: () => {
      syncers.forEach((sync) => {
        sync()
      })
    }
  }
}

const toPhaseSpec = <
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TPhaseName extends string
>(
  spec: ProjectionPhaseSpec<TInput, TState, TPhaseName>
): {
  after?: readonly TPhaseName[]
  run: ProjectionPhase<TInput, TState, TPhaseName>
} => typeof spec === 'function'
  ? {
      run: spec
    }
  : spec

const toTraceAction = (
  changed: boolean
): Action => changed
  ? 'sync'
  : 'reuse'

export const createProjection = <
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TRead,
  TOutput,
  TPhaseName extends string,
  TSurface extends ProjectionSurfaceTree<TInput, TState, TPhaseName>
>(
  model: ProjectionCreateOptions<
    TInput,
    TState,
    TRead,
    TOutput,
    TSurface,
    TPhaseName
  >
): ProjectionRuntime<
  TInput,
  TState,
  TRead,
  TOutput,
  ProjectionStoreRead<TSurface>,
  TPhaseName
> => {
  const compiledPhases = Object.fromEntries(
    Object.entries(model.phases).map(([phaseName, spec]) => [
      phaseName,
      toPhaseSpec(spec as ProjectionPhaseSpec<TInput, TState, TPhaseName>)
    ])
  ) as Record<
    TPhaseName,
    {
      after?: readonly TPhaseName[]
      run: ProjectionPhase<TInput, TState, TPhaseName>
    }
  >
  const graph = createPhaseGraph(compiledPhases)
  const state = model.createState()
  let currentRevision = 0 as Revision
  let currentOutput!: TOutput
  let currentContext:
    | ProjectionValueFieldSyncContext<TInput, TState, TPhaseName>
    | undefined
  const listeners = new Set<(result: {
    revision: Revision
    output: TOutput
    trace: ProjectionTrace<TPhaseName>
  }) => void>()

  const read = model.createRead({
    state: () => state,
    revision: () => currentRevision,
    current: () => currentOutput
  })
  const surface = createSurfaceStore(
    model.surface,
    state,
    () => {
      if (!currentContext) {
        throw new Error('Projection surface sync context is unavailable.')
      }
      return currentContext
    }
  )

  currentOutput = model.output({
    state,
    read,
    revision: currentRevision
  })

  return {
    revision: () => currentRevision,
    state: () => state,
    current: () => currentOutput,
    read,
    stores: surface.read,
    update: (input) => {
      const revision = (currentRevision + 1) as Revision
      const phaseState = Object.fromEntries(
        graph.order.map((phaseName) => [
          phaseName,
          {
            changed: false,
            startedAt: 0,
            endedAt: 0
          }
        ])
      ) as Record<TPhaseName, ProjectionPhaseStatus>
      const context: ProjectionContext<TInput, TState, TPhaseName> = {
        input,
        state,
        revision,
        dirty: {
          reset: input.delta.reset === true,
          delta: input.delta
        },
        phase: phaseState
      }
      const tracePhases: ProjectionTracePhase<TPhaseName>[] = []
      const totalStartAt = scheduler.readMonotonicNow()

      graph.order.forEach((phaseName) => {
        const spec = graph.specs.get(phaseName)!
        const status = context.phase[phaseName]
        status.startedAt = scheduler.readMonotonicNow()
        spec.run(context)
        status.endedAt = scheduler.readMonotonicNow()

        tracePhases.push({
          name: phaseName,
          action: toTraceAction(status.changed),
          changed: status.changed,
          durationMs: status.endedAt - status.startedAt
        })
      })

      currentContext = context
      currentRevision = revision
      surface.sync()
      currentContext = undefined

      currentOutput = model.output({
        state,
        read,
        revision
      })

      const result = {
        revision,
        output: currentOutput,
        trace: {
          revision,
          phases: tracePhases,
          totalMs: scheduler.readMonotonicNow() - totalStartAt
        }
      }

      listeners.forEach((listener) => {
        listener(result)
      })

      return result
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
