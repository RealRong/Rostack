import {
  entityDelta,
  type EntityDelta
} from './entityDelta'
import {
  projectListChange
} from './listChange'

export interface PublishedEntityList<TKey> {
  value: readonly TKey[]
  delta?: EntityDelta<TKey>
}

export const publishEntityList = <TKey>(input: {
  previous: readonly TKey[]
  next: readonly TKey[]
  set?: readonly TKey[]
  remove?: readonly TKey[]
}): PublishedEntityList<TKey> => {
  const listChange = projectListChange({
    previous: input.previous,
    next: input.next
  })
  const delta = entityDelta.normalize({
    ...(listChange.orderChanged
      ? {
          order: true as const
        }
      : {}),
    set: [
      ...listChange.added,
      ...(input.set ?? [])
    ],
    remove: [
      ...listChange.removed,
      ...(input.remove ?? [])
    ]
  })

  return {
    value: listChange.orderChanged
      ? input.next
      : input.previous,
    delta
  }
}
