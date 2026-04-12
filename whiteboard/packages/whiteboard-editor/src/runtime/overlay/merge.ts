export const mergeEntryById = <Id, Value,>(
  map: Map<Id, Value>,
  id: Id,
  merge: (current: Value | undefined) => Value | undefined
) => {
  const next = merge(map.get(id))

  if (next === undefined) {
    map.delete(id)
    return
  }

  map.set(id, next)
}
