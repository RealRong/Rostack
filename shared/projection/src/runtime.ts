import { scheduler, store } from '@shared/core'
import {
  createPhaseGraph,
  fanoutDependents
} from './phaseGraph'
import type {
  Revision
} from './core'
import type {
  Spec as ProjectionPhase
} from './phase'
import type {
  PhaseScopeInput,
  PhaseScopeMap,
  ScopeInputValue,
  ScopeSchema,
  ScopeValue
} from './scope'
import type {
  Run as ProjectionTrace
} from './trace'
import {
  isScopeValueEmpty,
  mergeScopeValue,
  normalizeScopeValue
} from './scope'

type ProjectionValueField<TState, TValue> = {
  kind: 'value'
  read(state: TState): TValue
  isEqual?: (left: TValue, right: TValue) => boolean
}

type ProjectionFamilyField<TState, TKey extends string, TValue> = {
  kind: 'family'
  read(state: TState): {
    ids: readonly TKey[]
    byId: ReadonlyMap<TKey, TValue>
  }
  isEqual?: (left: TValue, right: TValue) => boolean
}

type ProjectionSurfaceField<TState> =
  | ProjectionValueField<TState, any>
  | ProjectionFamilyField<TState, string, any>

type ProjectionSurfaceTree<TState> = {
  [key: string]: ProjectionSurfaceField<TState> | ProjectionSurfaceTree<TState>
}

type ProjectionStoreRead<TField> =
  TField extends ProjectionValueField<any, infer TValue>
    ? store.ReadStore<TValue>
    : TField extends ProjectionFamilyField<any, infer TKey, infer TValue>
      ? {
          ids: store.ReadStore<readonly TKey[]>
          byId: store.KeyedReadStore<TKey, TValue | undefined>
        }
      : TField extends ProjectionSurfaceTree<any>
        ? {
            [TKey in keyof TField]: ProjectionStoreRead<TField[TKey]>
          }
        : never

type ProjectionPhaseContext<
  TInput,
  TState,
  TScope
> = {
  input: TInput
  state: TState
  revision: Revision
  scope: TScope
}

type ProjectionPhaseEntry<
  TInput,
  TState,
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName>,
  TPhaseMetrics
> = {
  [K in TPhaseName]: ProjectionPhase<
    ProjectionPhaseContext<
      TInput,
      TState,
      ScopeValue<TScopeMap[K]>
    >,
    TPhaseMetrics,
    TPhaseName,
    TScopeMap,
    K
  >
}

export interface ProjectionPlan<
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName>
> {
  phases?: Iterable<TPhaseName>
  scope?: PhaseScopeInput<TPhaseName, TScopeMap>
}

export interface ProjectionSpec<
  TInput,
  TState,
  TRead,
  TSurface extends ProjectionSurfaceTree<TState>,
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName>,
  TPhaseMetrics = unknown,
  TCapture = undefined
> {
  createState(): TState
  createRead(runtime: {
    state: () => TState
    revision: () => Revision
  }): TRead
  surface: TSurface
  plan(input: {
    input: TInput
    state: TState
    read: TRead
    revision: Revision
  }): ProjectionPlan<TPhaseName, TScopeMap>
  capture?(input: {
    state: TState
    read: TRead
    revision: Revision
  }): TCapture
  phases: ProjectionPhaseEntry<
    TInput,
    TState,
    TPhaseName,
    TScopeMap,
    TPhaseMetrics
  >
}

export interface ProjectionRuntime<
  TInput,
  TState,
  TRead,
  TSurfaceRead,
  TPhaseName extends string,
  TPhaseMetrics = unknown,
  TCapture = undefined
> {
  revision(): Revision
  state(): TState
  read: TRead
  stores: TSurfaceRead
  capture(): TCapture
  update(input: TInput): {
    revision: Revision
    trace: ProjectionTrace<TPhaseName, TPhaseMetrics>
  }
  subscribe(
    listener: (result: {
      revision: Revision
      trace: ProjectionTrace<TPhaseName, TPhaseMetrics>
    }) => void
  ): () => void
}

const hasOwn = <TObject extends object>(
  value: TObject,
  key: PropertyKey
): key is keyof TObject => Object.prototype.hasOwnProperty.call(value, key)

