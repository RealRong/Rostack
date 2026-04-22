import type * as runtime from '../contracts/runtime'
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

export const runRuntimeUpdate = <
  TInput,
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string,
  TDirty = never,
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
      TDirty,
      TPhaseChange,
      TPhaseMetrics
    >
    graph: PhaseGraph<
      TPhaseName,
      runtime.Context<TInput, TWorking, TSnapshot, TDirty>,
      TPhaseChange,
      TPhaseMetrics
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
  const phases: trace.Phase<TPhaseName, TPhaseMetrics>[] = []

  plan.phases.forEach((phaseName) => {
    if (!input.graph.specs.has(phaseName)) {
      throw new Error(`Unknown planned phase ${phaseName}.`)
    }

    pending.add(phaseName)
  })

  const startAt = readNow()

  input.graph.order.forEach((phaseName) => {
    if (!pending.has(phaseName)) {
      return
    }

    const spec = input.graph.specs.get(phaseName)!
    const phaseStartAt = readNow()
    const result = spec.run({
      input: input.nextInput,
      previous,
      working: input.state.working,
      dirty: plan.dirty?.get(phaseName)
    })
    const changed = didPhaseChange(result.action)

    phases.push({
      name: phaseName,
      action: result.action,
      changed,
      durationMs: readNow() - phaseStartAt,
      metrics: result.metrics
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
