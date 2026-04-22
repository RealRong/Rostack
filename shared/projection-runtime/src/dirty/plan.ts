import type * as runtime from '../contracts/runtime'
import { createReadonlySet, isReadonlySetEmpty, mergeReadonlySets } from './set'

export const createPlan = <
  TPhaseName extends string,
  TDirty = never
>(
  input?: {
    phases?: Iterable<TPhaseName>
    dirty?: ReadonlyMap<TPhaseName, ReadonlySet<TDirty>>
  }
): runtime.Plan<TPhaseName, TDirty> => {
  const phases = new Set(input?.phases ?? [])
  const dirty = new Map<TPhaseName, ReadonlySet<TDirty>>()

  input?.dirty?.forEach((tokens, phaseName) => {
    const nextTokens = createReadonlySet(tokens)
    if (isReadonlySetEmpty(nextTokens)) {
      return
    }

    phases.add(phaseName)
    dirty.set(phaseName, nextTokens)
  })

  return dirty.size > 0
    ? {
        phases,
        dirty
      }
    : {
        phases
      }
}

export const mergePlans = <
  TPhaseName extends string,
  TDirty = never
>(
  ...plans: readonly runtime.Plan<TPhaseName, TDirty>[]
): runtime.Plan<TPhaseName, TDirty> => {
  const phases = new Set<TPhaseName>()
  const dirty = new Map<TPhaseName, ReadonlySet<TDirty>>()

  plans.forEach((plan) => {
    plan.phases.forEach((phaseName) => {
      phases.add(phaseName)
    })

    plan.dirty?.forEach((tokens, phaseName) => {
      const merged = mergeReadonlySets(
        dirty.get(phaseName),
        tokens
      )

      if (isReadonlySetEmpty(merged)) {
        return
      }

      phases.add(phaseName)
      dirty.set(phaseName, merged)
    })
  })

  return dirty.size > 0
    ? {
        phases,
        dirty
      }
    : {
        phases
      }
}