const isField = <TState,>(
  value: ProjectionSurfaceField<TState> | ProjectionSurfaceTree<TState>
): value is ProjectionSurfaceField<TState> => (
  typeof value === 'object'
  && value !== null
  && 'kind' in value
  && (
    value.kind === 'value'
    || value.kind === 'family'
  )
)

const applyScopeInput = <
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName>
>(input: {
  phases: ReadonlyMap<
    TPhaseName,
    {
      scope?: TScopeMap[TPhaseName]
    }
  >
  pending: Set<TPhaseName>
  pendingScope: Partial<Record<TPhaseName, unknown>>
  completed: ReadonlySet<TPhaseName>
  scope?: PhaseScopeInput<TPhaseName, TScopeMap>
}) => {
  if (!input.scope) {
    return
  }

  for (const phaseName in input.scope) {
    if (!hasOwn(input.scope, phaseName)) {
      continue
    }

    const nextScope = input.scope[phaseName]
    if (nextScope === undefined) {
      continue
    }

    if (input.completed.has(phaseName)) {
      throw new Error(`Cannot apply scope to completed phase ${phaseName}.`)
    }

    const spec = input.phases.get(phaseName)
    if (!spec) {
      throw new Error(`Unknown scoped phase ${phaseName}.`)
    }

    if (!spec.scope) {
      throw new Error(`Cannot apply scope to unscoped phase ${phaseName}.`)
    }

    const currentScope = input.pendingScope[phaseName] as
      | ScopeValue<TScopeMap[typeof phaseName]>
      | undefined
    const mergedScope = mergeScopeValue(
      spec.scope as ScopeSchema,
      currentScope as ScopeValue<TScopeMap[TPhaseName]> | undefined,
      nextScope as NonNullable<ScopeInputValue<TScopeMap[TPhaseName]>>
    )

    if (isScopeValueEmpty(
      spec.scope as ScopeSchema,
      mergedScope as ScopeValue<ScopeSchema>
    )) {
      delete input.pendingScope[phaseName]
      continue
    }

    input.pending.add(phaseName)
    input.pendingScope[phaseName] = mergedScope
  }
}

const didPhaseChange = (
  action: 'reuse' | 'sync' | 'rebuild'
): boolean => action !== 'reuse'

const value = <TState, TValue>(
  input: {
    read(state: TState): TValue
    isEqual?: (left: TValue, right: TValue) => boolean
  }
): ProjectionValueField<TState, TValue> => ({
  kind: 'value',
  read: input.read,
  ...(input.isEqual
    ? {
        isEqual: input.isEqual
      }
    : {})
})

const family = <
  TState,
  TKey extends string,
  TValue
>(
  input: {
    read(state: TState): {
      ids: readonly TKey[]
      byId: ReadonlyMap<TKey, TValue>
    }
    isEqual?: (left: TValue, right: TValue) => boolean
  }
): ProjectionFamilyField<TState, TKey, TValue> => ({
  kind: 'family',
  read: input.read,
  ...(input.isEqual
    ? {
        isEqual: input.isEqual
      }
    : {})
})

type SurfaceSync = (state: unknown) => void

const createSurfaceStore = <
  TState,
  TSurface extends ProjectionSurfaceTree<TState>
