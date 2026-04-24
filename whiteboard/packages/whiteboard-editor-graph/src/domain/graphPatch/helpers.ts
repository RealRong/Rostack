import { idDelta, isListEqual } from '@shared/projector'
import type { IdDelta } from '../../contracts/delta'

export type PatchAction = 'unchanged' | 'added' | 'updated' | 'removed'

export const patchFamilyEntry = <TId extends string, TValue>(input: {
  family: Map<TId, TValue>
  id: TId
  next: TValue | undefined
  isEqual: (left: TValue, right: TValue) => boolean
  delta: IdDelta<TId>
}): PatchAction => {
  const previous = input.family.get(input.id)

  if (input.next === undefined) {
    if (previous === undefined) {
      return 'unchanged'
    }

    input.family.delete(input.id)
    idDelta.remove(input.delta, input.id)
    return 'removed'
  }

  if (previous === undefined) {
    input.family.set(input.id, input.next)
    idDelta.add(input.delta, input.id)
    return 'added'
  }

  if (input.isEqual(previous, input.next)) {
    return 'unchanged'
  }

  input.family.set(input.id, input.next)
  idDelta.update(input.delta, input.id)
  return 'updated'
}

export const patchOrderedIds = <TValue>(input: {
  previous: readonly TValue[] | undefined
  next: readonly TValue[]
  isEqual?: (left: TValue, right: TValue) => boolean
}): readonly TValue[] => {
  const isEqual = input.isEqual ?? ((left, right) => left === right)
  return input.previous && isListEqual(input.previous, input.next, isEqual)
    ? input.previous
    : input.next
}
