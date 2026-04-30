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
  TRead,
  TPhaseName extends string = string
> {
  input: TInput
  state: TState
  read: TRead
  revision: Revision
  dirty: ProjectionDirty
  phase: Record<TPhaseName, ProjectionPhaseStatus>
}

export interface ProjectionFamilySnapshot<TKey extends string | number, TValue> {
  ids: readonly TKey[]
  byId: ReadonlyMap<TKey, TValue>
}

export type ProjectionValueChange<TValue> =
  | 'skip'
  | {
      value: TValue
    }

export type ProjectionFamilyChange<TKey extends string | number, TValue> =
  | 'skip'
  | 'replace'
  | {
      ids?: readonly TKey[]
      set?: readonly (readonly [TKey, TValue])[]
      remove?: readonly TKey[]
    }

export interface ProjectionValueStoreSpec<
  TState,
  TValue
> {
  kind: 'value'
  read(state: TState): TValue
  change(state: TState): ProjectionValueChange<TValue>
  isEqual?: (left: TValue, right: TValue) => boolean
}

export interface ProjectionFamilyStoreSpec<
  TState,
  TKey extends string | number,
  TValue
> {
  kind: 'family'
  read(state: TState): ProjectionFamilySnapshot<TKey, TValue>
  change(state: TState): ProjectionFamilyChange<TKey, TValue>
  isEqual?: (left: TValue, right: TValue) => boolean
  idsEqual?: (left: readonly TKey[], right: readonly TKey[]) => boolean
}

export type ProjectionStoreSpec<TState> =
  | ProjectionValueStoreSpec<TState, any>
  | ProjectionFamilyStoreSpec<TState, any, any>

export type ProjectionStoreTree<TState> = {
  [key: string]: ProjectionStoreSpec<TState> | ProjectionStoreTree<TState>
}

export type ProjectionStoreRead<TField> =
  TField extends ProjectionValueStoreSpec<any, infer TValue>
    ? ReadStore<TValue>
    : TField extends ProjectionFamilyStoreSpec<any, infer TKey, infer TValue>
      ? {
          ids: ReadStore<readonly TKey[]>
          byId: KeyedReadStore<TKey, TValue | undefined>
        }
      : TField extends ProjectionStoreTree<any>
        ? {
            [TKey in keyof TField]: ProjectionStoreRead<TField[TKey]>
          }
        : never

export type ProjectionPhase<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TRead,
  TPhaseName extends string
> = (
  context: ProjectionContext<TInput, TState, TRead, TPhaseName>
) => void

export type ProjectionPhaseSpec<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TRead,
  TPhaseName extends string
> =
  | ProjectionPhase<TInput, TState, TRead, TPhaseName>
  | {
      after?: readonly TPhaseName[]
      run: ProjectionPhase<TInput, TState, TRead, TPhaseName>
    }

export type ProjectionPhaseTable<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TRead,
  TPhaseName extends string
> = Record<TPhaseName, ProjectionPhaseSpec<TInput, TState, TRead, TPhaseName>>

export interface ProjectionPlan<TPhaseName extends string> {
  phases?: readonly TPhaseName[]
}

export interface ProjectionCreateOptions<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TRead,
  TCapture,
  TStores extends ProjectionStoreTree<TState>,
  TPhaseName extends string
> {
  createState(): TState
  createRead(runtime: {
    state: () => TState
    revision: () => Revision
    capture: () => TCapture
  }): TRead
  capture(input: {
    state: TState
    read: TRead
    revision: Revision
  }): TCapture
  stores: TStores
  plan?: (input: {
    input: TInput
    state: TState
    read: TRead
    revision: Revision
  }) => ProjectionPlan<TPhaseName>
  phases: ProjectionPhaseTable<TInput, TState, TRead, TPhaseName>
}

export interface ProjectionRuntime<
  TInput extends {
    delta: MutationDelta
  },
  TState,
  TRead,
  TCapture,
  TStoresRead,
  TPhaseName extends string
> {
  revision(): Revision
  state(): TState
  capture(): TCapture
  read: TRead
  stores: TStoresRead
  update(input: TInput): {
    revision: Revision
    capture: TCapture
    trace: ProjectionTrace<TPhaseName>
  }
  subscribe(
    listener: (result: {
      revision: Revision
      capture: TCapture
      trace: ProjectionTrace<TPhaseName>
    }) => void
  ): () => void
}

type SurfaceSync = () => void

const isField = <TState,>(
  value: ProjectionStoreSpec<TState> | ProjectionStoreTree<TState>
): value is ProjectionStoreSpec<TState> => (
  typeof value === 'object'
  && value !== null
  && 'kind' in value
  && (
    value.kind === 'value'
    || value.kind === 'family'
  )
)

