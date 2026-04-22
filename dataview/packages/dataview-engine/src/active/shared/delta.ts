import type { CollectionDelta } from '@dataview/engine/contracts/delta'

export const createCollectionDelta = <Key,>(input: {
  list?: boolean
  update?: readonly Key[]
  remove?: readonly Key[]
}): CollectionDelta<Key> | undefined => (
  input.list || input.update?.length || input.remove?.length
    ? {
        ...(input.list
          ? {
              list: true as const
            }
          : {}),
        ...(input.update?.length
          ? {
              update: input.update
            }
          : {}),
        ...(input.remove?.length
          ? {
              remove: input.remove
            }
          : {})
      }
    : undefined
)

export const buildKeyedCollectionDelta = <Key, Value>(input: {
  previousIds: readonly Key[]
  nextIds: readonly Key[]
  previousGet: (key: Key) => Value | undefined
  nextGet: (key: Key) => Value | undefined
}): CollectionDelta<Key> | undefined => {
  const nextIdSet = new Set(input.nextIds)
  const update: Key[] = []
  const remove: Key[] = []

  for (let index = 0; index < input.nextIds.length; index += 1) {
    const key = input.nextIds[index]!
    const nextValue = input.nextGet(key)
    if (nextValue === undefined || input.previousGet(key) === nextValue) {
      continue
    }

    update.push(key)
  }

  for (let index = 0; index < input.previousIds.length; index += 1) {
    const key = input.previousIds[index]!
    if (!nextIdSet.has(key)) {
      remove.push(key)
    }
  }

  return createCollectionDelta({
    list: input.previousIds !== input.nextIds,
    update,
    remove
  })
}