>(
  surface: TSurface,
  state: TState
): {
  read: ProjectionStoreRead<TSurface>
  sync: () => void
} => {
  const syncers: SurfaceSync[] = []

  const build = (
    currentSurface: ProjectionSurfaceTree<TState>,
    currentState: TState
  ): unknown => {
    const next: Record<string, unknown> = {}

    Object.entries(currentSurface).forEach(([key, field]) => {
      if (isField(field)) {
        if (field.kind === 'value') {
          const source = store.createValueStore(
            field.read(currentState)
          )
          syncers.push((nextState) => {
            source.set(
              field.read(nextState as TState)
            )
          })
          next[key] = source
          return
        }

        const source = store.createFamilyStore({
          initial: field.read(currentState),
          isEqual: field.isEqual as ((left: unknown, right: unknown) => boolean) | undefined
        })
        syncers.push((nextState) => {
          source.write.replace(
            field.read(nextState as TState)
          )
        })
        next[key] = {
          ids: source.ids,
          byId: store.createKeyedReadStore({
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
        field as ProjectionSurfaceTree<TState>,
        currentState
      )
    })

    return next
  }

  const read = build(surface, state) as ProjectionStoreRead<TSurface>

  return {
    read,
    sync: () => {
      syncers.forEach((sync) => {
        sync(state)
      })
    }
  }
}

export const createProjectionRuntime = <
  TInput,
  TState,
  TRead,
  TSurface extends ProjectionSurfaceTree<TState>,
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName>,
  TPhaseMetrics = unknown,
  TCapture = undefined
>(
  model: ProjectionSpec<
    TInput,
    TState,
    TRead,
    TSurface,
    TPhaseName,
    TScopeMap,
    TPhaseMetrics,
    TCapture
  >
): ProjectionRuntime<
  TInput,
  TState,
  TRead,
  ProjectionStoreRead<TSurface>,
  TPhaseName,
  TPhaseMetrics,
  TCapture
> => {
  const graph = createPhaseGraph<
    TPhaseName,
    ProjectionPhaseEntry<
      TInput,
      TState,
      TPhaseName,
      TScopeMap,
      TPhaseMetrics
    >[TPhaseName]
  >(model.phases)
  const state = model.createState()
  let currentRevision = 0 as Revision
  const listeners = new Set<(result: {
    revision: Revision
    trace: ProjectionTrace<TPhaseName, TPhaseMetrics>
  }) => void>()
  const surface = createSurfaceStore(
    model.surface,
    state
  )
  const read = model.createRead({
    state: () => state,
    revision: () => currentRevision
  })
  let captureRevision = -1 as Revision
  let cachedCapture: TCapture | undefined
  const capture = () => {
    if (!model.capture) {
      return undefined as TCapture
    }

    if (captureRevision === currentRevision && cachedCapture !== undefined) {
      return cachedCapture
    }

    captureRevision = currentRevision
    cachedCapture = model.capture({
      state,
      read,
      revision: currentRevision
    })
    return cachedCapture
  }

  return {
    revision: () => currentRevision,
    state: () => state,
    read,
    stores: surface.read,
    capture,
    update: (input) => {
      const revision = (currentRevision + 1) as Revision
      const plan = model.plan({
        input,
        state,
        read,
        revision
      })
      const pending = new Set<TPhaseName>()
      const pendingScope: Partial<Record<TPhaseName, unknown>> = {}
      const completed = new Set<TPhaseName>()
      const phases: Array<ProjectionTrace<TPhaseName, TPhaseMetrics>['phases'][number]> = []

      if (plan.phases) {
        for (const phaseName of plan.phases) {
          if (!graph.specs.has(phaseName)) {
            throw new Error(`Unknown planned phase ${phaseName}.`)
          }

          pending.add(phaseName)
        }
      }

      applyScopeInput({
        phases: graph.specs,
        pending,
        pendingScope,
        completed,
        scope: plan.scope
      })

      const startAt = scheduler.readMonotonicNow()

      graph.order.forEach((phaseName) => {
        if (!pending.has(phaseName)) {
          return
        }

        const spec = graph.specs.get(phaseName)!
        const phaseStartAt = scheduler.readMonotonicNow()
        const phaseScope = spec.scope
          ? normalizeScopeValue(
              spec.scope as ScopeSchema,
              pendingScope[phaseName] as ScopeInputValue<TScopeMap[typeof phaseName]> | undefined
            )
          : undefined
        delete pendingScope[phaseName]

        const result = spec.run({
          input,
          state,
          revision,
          scope: phaseScope as ScopeValue<TScopeMap[TPhaseName]>
        })
        const changed = didPhaseChange(result.action)

        completed.add(phaseName)
        phases.push({
          name: phaseName,
          action: result.action,
          changed,
          durationMs: scheduler.readMonotonicNow() - phaseStartAt,
          metrics: result.metrics
        })

        applyScopeInput({
          phases: graph.specs,
          pending,
          pendingScope,
          completed,
          scope: result.emit
        })

        if (!changed) {
          return
        }

        fanoutDependents(
          pending,
          graph.dependents,
          phaseName
        )
      })

      currentRevision = revision
      surface.sync()

      const result = {
        revision,
        trace: {
          revision,
          phases,
          totalMs: scheduler.readMonotonicNow() - startAt
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