const createStoreRuntime = <
  TState,
  TStores extends ProjectionStoreTree<TState>
>(
  stores: TStores,
  state: TState
): {
  read: ProjectionStoreRead<TStores>
  sync: () => void
} => {
  const syncers: SurfaceSync[] = []

  const build = (
    currentStores: ProjectionStoreTree<TState>,
    currentState: TState
  ): unknown => {
    const next: Record<string, unknown> = {}

    Object.entries(currentStores).forEach(([key, spec]) => {
      if (isField(spec)) {
        if (spec.kind === 'value') {
          const source = createValueStore(spec.read(currentState), {
            ...(spec.isEqual
              ? {
                  isEqual: spec.isEqual
                }
              : {})
          })

          syncers.push(() => {
            const change = spec.change(state)
            if (change === 'skip') {
              return
            }

            source.set(change.value)
          })

          next[key] = source
          return
        }

        const source = createFamilyStore({
          initial: spec.read(currentState),
          ...(spec.isEqual
            ? {
                isEqual: spec.isEqual as (left: unknown, right: unknown) => boolean
              }
            : {})
        })

        syncers.push(() => {
          const change = spec.change(state)
          if (change === 'skip') {
            return
          }

          if (change === 'replace') {
            source.write.replace(spec.read(state))
            return
          }

          source.write.apply(change)
        })

        next[key] = {
          ids: source.ids,
          byId: createKeyedReadStore({
            get: source.byId.read.get,
            subscribe: source.byId.subscribe.key,
            ...(spec.isEqual
              ? {
                  isEqual: spec.isEqual as (left: unknown, right: unknown) => boolean
                }
              : {})
          })
        }
        return
      }

      next[key] = build(
        spec as ProjectionStoreTree<TState>,
        currentState
      )
    })

    return next
  }

  return {
    read: build(stores, state) as ProjectionStoreRead<TStores>,
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
  TRead,
  TPhaseName extends string
>(
  spec: ProjectionPhaseSpec<TInput, TState, TRead, TPhaseName>
): {
  after?: readonly TPhaseName[]
  run: ProjectionPhase<TInput, TState, TRead, TPhaseName>
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
  TCapture,
  TPhaseName extends string,
  TStores extends ProjectionStoreTree<TState>
>(
  model: ProjectionCreateOptions<
    TInput,
    TState,
    TRead,
    TCapture,
    TStores,
    TPhaseName
  >
): ProjectionRuntime<
  TInput,
  TState,
  TRead,
  TCapture,
  ProjectionStoreRead<TStores>,
  TPhaseName
> => {
  const compiledPhases = Object.fromEntries(
    Object.entries(model.phases).map(([phaseName, spec]) => [
      phaseName,
      toPhaseSpec(spec as ProjectionPhaseSpec<TInput, TState, TRead, TPhaseName>)
    ])
  ) as Record<
    TPhaseName,
    {
      after?: readonly TPhaseName[]
      run: ProjectionPhase<TInput, TState, TRead, TPhaseName>
    }
  >
  const graph = createPhaseGraph(compiledPhases)
  const state = model.createState()
  let currentRevision = 0 as Revision
  let currentCapture!: TCapture
  const listeners = new Set<(result: {
    revision: Revision
    capture: TCapture
    trace: ProjectionTrace<TPhaseName>
  }) => void>()

  const read = model.createRead({
    state: () => state,
    revision: () => currentRevision,
    capture: () => currentCapture
  })
  const stores = createStoreRuntime(
    model.stores,
    state
  )

  currentCapture = model.capture({
    state,
    read,
    revision: currentRevision
  })

  return {
    revision: () => currentRevision,
    state: () => state,
    capture: () => currentCapture,
    read,
    stores: stores.read,
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
      const context: ProjectionContext<TInput, TState, TRead, TPhaseName> = {
        input,
        state,
        read,
        revision,
        dirty: {
          reset: input.delta.reset === true,
          delta: input.delta
        },
        phase: phaseState
      }
      const plan = model.plan?.({
        input,
        state,
        read,
        revision
      })
      const enabled = new Set<TPhaseName>(plan?.phases ?? graph.order)
      const tracePhases: ProjectionTracePhase<TPhaseName>[] = []
      const totalStartAt = scheduler.readMonotonicNow()

      graph.order.forEach((phaseName) => {
        const status = context.phase[phaseName]
        if (!enabled.has(phaseName)) {
          tracePhases.push({
            name: phaseName,
            action: 'reuse',
            changed: false,
            durationMs: 0
          })
          return
        }

        const spec = graph.specs.get(phaseName)!
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

      currentRevision = revision
      stores.sync()
      currentCapture = model.capture({
        state,
        read,
        revision
      })

      const result = {
        revision,
        capture: currentCapture,
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
