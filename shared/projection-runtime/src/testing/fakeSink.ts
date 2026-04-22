export const createValueSink = <TValue>(
  initial: TValue
) => {
  let value = initial

  return {
    get: () => value,
    set: (next: TValue) => {
      value = next
    }
  }
}

export const createListSink = <TValue>(
  initial: readonly TValue[] = []
) => {
  let items = [...initial]

  return {
    get: () => items as readonly TValue[],
    set: (next: readonly TValue[]) => {
      items = [...next]
    }
  }
}

export const createFamilySink = <TKey, TValue>() => {
  const byId = new Map<TKey, TValue>()
  let ids: TKey[] = []

  return {
    get: () => ({
      ids,
      byId
    }),
    set: (key: TKey, value: TValue) => {
      byId.set(key, value)
    },
    remove: (key: TKey) => {
      byId.delete(key)
    },
    order: (nextIds: readonly TKey[]) => {
      ids = [...nextIds]
    }
  }
}

export const createEventSink = <TEvent>() => {
  const events: TEvent[] = []

  return {
    get: () => events as readonly TEvent[],
    emit: (event: TEvent) => {
      events.push(event)
    }
  }
}
