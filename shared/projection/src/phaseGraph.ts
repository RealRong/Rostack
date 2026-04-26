export interface PhaseGraph<
  TPhaseName extends string,
  TSpec extends {
    after?: readonly TPhaseName[]
  }
> {
  order: readonly TPhaseName[]
  specs: ReadonlyMap<TPhaseName, TSpec>
  dependents: ReadonlyMap<TPhaseName, readonly TPhaseName[]>
}

export const createPhaseGraph = <
  TPhaseName extends string,
  TSpec extends {
    after?: readonly TPhaseName[]
  }
>(
  phases: Readonly<Record<TPhaseName, TSpec>>
): PhaseGraph<TPhaseName, TSpec> => {
  const phaseNames = Object.keys(phases) as TPhaseName[]
  const specs = new Map<TPhaseName, TSpec>()
  const dependents = new Map<TPhaseName, TPhaseName[]>()
  const indegree = new Map<TPhaseName, number>()

  phaseNames.forEach((phaseName) => {
    const entry = phases[phaseName]!
    specs.set(phaseName, entry)
    dependents.set(phaseName, [])
    indegree.set(phaseName, entry.after?.length ?? 0)
  })

  phaseNames.forEach((phaseName) => {
    const entry = phases[phaseName]!
    entry.after?.forEach((dep) => {
      const next = dependents.get(dep)
      if (!next) {
        throw new Error(`Unknown phase dependency ${dep} for phase ${phaseName}.`)
      }

      next.push(phaseName)
    })
  })

  const queue = phaseNames
    .filter((phaseName) => indegree.get(phaseName) === 0)
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

  if (order.length !== phaseNames.length) {
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
