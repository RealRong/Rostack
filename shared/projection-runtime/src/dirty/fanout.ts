import type * as phase from '../contracts/phase'

export interface PhaseGraph<
  TPhaseName extends string,
  TContext,
  TPhaseChange = unknown,
  TPhaseMetrics = unknown
> {
  order: readonly TPhaseName[]
  specs: ReadonlyMap<
    TPhaseName,
    phase.Spec<TPhaseName, TContext, TPhaseChange, TPhaseMetrics>
  >
  dependents: ReadonlyMap<TPhaseName, readonly TPhaseName[]>
}

export const createPhaseGraph = <
  TPhaseName extends string,
  TContext,
  TPhaseChange = unknown,
  TPhaseMetrics = unknown
>(
  phases: readonly phase.Spec<
    TPhaseName,
    TContext,
    TPhaseChange,
    TPhaseMetrics
  >[]
): PhaseGraph<TPhaseName, TContext, TPhaseChange, TPhaseMetrics> => {
  const specs = new Map<
    TPhaseName,
    phase.Spec<TPhaseName, TContext, TPhaseChange, TPhaseMetrics>
  >()
  const dependents = new Map<TPhaseName, TPhaseName[]>()
  const indegree = new Map<TPhaseName, number>()

  phases.forEach((entry) => {
    if (specs.has(entry.name)) {
      throw new Error(`Duplicate phase ${entry.name}.`)
    }

    specs.set(entry.name, entry)
    dependents.set(entry.name, [])
    indegree.set(entry.name, entry.deps.length)
  })

  phases.forEach((entry) => {
    entry.deps.forEach((dep) => {
      const next = dependents.get(dep)
      if (!next) {
        throw new Error(`Unknown phase dependency ${dep} for phase ${entry.name}.`)
      }

      next.push(entry.name)
    })
  })

  const queue = phases
    .filter((entry) => indegree.get(entry.name) === 0)
    .map((entry) => entry.name)
  const order: TPhaseName[] = []

  while (queue.length > 0) {
    const phaseName = queue.shift()!
    order.push(phaseName)

    dependents.get(phaseName)?.forEach((dependent) => {
      const nextDegree = (indegree.get(dependent) ?? 0) - 1
      indegree.set(dependent, nextDegree)
      if (nextDegree === 0) {
        queue.push(dependent)
      }
    })
  }

  if (order.length !== phases.length) {
    throw new Error('Projection runtime phases must form a DAG.')
  }

  return {
    order,
    specs,
    dependents: new Map(
      [...dependents.entries()].map(([phaseName, entries]) => [
        phaseName,
        entries as readonly TPhaseName[]
      ])
    )
  }
}

export const fanoutDependents = <TPhaseName extends string>(
  pending: Set<TPhaseName>,
  dependents: ReadonlyMap<TPhaseName, readonly TPhaseName[]>,
  phaseName: TPhaseName
) => {
  dependents.get(phaseName)?.forEach((dependent) => {
    pending.add(dependent)
  })
}
