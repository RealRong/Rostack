import { idDelta, type IdDelta } from '@shared/delta'

export const patchGraphEntity = <TId extends string, TValue>(input: {
  id: TId
  previous: TValue | undefined
  next: TValue | undefined
  equal: (left: TValue, right: TValue) => boolean
  geometryChanged: (previous: TValue, next: TValue) => boolean
  write(next: TValue | undefined): void
  entityDelta: IdDelta<TId>
  geometryDelta: Set<TId>
}): {
  changed: boolean
  geometryChanged: boolean
} => {
  if (input.next === undefined) {
    if (input.previous === undefined) {
      return {
        changed: false,
        geometryChanged: false
      }
    }

    input.write(undefined)
    idDelta.remove(input.entityDelta, input.id)
    input.geometryDelta.add(input.id)
    return {
      changed: true,
      geometryChanged: true
    }
  }

  if (input.previous === undefined) {
    input.write(input.next)
    idDelta.add(input.entityDelta, input.id)
    input.geometryDelta.add(input.id)
    return {
      changed: true,
      geometryChanged: true
    }
  }

  if (input.equal(input.previous, input.next)) {
    return {
      changed: false,
      geometryChanged: false
    }
  }

  input.write(input.next)
  idDelta.update(input.entityDelta, input.id)

  const geometryChanged = input.geometryChanged(input.previous, input.next)
  if (geometryChanged) {
    input.geometryDelta.add(input.id)
  }

  return {
    changed: true,
    geometryChanged
  }
}
