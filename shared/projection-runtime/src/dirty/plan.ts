import type * as runtime from '../contracts/runtime'
import type {
  DefaultPhaseScopeMap,
  PhaseScopeInput,
  PhaseScopeMap
} from '../contracts/scope'

const hasOwn = <TObject extends object>(
  value: TObject,
  key: PropertyKey
): key is keyof TObject => Object.prototype.hasOwnProperty.call(value, key)

export const createPlan = <
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>
>(
  input?: {
    phases?: Iterable<TPhaseName>
    scope?: PhaseScopeInput<TPhaseName, TScopeMap>
  }
): runtime.Plan<TPhaseName, TScopeMap> => {
  const phases = new Set(input?.phases ?? [])
  const scope: Partial<Record<TPhaseName, unknown>> = {}

  if (input?.scope) {
    for (const phaseName in input.scope) {
      if (!hasOwn(input.scope, phaseName)) {
        continue
      }

      const nextScope = input.scope[phaseName]
      if (nextScope === undefined) {
        continue
      }

      phases.add(phaseName)
      scope[phaseName] = nextScope
    }
  }

  return Object.keys(scope).length > 0
    ? {
        phases,
        scope: scope as PhaseScopeInput<TPhaseName, TScopeMap>
      }
    : {
        phases
      }
}

export const mergePlans = <
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>
>(
  ...plans: readonly runtime.Plan<TPhaseName, TScopeMap>[]
): runtime.Plan<TPhaseName, TScopeMap> => {
  const phases = new Set<TPhaseName>()
  const scope: Partial<Record<TPhaseName, unknown>> = {}

  plans.forEach((plan) => {
    plan.phases.forEach((phaseName) => {
      phases.add(phaseName)
    })

    if (plan.scope) {
      for (const phaseName in plan.scope) {
        if (!hasOwn(plan.scope, phaseName)) {
          continue
        }

        const nextScope = plan.scope[phaseName]
        if (nextScope === undefined) {
          continue
        }

        phases.add(phaseName)
        scope[phaseName] = nextScope
      }
    }
  })

  return Object.keys(scope).length > 0
    ? {
        phases,
        scope: scope as PhaseScopeInput<TPhaseName, TScopeMap>
      }
    : {
        phases
      }
}
