import { idDelta, type IdDelta } from './idDelta'

export interface WriteEntityChangeInput<
  TKey extends string,
  TValue
> {
  delta: IdDelta<TKey>
  id: TKey
  previous: TValue | undefined
  next: TValue | undefined
  equal?: (left: TValue, right: TValue) => boolean
}

export const writeEntityChange = <
  TKey extends string,
  TValue
>(
  input: WriteEntityChangeInput<TKey, TValue>
): void => {
  const equal = input.equal ?? Object.is

  if (input.previous === undefined) {
    if (input.next !== undefined) {
      idDelta.add(input.delta, input.id)
    }
    return
  }

  if (input.next === undefined) {
    idDelta.remove(input.delta, input.id)
    return
  }

  if (!equal(input.previous, input.next)) {
    idDelta.update(input.delta, input.id)
  }
}
