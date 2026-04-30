import { family } from '../../core/src/index'
import type { MutableFamilyState } from '../../core/src/index'
import { idDelta, type IdDelta } from '@shared/delta'

export const applyValue = <TValue,>(input: {
  previous: TValue
  next: TValue
  equal: (left: TValue, right: TValue) => boolean
  write(next: TValue): void
  writeDelta(changed: boolean): void
}): number => {
  const next = input.equal(input.previous, input.next)
    ? input.previous
    : input.next
  const changed = next !== input.previous

  input.write(next)
  input.writeDelta(changed)
  return changed ? 1 : 0
}

export const applyFamilyReset = <TId extends string, TValue>(input: {
  previous: MutableFamilyState<TId, TValue>
  ids: Iterable<TId>
  build: (id: TId, previous: TValue | undefined) => TValue | undefined
  equal: (left: TValue, right: TValue) => boolean
  write(next: MutableFamilyState<TId, TValue>): void
  writeDelta: (id: TId, previous: TValue | undefined, next: TValue | undefined) => void
}): number => {
  const next = family.createMutableState<TId, TValue>()
  let count = 0

  for (const id of input.ids) {
    const previousValue = input.previous.get(id)
    const nextCandidate = input.build(id, previousValue)
    if (!nextCandidate) {
      continue
    }

    const nextValue = previousValue && input.equal(previousValue, nextCandidate)
      ? previousValue
      : nextCandidate
    next.set(id, nextValue)
    input.writeDelta(id, previousValue, nextValue)
    if (previousValue !== nextValue) {
      count += 1
    }
  }

  input.previous.forEach((previousValue, id) => {
    if (next.has(id)) {
      return
    }

    input.writeDelta(id, previousValue, undefined)
    count += 1
  })

  input.write(next)
  return count
}

export const applyFamilyTouched = <TId extends string, TValue>(input: {
  state: MutableFamilyState<TId, TValue>
  ids: Iterable<TId>
  build: (id: TId, previous: TValue | undefined) => TValue | undefined
  equal: (left: TValue, right: TValue) => boolean
  writeDelta: (id: TId, previous: TValue | undefined, next: TValue | undefined) => void
}): number => {
  let count = 0

  for (const id of input.ids) {
    const previousValue = input.state.get(id)
    const nextCandidate = input.build(id, previousValue)
    const nextValue = previousValue && nextCandidate && input.equal(previousValue, nextCandidate)
      ? previousValue
      : nextCandidate

    if (!nextValue) {
      if (previousValue !== undefined) {
        input.state.delete(id)
        input.writeDelta(id, previousValue, undefined)
        count += 1
      }
      continue
    }

    input.state.set(id, nextValue)
    input.writeDelta(id, previousValue, nextValue)
    if (previousValue !== nextValue) {
      count += 1
    }
  }

  return count
}

export const applyEntity = <TId extends string, TValue>(input: {
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
