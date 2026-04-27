import { idDelta, type IdDelta } from './idDelta'

export type ChangeFieldSpec = 'flag' | 'ids' | 'set'

export type ChangeSchema<TState extends object> = {
  [K in keyof TState]:
    TState[K] extends boolean
      ? 'flag'
      : TState[K] extends IdDelta<any>
        ? 'ids'
        : TState[K] extends ReadonlySet<any>
          ? 'set'
          : TState[K] extends Record<string, unknown>
            ? ChangeSchema<TState[K]>
            : never
}

interface ChangeSchemaObject {
  [key: string]: ChangeSchemaValue
}

type ChangeSchemaValue =
  | ChangeFieldSpec
  | ChangeSchemaObject

const isLeafField = (
  field: ChangeSchemaValue
): field is ChangeFieldSpec => (
  field === 'flag'
  || field === 'ids'
  || field === 'set'
)

const cloneIds = <TId extends string>(
  delta: IdDelta<TId>
): IdDelta<TId> => ({
  added: new Set(delta.added),
  updated: new Set(delta.updated),
  removed: new Set(delta.removed)
})

const mergeIds = <TId extends string>(
  target: IdDelta<TId>,
  source: IdDelta<TId>
) => {
  source.added.forEach((id) => {
    target.added.add(id)
  })
  source.updated.forEach((id) => {
    target.updated.add(id)
  })
  source.removed.forEach((id) => {
    target.removed.add(id)
  })
}

const hasIds = <TId extends string>(
  delta: IdDelta<TId>
): boolean => (
  delta.added.size > 0
  || delta.updated.size > 0
  || delta.removed.size > 0
)

const createFieldState = (
  field: ChangeSchemaValue
): unknown => {
  if (isLeafField(field)) {
    switch (field) {
      case 'flag':
        return false
      case 'ids':
        return idDelta.create<string>()
      case 'set':
        return new Set()
    }
  }

  const next: Record<string, unknown> = {}
  Object.entries(field).forEach(([key, child]) => {
    next[key] = createFieldState(child)
  })
  return next
}

const cloneFieldState = (
  field: ChangeSchemaValue,
  state: unknown
): unknown => {
  if (isLeafField(field)) {
    switch (field) {
      case 'flag':
        return state
      case 'ids':
        return cloneIds(state as IdDelta<string>)
      case 'set':
        return new Set(state as ReadonlySet<unknown>)
    }
  }

  const current = state as Record<string, unknown>
  const next: Record<string, unknown> = {}
  Object.entries(field).forEach(([key, child]) => {
    next[key] = cloneFieldState(child, current[key])
  })
  return next
}

const resetFieldState = (
  field: ChangeSchemaValue,
  state: unknown
) => {
  if (isLeafField(field)) {
    switch (field) {
      case 'flag':
        return false
      case 'ids':
        idDelta.reset(state as IdDelta<string>)
        return state
      case 'set':
        ;(state as Set<unknown>).clear()
        return state
    }
  }

  const current = state as Record<string, unknown>
  Object.entries(field).forEach(([key, child]) => {
    const next = resetFieldState(child, current[key])
    if (child === 'flag') {
      current[key] = next
    }
  })

  return state
}

const mergeFieldState = (
  field: ChangeSchemaValue,
  target: unknown,
  source: unknown
) => {
  if (isLeafField(field)) {
    switch (field) {
      case 'flag':
        return Boolean(target) || Boolean(source)
      case 'ids':
        mergeIds(
          target as IdDelta<string>,
          source as IdDelta<string>
        )
        return target
      case 'set':
        ;(source as ReadonlySet<unknown>).forEach((value) => {
          ;(target as Set<unknown>).add(value)
        })
        return target
    }
  }

  const currentTarget = target as Record<string, unknown>
  const currentSource = source as Record<string, unknown>
  Object.entries(field).forEach(([key, child]) => {
    const next = mergeFieldState(
      child,
      currentTarget[key],
      currentSource[key]
    )
    if (child === 'flag') {
      currentTarget[key] = next
    }
  })
  return target
}

const hasFieldState = (
  field: ChangeSchemaValue,
  state: unknown
): boolean => {
  if (isLeafField(field)) {
    switch (field) {
      case 'flag':
        return Boolean(state)
      case 'ids':
        return hasIds(state as IdDelta<string>)
      case 'set':
        return (state as ReadonlySet<unknown>).size > 0
    }
  }

  return Object.entries(field).some(([key, child]) => (
    hasFieldState(child, (state as Record<string, unknown>)[key])
  ))
}

export const createChangeState = <TState extends object>(
  schema: ChangeSchema<TState>
): TState => createFieldState(schema as ChangeSchemaValue) as TState

export const cloneChangeState = <TState extends object>(
  schema: ChangeSchema<TState>,
  state: TState
): TState => cloneFieldState(schema as ChangeSchemaValue, state) as TState

export const mergeChangeState = <TState extends object>(
  schema: ChangeSchema<TState>,
  target: TState,
  source: TState
) => {
  mergeFieldState(schema as ChangeSchemaValue, target, source)
}

export const takeChangeState = <TState extends object>(
  schema: ChangeSchema<TState>,
  state: TState
): TState => {
  const current = cloneChangeState(schema, state)
  resetFieldState(schema as ChangeSchemaValue, state)
  return current
}

export const hasChangeState = <TState extends object>(
  schema: ChangeSchema<TState>,
  state: TState
): boolean => hasFieldState(schema as ChangeSchemaValue, state)
