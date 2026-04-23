import type * as runtime from '../contracts/runtime'
import type {
  DefaultPhaseScopeMap,
  PhaseScopeInput,
  PhaseScopeMap
} from '../contracts/scope'
import type * as trace from '../contracts/trace'
import { fanoutDependents, type PhaseGraph } from '../dirty/fanout'
import type { RuntimeState } from './state'

const readNow = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
)

const didPhaseChange = (
  action: trace.Phase['action']
): boolean => action !== 'reuse'

const hasOwn = <TObject extends object>(
  value: TObject,
  key: PropertyKey
): key is keyof TObject => Object.prototype.hasOwnProperty.call(value, key)

const applyScopeInput = <
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName>
>(input: {
  phases: ReadonlyMap<
    TPhaseName,
    {
      mergeScope?: (
        current: TScopeMap[TPhaseName] | undefined,
        next: TScopeMap[TPhaseName]
      ) => TScopeMap[TPhaseName]
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

    const currentScope = input.pendingScope[phaseName] as
      | TScopeMap[typeof phaseName]
      | undefined
    const mergedScope = spec.mergeScope
      ? spec.mergeScope(
          currentScope as TScopeMap[TPhaseName] | undefined,
          nextScope as TScopeMap[TPhaseName]
        )
      : nextScope

    input.pending.add(phaseName)
    input.pendingScope[phaseName] = mergedScope
  }
}

export const runRuntimeUpdate = <
  TInput,
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>,
  TPhaseChange = unknown,
  TPhaseMetrics = unknown
>(
  input: {
    spec: runtime.Spec<
      TInput,
      TWorking,
      TSnapshot,
      TChange,
      TPhaseName,
      TScopeMap,
      TPhaseChange,
      TPhaseMetrics
    >
    graph: PhaseGraph<
      TPhaseName,
      runtime.PhaseEntry<
        TInput,
        TWorking,
        TSnapshot,
        TPhaseName,
        TScopeMap,
        TPhaseChange,
        TPhaseMetrics
      >
    >
    state: RuntimeState<
      TWorking,
      TSnapshot,
      TChange,
      TPhaseName,
      TPhaseMetrics
    >
    nextInput: TInput
  }
): runtime.Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics> => {
  const previous = input.state.snapshot
  const revision = input.state.revision + 1
  const plan = input.spec.planner.plan({
    input: input.nextInput,
    previous
  })
  const pending = new Set<TPhaseName>()
  const pendingScope: Partial<Record<TPhaseName, unknown>> = {}
  const completed = new Set<TPhaseName>()
  const phases: trace.Phase<TPhaseName, TPhaseMetrics>[] = []

  plan.phases.forEach((phaseName) => {
    if (!input.graph.specs.has(phaseName)) {
      throw new Error(`Unknown planned phase ${phaseName}.`)
    }

    pending.add(phaseName)
  })

  applyScopeInput({
    phases: input.graph.specs,
    pending,
    pendingScope,
    completed,
    scope: plan.scope
  })

  const startAt = readNow()

  input.graph.order.forEach((phaseName) => {
    if (!pending.has(phaseName)) {
      return
    }

    const spec = input.graph.specs.get(phaseName)!
    const phaseStartAt = readNow()
    const phaseScope = pendingScope[phaseName] as
      | TScopeMap[typeof phaseName]
      | undefined
    delete pendingScope[phaseName]
    const result = spec.run({
      input: input.nextInput,
      previous,
      working: input.state.working,
      scope: phaseScope as TScopeMap[TPhaseName]
    })
    const changed = didPhaseChange(result.action)

    completed.add(phaseName)

    phases.push({
      name: phaseName,
      action: result.action,
      changed,
      durationMs: readNow() - phaseStartAt,
      metrics: result.metrics
    })

    applyScopeInput({
      phases: input.graph.specs,
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
      input.graph.dependents,
      phaseName
    )
  })

  const published = input.spec.publisher.publish({
    revision,
    previous,
    working: input.state.working
  })

  return {
    snapshot: published.snapshot,
    change: published.change,
    trace: {
      revision,
      phases,
      totalMs: readNow() - startAt
    }
  }
}
