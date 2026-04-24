import {
  createInverseBuilder,
  type InverseBuilder
} from './operationBuffer'

export interface MutationContext<TBase, TCurrent, TInverse, TWorking = undefined> {
  readonly base: TBase
  readonly working: TWorking
  readonly inverse: InverseBuilder<TInverse>
  current(): TCurrent
  replace(next: TCurrent): TCurrent
  update(project: (current: TCurrent) => TCurrent): TCurrent
  finish(): {
    current: TCurrent
    inverse: readonly TInverse[]
    working: TWorking
  }
}

export const createMutationContext = <
  TBase,
  TCurrent = TBase,
  TInverse = never,
  TWorking = undefined
>(input: {
  base: TBase
  current?: TCurrent
  working: TWorking
}): MutationContext<TBase, TCurrent, TInverse, TWorking> => {
  let current = (input.current ?? input.base) as TCurrent
  const inverse = createInverseBuilder<TInverse>()

  return {
    base: input.base,
    working: input.working,
    inverse,
    current: () => current,
    replace: (next) => {
      current = next
      return current
    },
    update: (project) => {
      current = project(current)
      return current
    },
    finish: () => ({
      current,
      inverse: inverse.finish(),
      working: input.working
    })
  }
}
